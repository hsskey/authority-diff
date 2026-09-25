import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type { Operation } from '@authority/action/schema';
import {
  DEFAULT_POLICY_DOCUMENT,
  createEvaluator,
  upgradePolicyDocument,
} from '@authority/policy/evaluate';
import { PolicyDocumentSchema, type PolicyDocumentV2 } from '@authority/policy/schema';
import { ActionForReplaySchema, type ActionForReplay } from '@authority/trace/schema';
import { computeAdoption, computeDiff } from '../diff.ts';
import { collectS1Actions } from '../../../tests/workloads/generate-s1.ts';
import actionFixture from '../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import baselineFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidateFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };
import defaultV1Fixture from '../../../tests/fixtures/default-policy-v1.json' with { type: 'json' };

// resultHash values computed before schemaVersion 2 existed, from schemaVersion 1 inputs only.
const FIXTURE_DIFF_RESULT_HASH = '132207d7a511e9690eaa6a1214e217caf679e15dd643a0c3196751a461342268';
const S1_DIFF_RESULT_HASH = '680973139c1d198acb8359682797dbcce52b98452234a73a179816d9961e8ecd';
const S1_DEFAULT_ADOPTION_RESULT_HASH =
  '361e1aa39a7315099b2633130bd7efe329ea808f6de7ab741ef38c82527c84b2';

const fixtureActions = z.array(ActionForReplaySchema).parse(actionFixture);
const baseline = PolicyDocumentSchema.parse(baselineFixture);
const candidate = PolicyDocumentSchema.parse(candidateFixture);
// The schemaVersion 1 default template as it was before schemaVersion 2 (contentHash eea676ae…c48b).
const defaultV1 = PolicyDocumentSchema.parse(defaultV1Fixture);
const s1Actions = collectS1Actions({
  principalCount: 40,
  dayCount: 30,
  actionCount: 1_200,
  seed: 1,
});

function syntheticAction(actionKeyDigit: string, operation: Omit<Operation, 'index'>) {
  return ActionForReplaySchema.parse({
    actionKey: actionKeyDigit.repeat(64),
    sessionExternalId: 'synthetic-session-mandate',
    operations: [{ index: 0, ...operation }],
    observedOutcome: 'executed',
    occurredAt: '2026-01-02T03:04:05.006Z',
  });
}

const PRODUCTION_DEPLOY = syntheticAction('d', {
  capability: 'deploy',
  target: { kind: 'deploy_target', label: 'synthetic-service' },
  analyzability: 'full',
  program: 'helm',
  fragment: 'synthetic redacted deploy production',
  signals: [],
});

const MANDATE_ACTIONS: readonly ActionForReplay[] = [
  PRODUCTION_DEPLOY,
  syntheticAction('e', {
    capability: 'write',
    target: { kind: 'path', path: '~/.claude/settings.json', isInsideWorkspace: false },
    analyzability: 'full',
    program: null,
    fragment: 'synthetic redacted agent config write',
    signals: [],
  }),
];
const actions = [...s1Actions, ...MANDATE_ACTIONS];

const DEFAULT_WITHOUT_EXCEPTIONS: PolicyDocumentV2 = {
  ...DEFAULT_POLICY_DOCUMENT,
  rules: DEFAULT_POLICY_DOCUMENT.rules.map((rule) => ({ ...rule, mandateException: null })),
};

function adoptionGroupsOf(document: typeof defaultV1) {
  return computeAdoption({ actions: [PRODUCTION_DEPLOY], candidate: document }).groups.map(
    (group) => [group.effect, group.groupKey, group.decidingRuleIds],
  );
}

describe('a Mandate Exception never changes the replay result of a fixed document', () => {
  test('the Action set has Mandate-dependent Decisions under both Mandate Exceptions', () => {
    const evaluate = createEvaluator(DEFAULT_POLICY_DOCUMENT);
    const decidingRuleIds = new Set(
      actions
        .flatMap((action) => evaluate(action.operations)?.operations ?? [])
        .filter((operation) => operation.isMandateDependent)
        .map((operation) => operation.decidingRuleId ?? 'default_ask'),
    );
    expect([...decidingRuleIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      'ask_external_disclosure',
      'ask_production_deploy',
    ]);
  });

  test('the adoption result is the same with and without the Mandate Exceptions', () => {
    const withExceptions = computeAdoption({ actions, candidate: DEFAULT_POLICY_DOCUMENT });
    const withoutExceptions = computeAdoption({ actions, candidate: DEFAULT_WITHOUT_EXCEPTIONS });
    expect(withExceptions).toEqual(withoutExceptions);
  });

  test('the diff result is the same with and without the Mandate Exceptions', () => {
    const withExceptions = computeDiff({
      actions,
      baseline: upgradePolicyDocument(baseline),
      candidate: DEFAULT_POLICY_DOCUMENT,
    });
    const withoutExceptions = computeDiff({
      actions,
      baseline: upgradePolicyDocument(baseline),
      candidate: DEFAULT_WITHOUT_EXCEPTIONS,
    });
    expect(withExceptions).toEqual(withoutExceptions);
  });

  test('upgrading both schemaVersion 1 documents keeps the diff resultHash', () => {
    const result = computeDiff({
      actions: fixtureActions,
      baseline: upgradePolicyDocument(baseline),
      candidate: upgradePolicyDocument(candidate),
    });
    expect(result.resultHash).toBe(FIXTURE_DIFF_RESULT_HASH);
  });
});

describe('schemaVersion 1 documents replay as before schemaVersion 2', () => {
  test.each([
    [
      'fixture diff',
      () => computeDiff({ actions: fixtureActions, baseline, candidate }).resultHash,
      FIXTURE_DIFF_RESULT_HASH,
    ],
    [
      'S1 diff',
      () => computeDiff({ actions: s1Actions, baseline, candidate }).resultHash,
      S1_DIFF_RESULT_HASH,
    ],
    [
      'S1 adoption of the schemaVersion 1 default template',
      () => computeAdoption({ actions: s1Actions, candidate: defaultV1 }).resultHash,
      S1_DEFAULT_ADOPTION_RESULT_HASH,
    ],
  ])('keeps the %s resultHash', (_label, resultHash, expected) => {
    expect(resultHash()).toBe(expected);
  });
});

describe('the schemaVersion 2 default template against the schemaVersion 1 default template', () => {
  test('gives the same adoption resultHash on Actions without a production deploy', () => {
    const result = computeAdoption({ actions: s1Actions, candidate: DEFAULT_POLICY_DOCUMENT });
    expect(result.resultHash).toBe(S1_DEFAULT_ADOPTION_RESULT_HASH);
  });

  test('decides a production deploy by ask_production_deploy instead of ask_irreversible_local, with the same Effect and groupKey', () => {
    const [v1Group] = adoptionGroupsOf(defaultV1);
    const [v2Group] = adoptionGroupsOf(DEFAULT_POLICY_DOCUMENT);
    expect({ v1: v1Group, v2: v2Group }).toEqual({
      v1: ['ask', v1Group?.[1], ['ask_irreversible_local']],
      v2: ['ask', v1Group?.[1], ['ask_production_deploy']],
    });
  });

  test('changes the adoption resultHash of a production deploy', () => {
    const v1 = computeAdoption({ actions: [PRODUCTION_DEPLOY], candidate: defaultV1 });
    const v2 = computeAdoption({
      actions: [PRODUCTION_DEPLOY],
      candidate: DEFAULT_POLICY_DOCUMENT,
    });
    expect(v2.resultHash).not.toBe(v1.resultHash);
  });
});
