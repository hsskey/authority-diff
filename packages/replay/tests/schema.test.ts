import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import type { Target } from '@authority/action/schema';
import { ActionForReplaySchema, type ActionForReplay } from '@authority/trace/schema';
import { PolicyDocumentSchema, type PolicyDocument } from '@authority/policy/schema';
import {
  AdoptionResultSchema,
  DiffResultSchema,
  ReplayRunSchema,
  StoredAdoptionAssignmentSchema,
  StoredAdoptionGroupSchema,
  StoredChangedActionSchema,
  StoredDiffGroupSchema,
  type AdoptionResult,
  type ComputeAdoption,
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

const validAdoptionResult = {
  stats: {
    totalActions: 4,
    evaluatedActions: 3,
    excludedActions: 1,
    effectCounts: { allow: 1, ask: 1, deny: 1 },
    analyzability: { full: 2, partial: 0, none: 1 },
    cells: [
      { capability: 'push', zone: 'unknown_remote', effect: 'ask', count: 1 },
      { capability: 'read', zone: 'credentials', effect: 'deny', count: 1 },
      { capability: 'write', zone: 'workspace', effect: 'allow', count: 1 },
    ],
  },
  groups: [
    {
      groupKey: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      effect: 'deny',
      capability: 'read',
      zone: 'credentials',
      program: null,
      programSummary: [{ program: 'cat', count: 1 }],
      distinctProgramCount: 1,
      actionCount: 1,
      sessionCount: 1,
      analyzabilityNoneCount: 0,
      firstOccurredAt: TS,
      lastOccurredAt: TS,
      decidingRuleIds: ['deny_credentials_access'],
      targetSummary: [{ key: '~/.synthetic-credentials', count: 1 }],
      headline: 'Synthetic credentials read is denied by this policy.',
      sampleActionKeys: ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
    },
  ],
  assignments: [
    {
      actionKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      groupKey: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      effect: 'deny',
    },
  ],
  resultHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
};

const storedRun = {
  candidateVersionId: `pver_${ULID}`,
  windowFrom: TS,
  windowTo: TS,
  status: 'completed',
  classifierVersion: 'c1',
  inputsHash: HASH,
  resultHash: HASH,
  errorCode: null,
  createdAt: TS,
  startedAt: TS,
  completedAt: TS,
};

describe('adoption schema', () => {
  test('accepts an Adoption Result and rejects an allow group', () => {
    expect(AdoptionResultSchema.safeParse(validAdoptionResult).success).toBe(true);
    expect(
      AdoptionResultSchema.safeParse({
        ...validAdoptionResult,
        groups: [{ ...validAdoptionResult.groups[0], effect: 'allow' }],
      }).success,
    ).toBe(false);
  });

  test('rejects an Adoption Group that carries a program in its signature', () => {
    expect(
      AdoptionResultSchema.safeParse({
        ...validAdoptionResult,
        groups: [{ ...validAdoptionResult.groups[0], program: 'cat' }],
      }).success,
    ).toBe(false);
  });

  test('rejects an Adoption Group with 11 program summary entries', () => {
    expect(
      AdoptionResultSchema.safeParse({
        ...validAdoptionResult,
        groups: [
          {
            ...validAdoptionResult.groups[0],
            programSummary: Array.from({ length: 11 }, (_v, i) => ({
              program: `p${i}`,
              count: 1,
            })),
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('exports the adoption contract signature', () => {
    expectTypeOf<ComputeAdoption>().toEqualTypeOf<
      (input: {
        readonly actions: readonly ActionForReplay[];
        readonly candidate: PolicyDocument;
      }) => AdoptionResult
    >();
  });
});

describe('replay storage schema round-trip', () => {
  test('accepts a completed Replay Run', () => {
    const value = {
      id: `rpl_${ULID}`,
      kind: 'version_diff',
      baselineVersionId: `pver_${ULID}`,
      ...storedRun,
      stats: validDiffResult.stats,
    };
    expect(ReplayRunSchema.parse(value)).toEqual(value);
  });

  // Rows stored before the adoption kind existed keep parsing with no backfill.
  test.each([
    ['a version_diff run with diff stats', 'version_diff', `pver_${ULID}`, validDiffResult.stats],
    ['a conformance run with diff stats', 'conformance', null, validDiffResult.stats],
    ['a queued version_diff run', 'version_diff', `pver_${ULID}`, null],
    ['an adoption run with adoption stats', 'adoption', null, validAdoptionResult.stats],
    ['a queued adoption run', 'adoption', null, null],
  ])('parses %s', (_name, kind, baselineVersionId, stats) => {
    const value = { id: `rpl_${ULID}`, kind, baselineVersionId, ...storedRun, stats };
    expect(ReplayRunSchema.parse(value)).toEqual(value);
  });

  test.each([
    ['an adoption run with a baseline', 'adoption', `pver_${ULID}`, null],
    ['an adoption run with diff stats', 'adoption', null, validDiffResult.stats],
    [
      'a version_diff run with adoption stats',
      'version_diff',
      `pver_${ULID}`,
      validAdoptionResult.stats,
    ],
    ['a version_diff run without a baseline', 'version_diff', null, null],
    ['a conformance run with a baseline', 'conformance', `pver_${ULID}`, null],
  ])('rejects %s', (_name, kind, baselineVersionId, stats) => {
    const value = { id: `rpl_${ULID}`, kind, baselineVersionId, ...storedRun, stats };
    expect(ReplayRunSchema.safeParse(value).success).toBe(false);
  });

  test('accepts a stored Adoption Group and assignment tied to a run', () => {
    const storedGroup = {
      ...validAdoptionResult.groups[0],
      replayRunId: `rpl_${ULID}`,
      position: 0,
    };
    expect(StoredAdoptionGroupSchema.parse(storedGroup)).toEqual(storedGroup);

    const assignment = { ...validAdoptionResult.assignments[0], replayRunId: `rpl_${ULID}` };
    expect(StoredAdoptionAssignmentSchema.parse(assignment)).toEqual(assignment);
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
