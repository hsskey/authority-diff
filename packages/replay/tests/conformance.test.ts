import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import type { Effect } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Capability, Operation } from '@authority/action/schema';
import type { Decision, Zone } from '@authority/policy/schema';
import type {
  ActionForReplay,
  ObservationForReplay,
  ObservedOutcome,
} from '@authority/trace/schema';
import { computeConformanceWith, deriveDisposition } from '../diff.ts';

type Evidence = Pick<ObservationForReplay, 'event' | 'hookDecision'>;

const PRE: Evidence = { event: 'pre_tool_use', hookDecision: null };
const ASKED: Evidence = { event: 'permission_request', hookDecision: null };
const HOOK_ALLOWED: Evidence = { event: 'permission_request', hookDecision: 'allow' };
const HOOK_DENIED: Evidence = { event: 'permission_request', hookDecision: 'deny' };

function operation(
  index: number,
  capability: Capability,
  program: string | null = null,
): Operation {
  return {
    index,
    capability,
    target: { kind: 'unknown' },
    analyzability: 'full',
    program,
    fragment: 'synthetic redacted fragment',
    signals: [],
  };
}

function action(
  key: string,
  operations: readonly Operation[],
  extra: { outcome?: ObservedOutcome; session?: string; at?: string } = {},
): ActionForReplay {
  return {
    actionKey: key.repeat(64).slice(0, 64),
    sessionExternalId: extra.session ?? 'synthetic-session-1',
    operations: [...operations],
    observedOutcome: extra.outcome ?? 'executed',
    occurredAt: IsoTimestampSchema.parse(extra.at ?? '2026-01-02T00:00:00.000Z'),
  };
}

function decision(effects: readonly Effect[], zone: Zone = 'workspace'): Decision {
  const rank: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };
  const effect = effects.reduce((max, e) => (rank[e] > rank[max] ? e : max));
  return {
    effect,
    decidingOperationIndex: effects.indexOf(effect),
    operations: effects.map((e, operationIndex) => ({
      operationIndex,
      zone,
      reversibility: 'reversible',
      matchedRuleIds: [],
      decidingRuleId: null,
      effect: e,
    })),
  };
}

function observationsFor(target: ActionForReplay, evidence: readonly Evidence[]) {
  return evidence.map((item) => ({ ...item, actionKey: target.actionKey }));
}

describe('deriveDisposition', () => {
  test.each<[string, ObservedOutcome, readonly Evidence[], string]>([
    ['only pre_tool_use', 'executed', [PRE], 'auto_executed'],
    ['a permission_request without a decision', 'executed', [PRE, ASKED], 'prompted'],
    ['a permission_request carrying allow', 'executed', [PRE, HOOK_ALLOWED], 'hook_approved'],
    ['a permission_request carrying deny', 'executed', [PRE, HOOK_DENIED], 'blocked'],
    ['a runtime block marker in tool_result', 'blocked_by_runtime', [PRE, ASKED], 'blocked'],
    ['a human refusal without observations', 'rejected_by_human', [], 'prompted'],
    ['no observation at all', 'executed', [], 'executed_prompt_unknown'],
  ])('%s', (_name, outcome, evidence, expected) => {
    expect(deriveDisposition(outcome, evidence)).toBe(expected);
  });
});

describe('computeConformanceWith', () => {
  test.each<[string, ObservedOutcome, readonly Evidence[], Effect, string | null]>([
    ['violation: denied and executed without hook coverage', 'executed', [], 'deny', 'violation'],
    [
      'violation: denied and executed after a prompt',
      'executed',
      [PRE, ASKED],
      'deny',
      'violation',
    ],
    ['no violation when the runtime blocked it', 'blocked_by_runtime', [PRE], 'deny', null],
    ['under_asked: ask spec, auto-executed', 'executed', [PRE], 'ask', 'under_asked'],
    ['no under_asked when a hook approved it', 'executed', [PRE, HOOK_ALLOWED], 'ask', null],
    ['over_asked: allow spec, prompted', 'executed', [PRE, ASKED], 'allow', 'over_asked'],
    ['no over_asked when auto-executed', 'executed', [PRE], 'allow', null],
  ])('%s', (_name, outcome, evidence, candidateEffect, expected) => {
    const target = action('a', [operation(0, 'write')], { outcome });

    const result = computeConformanceWith(
      () => decision([candidateEffect]),
      [target],
      observationsFor(target, evidence),
    );

    expect(result.findings.map((finding) => finding.kind)).toEqual(
      expected === null ? [] : [expected],
    );
  });

  test('groups Actions by kind, capability, zone, and program of the signature Operation', () => {
    const first = action('a', [operation(0, 'push', 'git')], { session: 's1' });
    const second = action('b', [operation(0, 'push', 'git')], {
      session: 's2',
      at: '2026-01-03T00:00:00.000Z',
    });

    const result = computeConformanceWith(
      () => decision(['ask'], 'public_remote'),
      [first, second],
      [...observationsFor(first, [PRE]), ...observationsFor(second, [PRE])],
    );

    expect(result.findings).toEqual([
      {
        findingKey: sha256Hex(canonicalJson(['under_asked', 'push', 'public_remote', 'git'])),
        kind: 'under_asked',
        capability: 'push',
        zone: 'public_remote',
        program: 'git',
        actionCount: 2,
        sessionCount: 2,
        firstOccurredAt: '2026-01-02T00:00:00.000Z',
        lastOccurredAt: '2026-01-03T00:00:00.000Z',
        sampleActionKeys: [first.actionKey, second.actionKey],
      },
    ]);
  });

  test('the signature Operation is the lowest-index Operation carrying the candidate Effect', () => {
    const target = action('a', [
      operation(0, 'read'),
      operation(1, 'delete'),
      operation(2, 'send'),
    ]);

    const result = computeConformanceWith(
      () => decision(['allow', 'ask', 'ask']),
      [target],
      observationsFor(target, [PRE]),
    );

    expect(result.findings.map((finding) => finding.capability)).toEqual(['delete']);
  });

  test('stats compare the Disposition Effect to the candidate and exclude unobserved Actions', () => {
    const auto = action('a', [operation(0, 'write')]);
    const prompted = action('b', [operation(0, 'write')]);
    const unobserved = action('c', [operation(0, 'write')]);
    const empty = action('d', []);

    const result = computeConformanceWith(
      (operations) => (operations.length === 0 ? null : decision(['ask'])),
      [auto, prompted, unobserved, empty],
      [...observationsFor(auto, [PRE]), ...observationsFor(prompted, [PRE, ASKED])],
    );

    expect(result.stats).toEqual({
      totalActions: 4,
      evaluatedActions: 2,
      excludedActions: 2,
      changedActions: 1,
      transitions: [
        { from: 'allow', to: 'allow', count: 0 },
        { from: 'allow', to: 'ask', count: 1 },
        { from: 'allow', to: 'deny', count: 0 },
        { from: 'ask', to: 'allow', count: 0 },
        { from: 'ask', to: 'ask', count: 1 },
        { from: 'ask', to: 'deny', count: 0 },
        { from: 'deny', to: 'allow', count: 0 },
        { from: 'deny', to: 'ask', count: 0 },
        { from: 'deny', to: 'deny', count: 0 },
      ],
    });
  });

  test('resultHash is stable across observation order', () => {
    const target = action('a', [operation(0, 'write')]);
    const evidence = observationsFor(target, [PRE, ASKED]);

    const forward = computeConformanceWith(() => decision(['allow']), [target], evidence);
    const reversed = computeConformanceWith(
      () => decision(['allow']),
      [target],
      [...evidence].reverse(),
    );

    expect(reversed.resultHash).toBe(forward.resultHash);
  });
});
