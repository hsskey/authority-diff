import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { exportClaudeCodeSettings } from '@authority/policy';
import { DEFAULT_POLICY_DOCUMENT, upgradePolicyDocument } from '@authority/policy/evaluate';
import { PolicyDocumentSchema } from '@authority/policy/schema';
import { ActionForReplaySchema } from '@authority/trace/schema';
import { computeAdoption, computeDiff } from '../diff.ts';
import { collectS1Actions } from '../../../tests/workloads/generate-s1.ts';
import actionFixture from '../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import baselineFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidateFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };

// The same resultHash values mandate-invariance.test.ts pins, taken before the settings export existed.
const FIXTURE_DIFF_RESULT_HASH = '132207d7a511e9690eaa6a1214e217caf679e15dd643a0c3196751a461342268';
const S1_DEFAULT_ADOPTION_RESULT_HASH =
  '361e1aa39a7315099b2633130bd7efe329ea808f6de7ab741ef38c82527c84b2';

const fixtureActions = z.array(ActionForReplaySchema).parse(actionFixture);
const baseline = upgradePolicyDocument(PolicyDocumentSchema.parse(baselineFixture));
const candidate = upgradePolicyDocument(PolicyDocumentSchema.parse(candidateFixture));
const s1Actions = collectS1Actions({
  principalCount: 40,
  dayCount: 30,
  actionCount: 1_200,
  seed: 1,
});

describe('a Claude Code settings export never changes a replay result', () => {
  test('keeps the fixture diff resultHash after both documents are exported', () => {
    exportClaudeCodeSettings(baseline);
    exportClaudeCodeSettings(candidate);

    expect(computeDiff({ actions: fixtureActions, baseline, candidate }).resultHash).toBe(
      FIXTURE_DIFF_RESULT_HASH,
    );
  });

  test('keeps the S1 adoption resultHash of the default template after it is exported', () => {
    exportClaudeCodeSettings(DEFAULT_POLICY_DOCUMENT);

    expect(
      computeAdoption({ actions: s1Actions, candidate: DEFAULT_POLICY_DOCUMENT }).resultHash,
    ).toBe(S1_DEFAULT_ADOPTION_RESULT_HASH);
  });
});
