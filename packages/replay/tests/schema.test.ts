import { describe, expect, expectTypeOf, test } from 'vitest';
import type { Target } from '@authority/action/schema';
import { ActionForReplaySchema, type ActionForReplay } from '@authority/trace/schema';
import { PolicyDocumentSchema, type PolicyDocument } from '@authority/policy/schema';
import {
  DiffResultSchema,
  type ComputeDiff,
  type DeriveTargetKey,
  type DiffResult,
} from '../schema.ts';
import actionFixture from '../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import baselineFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidateFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };

const validDiffResult = {
  stats: {
    totalActions: 1,
    evaluatedActions: 1,
    excludedActions: 0,
    changedActions: 1,
    transitions: [
      { from: 'allow', to: 'allow', count: 0 },
      { from: 'allow', to: 'ask', count: 0 },
      { from: 'allow', to: 'deny', count: 0 },
      { from: 'ask', to: 'allow', count: 1 },
      { from: 'ask', to: 'ask', count: 0 },
      { from: 'ask', to: 'deny', count: 0 },
      { from: 'deny', to: 'allow', count: 0 },
      { from: 'deny', to: 'ask', count: 0 },
      { from: 'deny', to: 'deny', count: 0 },
    ],
  },
  groups: [
    {
      groupKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      direction: 'widening',
      fromEffect: 'ask',
      toEffect: 'allow',
      capability: 'write',
      fromZone: 'workspace',
      toZone: 'workspace',
      program: null,
      severity: 'normal',
      actionCount: 1,
      sessionCount: 1,
      analyzabilityNoneCount: 0,
      firstOccurredAt: '2026-01-02T03:04:05.006Z',
      lastOccurredAt: '2026-01-02T03:04:05.006Z',
      baselineRuleIds: ['ask_writes'],
      candidateRuleIds: ['allow_workspace_writes'],
      targetSummary: [{ key: 'workspace', count: 1 }],
      headline: 'Synthetic workspace write changes from ask to allow.',
      sampleActionKeys: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    },
  ],
  changedActions: [
    {
      actionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      groupKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      fromEffect: 'ask',
      toEffect: 'allow',
    },
  ],
  resultHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
};

describe('replay schema', () => {
  test('accepts the shared synthetic pipeline fixtures and Diff Result', () => {
    expect([
      ActionForReplaySchema.safeParse(actionFixture).success,
      PolicyDocumentSchema.safeParse(baselineFixture).success,
      PolicyDocumentSchema.safeParse(candidateFixture).success,
      DiffResultSchema.safeParse(validDiffResult).success,
    ]).toEqual([true, true, true, true]);
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
