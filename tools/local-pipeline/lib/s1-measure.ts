import { performance } from 'node:perf_hooks';
import { DEFAULT_POLICY_DOCUMENT } from '@authority/policy/evaluate';
import type { PolicyDocument } from '@authority/policy/schema';
import { computeDiff } from '@authority/replay/diff';
import {
  collectS1Actions,
  S1_DEFAULTS,
  windowByDays,
  type GenerateS1Options,
} from '../../../tests/workloads/generate-s1.ts';
import { CHAPTER_17_US_PER_ACTION } from '../../../tests/workloads/s1-seed.ts';

export interface ReplayWindowMeasurement {
  readonly windowDays: number;
  readonly actionCount: number;
  readonly evaluatedActions: number;
  readonly changedActions: number;
  readonly elapsedMs: number;
  readonly usPerActionPerVersion: number;
  readonly chapter17UsPerAction: number;
  readonly chapter17EstimatedMs: number;
  readonly resultHash: string;
}

/** Gate 2 B shape: unknown-remote fetch becomes allow. */
export function unknownRemoteFetchAllow(baseline: PolicyDocument): PolicyDocument {
  return {
    ...baseline,
    rules: [
      ...baseline.rules,
      {
        ruleId: 'allow_unknown_remote_fetch',
        match: {
          capabilities: ['fetch'],
          zones: ['unknown_remote'],
          reversibility: null,
          analyzability: null,
        },
        effect: 'allow',
        rationale: 'Synthetic S1 candidate: fetch of an unknown remote is allow.',
      },
    ],
  };
}

export function measureReplayWindows(
  windowDays: readonly number[],
  options: GenerateS1Options = S1_DEFAULTS,
): readonly ReplayWindowMeasurement[] {
  const actions = collectS1Actions(options);
  const baseline = DEFAULT_POLICY_DOCUMENT;
  const candidate = unknownRemoteFetchAllow(baseline);
  return windowDays.map((days) => {
    const window = windowByDays(actions, days);
    const started = performance.now();
    const diff = computeDiff({ actions: window, baseline, candidate });
    const elapsedMs = performance.now() - started;
    const versions = 2;
    return {
      windowDays: days,
      actionCount: window.length,
      evaluatedActions: diff.stats.evaluatedActions,
      changedActions: diff.stats.changedActions,
      elapsedMs,
      usPerActionPerVersion:
        window.length === 0 ? 0 : (elapsedMs * 1000) / window.length / versions,
      chapter17UsPerAction: CHAPTER_17_US_PER_ACTION,
      chapter17EstimatedMs: (CHAPTER_17_US_PER_ACTION * versions * window.length) / 1000,
      resultHash: diff.resultHash,
    };
  });
}
