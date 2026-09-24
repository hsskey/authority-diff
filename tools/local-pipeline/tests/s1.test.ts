import { describe, expect, it } from 'vitest';
import { computeDiff } from '@authority/replay/diff';
import { DEFAULT_POLICY_DOCUMENT } from '@authority/policy/evaluate';
import {
  collectS1Actions,
  generateS1Actions,
  principalId,
  takeActions,
  windowByDays,
} from '../../../tests/workloads/generate-s1.ts';
import {
  ASK_DENY_ARCHETYPES,
  ALLOW_ARCHETYPES,
  EXCLUDED_ARCHETYPE,
  S1_ARCHETYPES,
  S1_DAY_COUNT,
  S1_PRINCIPAL_COUNT,
} from '../../../tests/workloads/s1-seed.ts';
import { measureReplayWindows, unknownRemoteFetchAllow } from '../lib/s1-measure.ts';

const SMALL: {
  readonly principalCount: number;
  readonly dayCount: number;
  readonly actionCount: number;
  readonly seed: number;
} = {
  principalCount: S1_PRINCIPAL_COUNT,
  dayCount: S1_DAY_COUNT,
  actionCount: 1_200,
  seed: 1,
};

describe('S1 seed', () => {
  it('locks the published R1 Action counts as sampler weights', () => {
    const askDeny = ASK_DENY_ARCHETYPES.reduce((sum, row) => sum + row.weight, 0);
    const allow = ALLOW_ARCHETYPES.reduce((sum, row) => sum + row.weight, 0);
    expect([askDeny, allow, EXCLUDED_ARCHETYPE.weight]).toEqual([16_981, 17_509, 450]);
    expect(S1_ARCHETYPES.reduce((sum, row) => sum + row.weight, 0)).toBe(34_940);
  });
});

describe('generateS1Actions', () => {
  it('yields one Action per requested count across 40 Principals and 30 days', () => {
    const actions = collectS1Actions(SMALL);
    const principals = new Set(actions.map((action) => action.sessionExternalId.slice(0, 12)));
    const days = new Set(actions.map((action) => action.occurredAt.slice(0, 10)));
    expect(actions).toHaveLength(1_200);
    expect(principals.size).toBe(S1_PRINCIPAL_COUNT);
    expect(days.size).toBe(S1_DAY_COUNT);
    expect([...principals][0]).toBe(principalId(0));
  });

  it('is deterministic for a seed and diverges when the seed changes', () => {
    const first = collectS1Actions(SMALL).map((action) => action.actionKey);
    const again = collectS1Actions(SMALL).map((action) => action.actionKey);
    const other = collectS1Actions({ ...SMALL, seed: 2 }).map((action) => action.actionKey);
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('lets a caller take a prefix without materializing the full S1 volume', () => {
    const prefix = takeActions(generateS1Actions(), 10);
    expect(prefix).toHaveLength(10);
    expect(prefix[0]?.sessionExternalId.startsWith('principal-00/')).toBe(true);
  });

  it('keeps analyzability none within three points of the published R1 share', () => {
    const actions = collectS1Actions({ ...SMALL, actionCount: 5_000 });
    const evaluated = actions.filter((action) => action.operations.length > 0);
    const none = evaluated.filter((action) =>
      action.operations.some((operation) => operation.analyzability === 'none'),
    );
    const share = none.length / evaluated.length;
    expect(share).toBeGreaterThan(0.169);
    expect(share).toBeLessThan(0.229);
  });

  it('cuts a 1-day window to the first day of the span', () => {
    const actions = collectS1Actions(SMALL);
    const day1 = windowByDays(actions, 1);
    expect(day1.length).toBe(40);
    expect(day1.every((action) => action.occurredAt.startsWith('2026-01-01'))).toBe(true);
  });
});

describe('measureReplayWindows', () => {
  it('reports one row per window with a stable resultHash', () => {
    const options = { ...SMALL, actionCount: 240 };
    const first = measureReplayWindows([1, 3], options);
    const second = measureReplayWindows([1, 3], options);
    expect(first.map((row) => [row.windowDays, row.actionCount, row.resultHash])).toEqual(
      second.map((row) => [row.windowDays, row.actionCount, row.resultHash]),
    );
    expect(first.map((row) => row.windowDays)).toEqual([1, 3]);
    expect(first[0]?.actionCount).toBeLessThan(first[1]?.actionCount ?? 0);
  });

  it('changes unknown-remote fetch under the S1 candidate', () => {
    const actions = collectS1Actions({ ...SMALL, actionCount: 2_400 });
    const diff = computeDiff({
      actions,
      baseline: DEFAULT_POLICY_DOCUMENT,
      candidate: unknownRemoteFetchAllow(DEFAULT_POLICY_DOCUMENT),
    });
    expect(diff.stats.changedActions).toBeGreaterThan(0);
  });
});
