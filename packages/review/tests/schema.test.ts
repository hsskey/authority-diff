import { describe, expect, test } from 'vitest';
import {
  ChangeReviewSchema,
  GateBlockerCodeSchema,
  GateSchema,
  ReviewDecisionSchema,
  ReviewKindSchema,
  VerdictSchema,
} from '../schema.ts';

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const HASH = 'a'.repeat(64);
const TS = '2026-01-02T03:04:05.006Z';

function changeReview(overrides: Record<string, unknown> = {}) {
  return {
    id: `rev_${ULID}`,
    policyId: `pol_${ULID}`,
    kind: 'change',
    candidateVersionId: `pver_${ULID}`,
    candidateContentHash: HASH,
    baselineVersionId: `pver_${ULID}`,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: null,
    status: 'computing',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: TS,
    ...overrides,
  };
}

function reviewDecision(overrides: Record<string, unknown> = {}) {
  return {
    changeReviewId: `rev_${ULID}`,
    decision: 'accept',
    note: 'looks correct',
    reviewerName: 'reviewer',
    decidedAt: TS,
    baselineContentHash: HASH,
    candidateContentHash: HASH,
    replayInputsHash: HASH,
    replayResultHash: HASH,
    classifierVersion: 'c1',
    verdictSnapshot: [{ groupKey: HASH, verdict: 'expected' }],
    ...overrides,
  };
}

describe('review schema round-trip', () => {
  test('accepts a change review before a decision', () => {
    const value = changeReview();
    expect(ChangeReviewSchema.parse(value)).toEqual(value);
  });

  test('accepts an adoption review with a null baseline', () => {
    const value = changeReview({ kind: 'adoption', baselineVersionId: null });
    expect(ChangeReviewSchema.parse(value)).toEqual(value);
  });

  test('rejects a review without a kind or with an unknown kind', () => {
    const { kind: _kind, ...withoutKind } = changeReview();
    expect(ChangeReviewSchema.safeParse(withoutKind).success).toBe(false);
    expect(ChangeReviewSchema.safeParse(changeReview({ kind: 'rollout' })).success).toBe(false);
  });

  test('Review kind is change or adoption', () => {
    expect(ReviewKindSchema.options).toEqual(['change', 'adoption']);
  });

  test('a Gate blocker names one of the eight codes', () => {
    expect(GateBlockerCodeSchema.options).toEqual([
      'replay_incomplete',
      'replay_failed',
      'widening_unreviewed',
      'widening_investigate',
      'widening_unexpected',
      'adoption_unreviewed',
      'adoption_investigate',
      'adoption_unexpected',
    ]);
    expect(GateSchema.parse({ isOpen: true, blockers: [] })).toEqual({
      isOpen: true,
      blockers: [],
    });
    expect(
      GateSchema.safeParse({
        isOpen: false,
        blockers: [{ code: 'adoption_unreviewed', count: 2 }],
      }).success,
    ).toBe(true);
    expect(
      GateSchema.safeParse({ isOpen: false, blockers: [{ code: 'made_up', count: 1 }] }).success,
    ).toBe(false);
  });

  test('accepts a Review Decision with its evidence snapshot', () => {
    const value = reviewDecision();
    expect(ReviewDecisionSchema.parse(value)).toEqual(value);
  });

  test('accepts an adoption decision whose baselineContentHash is null', () => {
    const value = reviewDecision({ baselineContentHash: null });
    expect(ReviewDecisionSchema.parse(value)).toEqual(value);
  });

  test('Verdict is one of the three review verdicts', () => {
    expect(VerdictSchema.options).toEqual(['expected', 'investigate', 'unexpected']);
  });
});
