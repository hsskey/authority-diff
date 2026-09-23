import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import type { Target } from '@authority/action/schema';
import { ActionForReplaySchema, type ActionForReplay } from '@authority/trace/schema';
import { PolicyDocumentSchema, type PolicyDocument } from '@authority/policy/schema';
import {
  DiffResultSchema,
  ReplayRunSchema,
  StoredChangedActionSchema,
  StoredDiffGroupSchema,
  type ComputeDiff,
  type DeriveTargetKey,
  type DiffResult,
} from '../schema.ts';
import actionFixture from '../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import baselineFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidateFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };

const validDiffResult = {
  stats: {
    totalActions: 3,
    evaluatedActions: 3,
    excludedActions: 0,
    changedActions: 1,
    transitions: [
      { from: 'allow', to: 'allow', count: 0 },
      { from: 'allow', to: 'ask', count: 0 },
      { from: 'allow', to: 'deny', count: 0 },
      { from: 'ask', to: 'allow', count: 1 },
      { from: 'ask', to: 'ask', count: 2 },
      { from: 'ask', to: 'deny', count: 0 },
      { from: 'deny', to: 'allow', count: 0 },
      { from: 'deny', to: 'ask', count: 0 },
      { from: 'deny', to: 'deny', count: 0 },
    ],
    operationWidening: [],
  },
  groups: [
    {
      groupKey: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      direction: 'widening',
      fromEffect: 'ask',
      toEffect: 'allow',
      capability: 'push',
      fromZone: 'unknown_remote',
      toZone: 'trusted_remote',
      program: 'git',
      severity: 'critical',
      actionCount: 1,
      sessionCount: 1,
      analyzabilityNoneCount: 0,
      firstOccurredAt: '2026-01-02T03:04:06.007Z',
      lastOccurredAt: '2026-01-02T03:04:06.007Z',
      baselineRuleIds: ['push_policy'],
      candidateRuleIds: ['push_policy'],
      targetSummary: [{ key: 'example.invalid/synthetic/project', count: 1 }],
      headline: 'Synthetic remote publication changes from ask to allow.',
      sampleActionKeys: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
    },
  ],
  changedActions: [
    {
      actionKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      groupKey: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      fromEffect: 'ask',
      toEffect: 'allow',
    },
  ],
  resultHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
};

describe('replay schema', () => {
  test('accepts the shared synthetic pipeline fixtures and Diff Result', () => {
    expect([
      z.array(ActionForReplaySchema).safeParse(actionFixture).success,
      PolicyDocumentSchema.safeParse(baselineFixture).success,
      PolicyDocumentSchema.safeParse(candidateFixture).success,
      DiffResultSchema.safeParse(validDiffResult).success,
    ]).toEqual([true, true, true, true]);
  });

  test('operationWidening defaults to empty when omitted from stored stats', () => {
    const { operationWidening: _omitted, ...statsWithout } = validDiffResult.stats;
    expect(
      DiffResultSchema.parse({ ...validDiffResult, stats: statsWithout }).stats.operationWidening,
    ).toEqual([]);
  });

  test('rejects a Diff Group with 11 sample Action Keys', () => {
    const sampleActionKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(
      DiffResultSchema.safeParse({
        ...validDiffResult,
        groups: [
          {
            ...validDiffResult.groups[0],
            sampleActionKeys: [
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
              sampleActionKey,
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('exports replay contract signatures', () => {
    expectTypeOf<DeriveTargetKey>().toEqualTypeOf<(target: Target) => string>();
    expectTypeOf<ComputeDiff>().toEqualTypeOf<
      (input: {
        readonly actions: readonly ActionForReplay[];
        readonly baseline: PolicyDocument;
        readonly candidate: PolicyDocument;
      }) => DiffResult
    >();
  });
});

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const HASH = 'a'.repeat(64);
const TS = '2026-01-02T03:04:05.006Z';

describe('replay storage schema round-trip', () => {
  test('accepts a completed Replay Run', () => {
    const value = {
      id: `rpl_${ULID}`,
      kind: 'version_diff',
      baselineVersionId: `pver_${ULID}`,
      candidateVersionId: `pver_${ULID}`,
      windowFrom: TS,
      windowTo: TS,
      status: 'completed',
      classifierVersion: 'c1',
      inputsHash: HASH,
      resultHash: HASH,
      stats: validDiffResult.stats,
      errorCode: null,
      createdAt: TS,
      startedAt: TS,
      completedAt: TS,
    };
    expect(ReplayRunSchema.parse(value)).toEqual(value);
  });

  test('accepts a stored Diff Group and changed Action tied to a run', () => {
    const storedGroup = {
      ...validDiffResult.groups[0],
      replayRunId: `rpl_${ULID}`,
    };
    expect(StoredDiffGroupSchema.parse(storedGroup)).toEqual(storedGroup);

    const changed = {
      replayRunId: `rpl_${ULID}`,
      actionKey: HASH,
      groupKey: validDiffResult.groups[0]?.groupKey,
      fromEffect: 'ask',
      toEffect: 'allow',
    };
    expect(StoredChangedActionSchema.parse(changed)).toEqual(changed);
  });
});
