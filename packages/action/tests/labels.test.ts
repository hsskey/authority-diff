import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { createClassifier } from '../index.ts';
import type { ClassifyToolCall, ToolCall } from '../schema.ts';
import corpus from '../../../tests/corpus/labels.json' with { type: 'json' };

// C1 classifier benchmark (design 36.3): precision and recall against the
// human-authored label corpus, measured at the capability/targetKind pair
// granularity and grouped by capability, plus the analyzability `none` rate.
// The report at docs/evidence/classifier-benchmark.md is generated from the
// breakdown this test writes to .local; floors here guard against regression.

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
    gitBranch: 'feature',
    repoRemotes: { origin: 'git@github.com:acme/toolkit.git' },
    ...input,
  };
}

interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

interface Benchmark {
  byCapability: Record<string, Counts>;
  overall: Counts;
  noneOps: number;
  totalOps: number;
  mismatches: { name: string; miss: string[]; extra: string[] }[];
}

function measure(): Benchmark {
  const byCapability: Record<string, Counts> = {};
  const bump = (cap: string, key: keyof Counts) => {
    const counts = (byCapability[cap] ??= { tp: 0, fp: 0, fn: 0 });
    counts[key] += 1;
  };
  const overall: Counts = { tp: 0, fp: 0, fn: 0 };
  const mismatches: Benchmark['mismatches'] = [];
  let noneOps = 0;
  let totalOps = 0;

  for (const testCase of corpus.cases) {
    const ops = classify(toToolCall(testCase.input));
    totalOps += ops.length;
    noneOps += ops.filter((o) => o.analyzability === 'none').length;

    const predicted = new Set(ops.map((o) => `${o.capability}/${o.target.kind}`));
    const gold = new Set(testCase.expect.map((g) => `${g.capability}/${g.targetKind}`));

    const miss: string[] = [];
    const extra: string[] = [];
    for (const pair of gold) {
      const cap = pair.split('/')[0] ?? pair;
      if (predicted.has(pair)) {
        bump(cap, 'tp');
        overall.tp += 1;
      } else {
        bump(cap, 'fn');
        overall.fn += 1;
        miss.push(pair);
      }
    }
    for (const pair of predicted) {
      if (!gold.has(pair)) {
        const cap = pair.split('/')[0] ?? pair;
        bump(cap, 'fp');
        overall.fp += 1;
        extra.push(pair);
      }
    }
    if (miss.length > 0 || extra.length > 0) {
      mismatches.push({ name: testCase.name, miss, extra });
    }
  }
  return { byCapability, overall, noneOps, totalOps, mismatches };
}

const precision = ({ tp, fp }: Counts): number => (tp + fp === 0 ? 1 : tp / (tp + fp));
const recall = ({ tp, fn }: Counts): number => (tp + fn === 0 ? 1 : tp / (tp + fn));

describe('classifier benchmark', () => {
  test('label corpus has exactly 100 entries', () => {
    expect(corpus.cases.length).toBe(100);
  });

  test('every entry carries at least one gold label', () => {
    const empty = corpus.cases.filter((c) => c.expect.length === 0).map((c) => c.name);
    expect(empty).toEqual([]);
  });

  test('overall precision and recall clear the regression floor', () => {
    const { overall, noneOps, totalOps, byCapability, mismatches } = measure();

    const report = {
      classifierVersion: '0.2.0',
      corpusSize: corpus.cases.length,
      overall: {
        precision: precision(overall),
        recall: recall(overall),
        ...overall,
      },
      noneRate: totalOps === 0 ? 0 : noneOps / totalOps,
      byCapability: Object.fromEntries(
        Object.entries(byCapability).map(([cap, counts]) => [
          cap,
          { precision: precision(counts), recall: recall(counts), ...counts },
        ]),
      ),
      mismatches,
    };
    mkdirSync(join(repoRoot, '.local'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.local', 'classifier-benchmark.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );

    expect(precision(overall)).toBeGreaterThanOrEqual(0.9);
    expect(recall(overall)).toBeGreaterThanOrEqual(0.9);
  });

  test('analyzability none rate stays low on the analyzable corpus', () => {
    const { noneOps, totalOps } = measure();
    expect(noneOps / totalOps).toBeLessThanOrEqual(0.1);
  });
});
