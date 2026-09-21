import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { createClassifier } from '../index.ts';
import type { ClassifyToolCall, Operation, ToolCall } from '../schema.ts';
import corpus from '../../../tests/corpus/adversarial.json' with { type: 'json' };

let classify: ClassifyToolCall;
beforeAll(async () => {
  classify = await createClassifier();
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type CorpusCase = (typeof corpus.cases)[number];

function toToolCall(input: CorpusCase['input']): ToolCall {
  return {
    toolUseId: 'synthetic',
    isInputTruncated: false,
    workspaceRoot: '/work/repo',
    gitBranch: 'main',
    repoRemotes: { origin: 'git@github.com:acme/toolkit.git' },
    ...input,
  };
}

function includes(ops: readonly Operation[], capability: string, targetKind: string): boolean {
  return ops.some((o) => o.capability === capability && o.target.kind === targetKind);
}

describe('adversarial corpus', () => {
  test('corpus has at least 30 synthetic cases', () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(30);
  });

  test.each(corpus.cases.map((c) => [c.name, c] as const))(
    '%s satisfies mustInclude',
    (_name, testCase) => {
      const ops = classify(toToolCall(testCase.input));
      for (const required of testCase.mustInclude) {
        expect(includes(ops, required.capability, required.targetKind)).toBe(true);
      }
    },
  );
});

describe('throughput', () => {
  test('classifies at least 2000 ToolCalls per second', () => {
    const calls = corpus.cases.map((c) => toToolCall(c.input));
    const iterations = 6000;
    for (let i = 0; i < 500; i++) runOne(calls, i);

    const start = performance.now();
    for (let i = 0; i < iterations; i++) runOne(calls, i);
    const elapsedSeconds = (performance.now() - start) / 1000;
    const perSecond = Math.round(iterations / elapsedSeconds);

    mkdirSync(join(repoRoot, '.local'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.local', 'classifier-throughput.txt'),
      `${perSecond} ToolCalls/s over ${iterations} iterations\n`,
    );

    expect(perSecond).toBeGreaterThanOrEqual(2000);
  });
});

function runOne(calls: readonly ToolCall[], i: number): void {
  const call = calls[i % calls.length];
  if (call !== undefined) classify(call);
}
