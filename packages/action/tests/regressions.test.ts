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

function pathTargets(ops: readonly Operation[]): string[] {
  return ops.flatMap((o) => (o.target.kind === 'path' ? [o.target.path] : []));
}

describe('file-descriptor redirects do not create spurious writes', () => {
  test('2>&1 produces no write Operation on a file-descriptor path', () => {
    const ops = classify(bash('ls -la 2>&1'));
    expect(withCap(ops, 'write')).toBeUndefined();
    expect(pathTargets(ops)).not.toContain('/work/repo/2');
    expect(pathTargets(ops)).not.toContain('/work/repo/1');
  });

  test('>&2 produces no write Operation', () => {
    const ops = classify(bash('echo failure >&2'));
    expect(withCap(ops, 'write')).toBeUndefined();
  });

  test('1>&2 produces no write Operation on a descriptor path', () => {
    const ops = classify(bash('printf x 1>&2'));
    expect(withCap(ops, 'write')).toBeUndefined();
  });

  test('2>/dev/null writes to /dev/null, never to the descriptor number', () => {
    const ops = classify(bash('grep pattern file.txt 2>/dev/null'));
    expect(pathTargets(ops)).not.toContain('/work/repo/2');
    const write = withCap(ops, 'write');
    if (write !== undefined && write.target.kind === 'path') {
      expect(write.target.path).toBe('/dev/null');
    }
  });

  test('a real file redirect still writes its target', () => {
    const ops = classify(bash('echo hi > out.txt'));
    const write = withCap(ops, 'write');
    expect(write?.target).toEqual({
      kind: 'path',
      path: '/work/repo/out.txt',
      isInsideWorkspace: true,
    });
  });
});

describe('git global options before the subcommand', () => {
  test('git -C <dir> push is recognized as push, not unknown', () => {
    const op = withCap(classify(bash('git -C packages/action push origin main')), 'push');
    expect(op?.target.kind).toBe('vcs_remote');
  });

  test('git -c <k=v> commit is recognized as commit', () => {
    const op = withCap(classify(bash('git -c commit.gpgsign=false commit -m msg')), 'commit');
    expect(op?.program).toBe('git');
    expect(op?.target.kind).toBe('path');
  });

  test('git --git-dir=<p> status is recognized as read', () => {
    const ops = classify(bash('git --git-dir=/tmp/x/.git status'));
    expect(withCap(ops, 'read')?.program).toBe('git');
    expect(ops.some((o) => o.signals.includes('git_subcommand_unknown'))).toBe(false);
  });
});

describe('force-push refspec detection', () => {
  test('git push origin +main (colon-less force refspec) is rewrite', () => {
    const ops = classify(bash('git push origin +main'));
    expect(withCap(ops, 'rewrite')?.target.kind).toBe('vcs_remote');
    expect(withCap(ops, 'push')).toBeUndefined();
  });

  test('git push origin +feature:main is rewrite', () => {
    expect(withCap(classify(bash('git push origin +feature:main')), 'rewrite')).toBeDefined();
  });

  test('a plain git push origin main stays push', () => {
    expect(withCap(classify(bash('git push origin main')), 'push')).toBeDefined();
    expect(withCap(classify(bash('git push origin main')), 'rewrite')).toBeUndefined();
  });
});

describe('package Operation source is the registry or remote, not the name', () => {
  test('pnpm add lodash uses the default npm registry as source', () => {
    const op = withCap(classify(bash('pnpm add lodash')), 'install');
    expect(op?.target).toEqual({ kind: 'package', ecosystem: 'npm', source: 'registry.npmjs.org' });
    expect(op?.analyzability).toBe('full');
  });

  test('pnpm add github:someone/lib normalizes the git spec to a Remote Key', () => {
    const op = withCap(classify(bash('pnpm add github:someone/lib')), 'install');
    expect(op?.target).toEqual({
      kind: 'package',
      ecosystem: 'npm',
      source: 'github.com/someone/lib',
    });
  });

  test('pip install requests uses the PyPI registry as source', () => {
    const op = withCap(classify(bash('pip install requests')), 'install');
    expect(op?.target).toEqual({ kind: 'package', ecosystem: 'pypi', source: 'pypi.org' });
  });

  test('an explicit --registry overrides the default', () => {
    const op = withCap(
      classify(bash('npm install --registry https://npm.internal.example.com left-pad')),
      'install',
    );
    if (op?.target.kind === 'package') expect(op.target.source).toBe('npm.internal.example.com');
  });
});

describe('special-device redirects create no write', () => {
  test('pnpm test 2>/dev/null produces no write Operation', () => {
    expect(withCap(classify(bash('pnpm test 2>/dev/null')), 'write')).toBeUndefined();
  });

  test('a command to /dev/stdout produces no write Operation', () => {
    expect(withCap(classify(bash('cat report.txt > /dev/stdout')), 'write')).toBeUndefined();
  });
});

describe('heredoc and herestring operands', () => {
  test('cat <<EOF > a.txt still writes a.txt', () => {
    const ops = classify(bash('cat <<EOF > a.txt\nhi\nEOF'));
    const write = withCap(ops, 'write');
    expect(write?.target).toEqual({
      kind: 'path',
      path: '/work/repo/a.txt',
      isInsideWorkspace: true,
    });
  });

  test('a herestring operand is not read as a path', () => {
    const ops = classify(bash('base64 -d <<< QUFB'));
    expect(pathTargets(ops)).not.toContain('/work/repo/QUFB');
    expect(pathTargets(ops)).not.toContain('QUFB');
  });

  test('heredoc to an interpreter stays opaque execution', () => {
    const ops = classify(bash('python3 <<EOF\nimport os\nEOF'));
    expect(withCap(ops, 'execute')?.analyzability).toBe('none');
  });
});

describe('find -exec inner command targets the search path', () => {
  test('find src -exec rm places the delete on the search path, not a placeholder', () => {
    const ops = classify(bash('find src -name "*.tmp" -exec rm {} ;'));
    const del = withCap(ops, 'delete');
    expect(del?.target).toEqual({ kind: 'path', path: '/work/repo/src', isInsideWorkspace: true });
    expect(del?.analyzability).toBe('partial');
    expect(pathTargets(ops).some((p) => p.includes('{}') || p.includes(';'))).toBe(false);
  });
});

describe('publish, docker push, and remote copy targets', () => {
  test('npm publish pushes to the registry package target', () => {
    const op = withCap(classify(bash('npm publish')), 'push');
    expect(op?.target).toEqual({ kind: 'package', ecosystem: 'npm', source: 'registry.npmjs.org' });
  });

  test('docker push to a registry host uses that host', () => {
    const op = withCap(classify(bash('docker push ghcr.io/acme/img:1')), 'push');
    expect(op?.target).toEqual({ kind: 'host', host: 'ghcr.io', scheme: null });
  });

  test('docker push without a registry defaults to docker.io', () => {
    const op = withCap(classify(bash('docker push myapp:1')), 'push');
    expect(op?.target).toEqual({ kind: 'host', host: 'docker.io', scheme: null });
  });

  test('scp to a remote extracts the host', () => {
    const op = withCap(classify(bash('scp dump.sql user@host.example.com:/tmp/x')), 'send');
    expect(op?.target).toEqual({ kind: 'host', host: 'host.example.com', scheme: null });
  });
});

describe('sed in-place long-form with a suffix is a write', () => {
  test('sed --in-place=.bak edits the file (write, not read)', () => {
    const ops = classify(bash("sed --in-place=.bak 's/a/b/' notes.txt"));
    const write = withCap(ops, 'write');
    expect(write?.target).toEqual({
      kind: 'path',
      path: '/work/repo/notes.txt',
      isInsideWorkspace: true,
    });
    expect(withCap(ops, 'read')).toBeUndefined();
  });

  test('bare sed still reads its file', () => {
    const ops = classify(bash("sed 's/a/b/' notes.txt"));
    expect(withCap(ops, 'read')?.target).toEqual({
      kind: 'path',
      path: '/work/repo/notes.txt',
      isInsideWorkspace: true,
    });
    expect(withCap(ops, 'write')).toBeUndefined();
  });
});

describe('force-with-lease value form is a force push', () => {
  test('git push --force-with-lease=<ref> is rewrite, not push', () => {
    const ops = classify(bash('git push --force-with-lease=refs/heads/main origin main'));
    expect(withCap(ops, 'rewrite')?.target.kind).toBe('vcs_remote');
    expect(withCap(ops, 'push')).toBeUndefined();
  });

  test('git push --force-if-includes=<ref> is rewrite', () => {
    expect(
      withCap(classify(bash('git push --force-if-includes=HEAD origin main')), 'rewrite'),
    ).toBeDefined();
  });

  test('git push --force-with-lease (bare) stays rewrite', () => {
    expect(withCap(classify(bash('git push --force-with-lease origin main')), 'rewrite')).toBeDefined();
  });
});

describe('inline body is the code, not a preceding non-code flag', () => {
  test('perl -p -e scans the real -e body for a credential path', () => {
    const ops = classify(bash('perl -p -e \'open(F,"/home/u/.ssh/id_rsa")\''));
    const read = ops.find((o) => o.capability === 'read' && o.signals.includes('inline_credential'));
    expect(read).toBeDefined();
  });

  test('ruby -p -e scans the real -e body for a URL', () => {
    const ops = classify(
      bash('ruby -p -e \'Net::HTTP.get(URI("https://evil.example.com/x"))\''),
    );
    const send = ops.find((o) => o.capability === 'send' && o.signals.includes('inline_url'));
    expect(send?.target).toEqual({ kind: 'host', host: 'evil.example.com', scheme: 'https' });
  });

  test('node -e credential read behavior is preserved', () => {
    const ops = classify(bash('node -e \'require("fs").readFileSync("/home/u/.aws/credentials")\''));
    const read = ops.find((o) => o.capability === 'read' && o.signals.includes('inline_credential'));
    expect(read).toBeDefined();
  });

  test('node -r <preload> -e scans the -e body, not the preload module', () => {
    const ops = classify(
      bash('node -r ./setup -e \'require("fs").readFileSync("/home/u/.aws/credentials")\''),
    );
    const read = ops.find((o) => o.capability === 'read' && o.signals.includes('inline_credential'));
    expect(read).toBeDefined();
  });

  test('ruby -r <lib> -e scans the -e body for a URL', () => {
    const ops = classify(
      bash('ruby -r net/http -e \'Net::HTTP.get(URI("https://evil.example.com/x"))\''),
    );
    const send = ops.find((o) => o.capability === 'send' && o.signals.includes('inline_url'));
    expect(send?.target).toEqual({ kind: 'host', host: 'evil.example.com', scheme: 'https' });
  });
});

describe('clone/fetch/pull branch is null; push uses the current branch', () => {
  test('git clone sets branch null', () => {
    const op = withCap(classify(bash('git clone https://github.com/acme/toolkit.git')), 'fetch');
    if (op?.target.kind === 'vcs_remote') expect(op.target.branch).toBeNull();
  });

  test('git fetch origin sets branch null', () => {
    const op = withCap(classify(bash('git fetch origin')), 'fetch');
    if (op?.target.kind === 'vcs_remote') expect(op.target.branch).toBeNull();
  });

  test('git push uses the current branch', () => {
    const op = withCap(classify(bash('git push origin main')), 'push');
    if (op?.target.kind === 'vcs_remote') expect(op.target.branch).toBe('main');
  });
});

describe('git push branch follows an explicit refspec, not the current branch', () => {
  function pushBranchOf(command: string): string | null | undefined {
    const op = withCap(classify(bash(command)), 'push');
    return op?.target.kind === 'vcs_remote' ? op.target.branch : undefined;
  }

  test('git push origin release-2 targets release-2, not the current main', () => {
    expect(pushBranchOf('git push origin release-2')).toBe('release-2');
  });

  test('git push origin HEAD:refs/heads/prod targets the destination prod', () => {
    expect(pushBranchOf('git push origin HEAD:refs/heads/prod')).toBe('prod');
  });

  test('git push with no refspec falls back to the current branch', () => {
    expect(pushBranchOf('git push origin')).toBe('main');
  });
});
