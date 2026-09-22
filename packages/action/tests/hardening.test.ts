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
