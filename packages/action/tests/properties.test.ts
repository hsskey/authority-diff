import fc from 'fast-check';
import { beforeAll, describe, expect, test } from 'vitest';
import { createClassifier, CONTROL_TOOL_NAMES } from '../index.ts';
import type { ClassifyToolCall, ToolCall } from '../schema.ts';

let classify: ClassifyToolCall;
beforeAll(async () => {
  classify = await createClassifier();
});

const controlSet = new Set(CONTROL_TOOL_NAMES);

function toolCall(toolName: string, input: string, truncated: boolean): ToolCall {
  return {
    toolUseId: null,
    toolName,
    toolInputRedacted: input.slice(0, 16000),
    isInputTruncated: truncated,
    workspaceRoot: '/work/repo',
    gitBranch: 'main',
    repoRemotes: { origin: 'git@github.com:acme/toolkit.git' },
  };
}

describe('I4 classifier invariants', () => {
  test('never throws on an arbitrary Bash command', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (command) => {
        expect(() => classify(toolCall('Bash', command, false))).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  test('never throws on an arbitrary tool name and input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.string({ maxLength: 400 }), (name, input) => {
        expect(() => classify(toolCall(name, input, false))).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  test('a tool not in CONTROL_TOOL_NAMES yields at least one Operation', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 60 }).filter((n) => !controlSet.has(n)),
        fc.string({ maxLength: 400 }),
        (name, input) => {
          expect(classify(toolCall(name, input, false)).length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('truncated input always yields at least one none Operation', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.string({ maxLength: 400 }), (name, input) => {
        const ops = classify(toolCall(name, input, true));
        expect(ops.some((o) => o.analyzability === 'none')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('classification is deterministic', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 60 }),
        fc.string({ maxLength: 400 }),
        fc.boolean(),
        (name, input, truncated) => {
          const first = classify(toolCall(name, input, truncated));
          const second = classify(toolCall(name, input, truncated));
          expect(second).toEqual(first);
        },
      ),
      { numRuns: 200 },
    );
  });

  test('unrecognized programs are never laundered into read', () => {
    // A random program name is almost never a recognized reader; assert that an
    // opaque command never produces a read Operation.
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9_-]{3,15}$/).filter((p) => !RECOGNIZED.has(p)),
        (program) => {
          const ops = classify(toolCall('Bash', `${program} --do-something arg`, false));
          expect(ops.every((o) => o.capability !== 'read')).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// A small set of recognized program names to exclude from the laundering probe.
const RECOGNIZED = new Set([
  'cat',
  'grep',
  'less',
  'more',
  'sort',
  'uniq',
  'head',
  'tail',
  'base',
  'echo',
  'true',
  'test',
  'find',
  'curl',
  'wget',
  'make',
  'node',
  'ruby',
  'perl',
  'bash',
  'sudo',
  'time',
  'nice',
  'exec',
  'env',
  'file',
  'stat',
  'diff',
  'tree',
  'date',
]);

const SHELL_KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'for',
  'while',
  'do',
  'done',
  'case',
  'esac',
  'function',
  'in',
  'select',
  'until',
  'time',
  'coproc',
]);

describe('redirect write capture is independent of program recognition', () => {
  test('appending > <path> to a simple command always yields a write on that path', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9]{2,12}$/).filter((p) => !SHELL_KEYWORDS.has(p)),
        fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,20}$/),
        fc.boolean(),
        (program, base, piped) => {
          const path = `/tmp/${base}`;
          const command = piped ? `cat input | ${program} > ${path}` : `${program} arg > ${path}`;
          const ops = classify(toolCall('Bash', command, false));
          const hasWrite = ops.some(
            (o) => o.capability === 'write' && o.target.kind === 'path' && o.target.path === path,
          );
          expect(hasWrite).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});
