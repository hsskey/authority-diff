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
