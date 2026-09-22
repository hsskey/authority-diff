import { describe, expect, test } from 'vitest';
import { ChangeReviewSchema, GateSchema, ReviewDecisionSchema, VerdictSchema } from '../schema.ts';

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const HASH = 'a'.repeat(64);
const TS = '2026-01-02T03:04:05.006Z';

describe('review schema round-trip', () => {
  test('accepts a Change Review before a decision', () => {
    const value = {
      id: `rev_${ULID}`,
      policyId: `pol_${ULID}`,
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
    };
    expect(ChangeReviewSchema.parse(value)).toEqual(value);
  });

  test('rejects a Gate blocker with an unknown code', () => {
    expect(GateSchema.parse({ isOpen: true, blockers: [] })).toEqual({
      isOpen: true,
      blockers: [],
    });
    expect(
      GateSchema.safeParse({
        isOpen: false,
        blockers: [{ code: 'widening_unreviewed', count: 2 }],
      }).success,
    ).toBe(true);
    expect(
      GateSchema.safeParse({ isOpen: false, blockers: [{ code: 'made_up', count: 1 }] }).success,
    ).toBe(false);
  });

  test('accepts a Review Decision with its evidence snapshot', () => {
    const value = {
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
    };
    expect(ReviewDecisionSchema.parse(value)).toEqual(value);
  });

  test('Verdict is one of the three review verdicts', () => {
    expect(VerdictSchema.options).toEqual(['expected', 'investigate', 'unexpected']);
  });
});
