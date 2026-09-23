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

type Required = CorpusCase['mustInclude'][number];

function remoteKeyOf(op: Operation): string | null | undefined {
  return op.target.kind === 'vcs_remote' ? op.target.remoteKey : undefined;
}

function includes(ops: readonly Operation[], required: Required): boolean {
  return ops.some(
    (o) =>
      o.capability === required.capability &&
      o.target.kind === required.targetKind &&
      (!('remoteKey' in required) || remoteKeyOf(o) === required.remoteKey),
  );
}

function expectMustInclude(testCase: CorpusCase): void {
  const ops = classify(toToolCall(testCase.input));
  for (const required of testCase.mustInclude) {
    expect(includes(ops, required)).toBe(true);
  }
}

const activeCases = corpus.cases.filter((c) => !('skip' in c));
const skippedCases = corpus.cases.filter((c) => 'skip' in c);

describe('adversarial corpus', () => {
  test('corpus has at least 30 synthetic cases', () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(30);
  });

  test.each(activeCases.map((c) => [c.name, c] as const))(
    '%s satisfies mustInclude',
    (_name, testCase) => expectMustInclude(testCase),
  );

  test.skip.each(skippedCases.map((c) => [c.name, c] as const))(
    '%s satisfies mustInclude (known classifier miss)',
    (_name, testCase) => expectMustInclude(testCase),
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
