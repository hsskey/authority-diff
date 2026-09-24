import { beforeAll, describe, expect, test } from 'vitest';
import { createClassifier } from '../index.ts';
import type { ClassifyToolCall, Operation, ToolCall } from '../schema.ts';

let classify: ClassifyToolCall;
beforeAll(async () => {
  classify = await createClassifier();
});

function bash(command: string): ToolCall {
  return {
    toolUseId: 'synthetic',
    toolName: 'Bash',
    toolInputRedacted: command,
    isInputTruncated: false,
    workspaceRoot: '/work/repo',
    gitBranch: 'main',
    repoRemotes: { origin: 'git@github.com:acme/toolkit.git' },
  };
}

function withCap(ops: readonly Operation[], capability: string): Operation | undefined {
  return ops.find((o) => o.capability === capability);
}

describe('hardening round 1: expanded program table', () => {
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    ['corepack enable', 'execute', 'path'],
    ['corepack prepare pnpm@9 --activate', 'execute', 'path'],
    ['nvm use 20', 'execute', 'path'],
    ['volta install node', 'execute', 'path'],
    ['shasum -a 256 dist.tgz', 'read', 'path'],
    ['sysctl -a', 'read', 'path'],
    ['pgrep node', 'read', 'path'],
    ['read -r line', 'read', 'path'],
    ['break', 'read', 'path'],
    ['continue', 'read', 'path'],
    ['exit 0', 'read', 'path'],
    ['mktemp -d', 'write', 'path'],
    ['kill -9 1234', 'execute', 'path'],
    ['pkill node', 'execute', 'path'],
    ['killall node', 'execute', 'path'],
    ['sqlite3 app.db "DELETE FROM users"', 'execute', 'unknown'],
    ['psql -c "SELECT 1"', 'execute', 'unknown'],
    ['mysql -e "SELECT 1"', 'execute', 'unknown'],
    ['screen -dmS build', 'execute', 'unknown'],
    ['claude -p "summarize"', 'execute', 'unknown'],
    ['tmux send-keys "rm -rf build" Enter', 'execute', 'unknown'],
    ['eval "$(collect)"', 'execute', 'unknown'],
  ];

  test.each(rows)('%s -> %s on %s', (command, capability, targetKind) => {
    const op = withCap(classify(bash(command)), capability);
    expect(op).toBeDefined();
    expect(op?.target.kind).toBe(targetKind);
  });

  test('sqlite3 with inline SQL is opaque execution, never read', () => {
    const ops = classify(bash('sqlite3 app.db "DROP TABLE t"'));
    expect(withCap(ops, 'read')).toBeUndefined();
    expect(withCap(ops, 'execute')?.analyzability).toBe('none');
  });

  test('tmux send-keys hides an inner command as opaque execution, not read', () => {
    const ops = classify(bash("tmux send-keys 'rm -rf /tmp/x' Enter"));
    expect(withCap(ops, 'read')).toBeUndefined();
    expect(withCap(ops, 'execute')?.target.kind).toBe('unknown');
  });
});

describe('hardening round 1: expanded git subcommands', () => {
  const rows: ReadonlyArray<readonly [string, string, string]> = [
    ['git merge-base main feature', 'read', 'path'],
    ['git check-ignore build/', 'read', 'path'],
    ['git check-attr text -- f.txt', 'read', 'path'],
    ['git ls-tree HEAD', 'read', 'path'],
    ['git hash-object f.txt', 'read', 'path'],
    ['git show-ref --heads', 'read', 'path'],
    ['git merge-tree main feature', 'read', 'path'],
    ['git archive HEAD', 'read', 'path'],
    ['git ls-remote origin', 'fetch', 'vcs_remote'],
    ['git init', 'commit', 'path'],
    ['git commit-tree abc123 -m msg', 'commit', 'path'],
    ['git update-ref refs/heads/x HEAD', 'commit', 'path'],
    ['git format-patch main', 'commit', 'path'],
  ];

  test.each(rows)('%s -> %s on %s', (command, capability, targetKind) => {
    const op = withCap(classify(bash(command)), capability);
    expect(op).toBeDefined();
    expect(op?.target.kind).toBe(targetKind);
  });

  test('an unknown git plumbing subcommand stays execute/none, never read', () => {
    const ops = classify(bash('git cat-file-totally-made-up x'));
    expect(withCap(ops, 'read')).toBeUndefined();
    expect(withCap(ops, 'execute')?.signals).toContain('git_subcommand_unknown');
  });
});

describe('hardening round 4: path-form execute and command lookup', () => {
  test.each([
    ['./x.sh', '/work/repo/x.sh', 'x.sh'],
    ['bin/deploy.sh --dry', '/work/repo/bin/deploy.sh', 'deploy.sh'],
    ['~/bin/tool run', '~/bin/tool', 'tool'],
    ['/opt/dir/bin/tool', '/opt/dir/bin/tool', 'tool'],
  ] as const)('%s is execute on the named path, partial', (command, path, program) => {
    const op = withCap(classify(bash(command)), 'execute');
    expect(op?.target).toEqual({
      kind: 'path',
      path,
      isInsideWorkspace: path.startsWith('/work/'),
    });
    expect(op?.analyzability).toBe('partial');
    expect(op?.program).toBe(program);
    expect(op?.signals).toContain('script_by_path');
  });

  test.each(['"$DIR/tool" run', '$HOME/bin/tool'])('%s is execute unknown partial', (command) => {
    const op = withCap(classify(bash(command)), 'execute');
    expect(op?.target.kind).toBe('unknown');
    expect(op?.analyzability).toBe('partial');
    expect(op?.signals).toContain('script_by_variable_path');
  });

  test.each([
    ['bash tests/run.sh --fast', '/work/repo/tests/run.sh'],
    ['sh ./x.sh', '/work/repo/x.sh'],
    ['zsh ~/bin/tool', '~/bin/tool'],
  ] as const)('%s is execute on the script path, partial', (command, path) => {
    const op = withCap(classify(bash(command)), 'execute');
    expect(op?.target).toEqual({
      kind: 'path',
      path,
      isInsideWorkspace: path.startsWith('/work/'),
    });
    expect(op?.analyzability).toBe('partial');
    expect(op?.signals).toContain('script_by_path');
  });

  test.each(['bash -s', 'bash --version', 'sh'])('%s stays opaque inline execution', (command) => {
    const exec = classify(bash(command)).find((o) => o.program === 'bash' || o.program === 'sh');
    expect(exec?.capability).toBe('execute');
    expect(exec?.target.kind).toBe('unknown');
    expect(exec?.analyzability).toBe('none');
    expect(exec?.signals).toContain('inline_code');
  });

  test('bash -c string is re-parsed rather than treated as a script file', () => {
    expect(withCap(classify(bash('bash -c "echo hi"')), 'read')?.program).toBe('echo');
  });

  test.each(['command -v node', 'command -V ls', 'command -pv npm', 'type node', 'which node'])(
    '%s is read/full and does not run the looked-up name',
    (command) => {
      const ops = classify(bash(command));
      const op = withCap(ops, 'read');
      expect(op?.analyzability).toBe('full');
      expect(op?.target.kind).toBe('path');
      expect(withCap(ops, 'execute')).toBeUndefined();
      expect(withCap(ops, 'install')).toBeUndefined();
      expect(withCap(ops, 'fetch')).toBeUndefined();
    },
  );

  test('command without -v still classifies the inner program', () => {
    const op = withCap(classify(bash('command ls src')), 'read');
    expect(op?.program).toBe('ls');
    expect(op?.target.kind).toBe('path');
  });

  test('$CMD --help stays execute/none, never read', () => {
    const ops = classify(bash('$CMD --help'));
    expect(withCap(ops, 'read')).toBeUndefined();
    const op = withCap(ops, 'execute');
    expect(op?.target.kind).toBe('unknown');
    expect(op?.analyzability).toBe('none');
  });

  test('a recognized basename on a path keeps its table capability', () => {
    const op = withCap(classify(bash('/usr/bin/cat notes.txt')), 'read');
    expect(op?.program).toBe('cat');
    expect(op?.target).toEqual({
      kind: 'path',
      path: '/work/repo/notes.txt',
      isInsideWorkspace: true,
    });
  });
});
