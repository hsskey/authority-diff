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
import { computeConformanceWith, deriveDisposition, pairPermissionRequests } from '../diff.ts';

type Evidence = Pick<ObservationForReplay, 'event' | 'hookDecision'>;

const PRE: Evidence = { event: 'pre_tool_use', hookDecision: null };
const ASKED: Evidence = { event: 'permission_request', hookDecision: null };
const HOOK_ALLOWED: Evidence = { event: 'permission_request', hookDecision: 'allow' };
const HOOK_DENIED: Evidence = { event: 'permission_request', hookDecision: 'deny' };

const WINDOW = {
  from: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
  to: IsoTimestampSchema.parse('2026-12-31T23:59:59.999Z'),
};

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
    isMandateDependent: false,
    operations: effects.map((e, operationIndex) => ({
      operationIndex,
      zone,
      reversibility: 'reversible',
      matchedRuleIds: [],
      decidingRuleId: null,
      effect: e,
      isMandateDependent: false,
    })),
  };
}

const TOOL_INPUT_HASH = 'c'.repeat(64);

function observationsFor(
  target: ActionForReplay,
  evidence: readonly Evidence[],
  permissionMode: string | null = null,
): ObservationForReplay[] {
  return evidence.map((item) => ({
    ...item,
    actionKey: target.actionKey,
    sessionExternalId: target.sessionExternalId,
    toolName: 'Bash',
    toolInputHash: TOOL_INPUT_HASH,
    permissionMode,
    occurredAt: target.occurredAt,
  }));
}

function hookEvent(
  event: 'pre_tool_use' | 'permission_request',
  at: string,
  extra: { actionKey?: string; session?: string } = {},
): ObservationForReplay {
  return {
    actionKey: extra.actionKey ?? null,
    event,
    sessionExternalId: extra.session ?? 'synthetic-session-1',
    toolName: 'Bash',
    toolInputHash: TOOL_INPUT_HASH,
    hookDecision: null,
    permissionMode: null,
    occurredAt: IsoTimestampSchema.parse(at),
  };
}

describe('pairPermissionRequests', () => {
  const FIRST_KEY = 'a'.repeat(64);
  const SECOND_KEY = 'b'.repeat(64);

  test('a permission_request inherits the actionKey of its pre_tool_use', () => {
    const pre = hookEvent('pre_tool_use', '2026-01-02T00:00:00.000Z', { actionKey: FIRST_KEY });
    const request = hookEvent('permission_request', '2026-01-02T00:00:00.100Z');

    const result = pairPermissionRequests([request, pre], WINDOW);

    expect(result).toEqual({
      observations: [pre, { ...request, actionKey: FIRST_KEY }],
      unpairedPermissionRequests: 0,
    });
  });

  test('a pre_tool_use of another Session does not pair and the request counts as unpaired', () => {
    const pre = hookEvent('pre_tool_use', '2026-01-02T00:00:00.000Z', {
      actionKey: FIRST_KEY,
      session: 'synthetic-session-2',
    });
    const request = hookEvent('permission_request', '2026-01-02T00:00:00.100Z');

    const result = pairPermissionRequests([pre, request], WINDOW);

    expect(result).toEqual({ observations: [pre, request], unpairedPermissionRequests: 1 });
  });

  test('with the same input hash twice, a request pairs only with the nearest earlier pre_tool_use', () => {
    const older = hookEvent('pre_tool_use', '2026-01-02T00:00:00.000Z', { actionKey: FIRST_KEY });
    const nearer = hookEvent('pre_tool_use', '2026-01-02T00:00:01.000Z', { actionKey: SECOND_KEY });
    const request = hookEvent('permission_request', '2026-01-02T00:00:01.100Z');

    const result = pairPermissionRequests([older, nearer, request], WINDOW);

    expect(result).toEqual({
      observations: [older, nearer, { ...request, actionKey: SECOND_KEY }],
      unpairedPermissionRequests: 0,
    });
  });

  test('a pre_tool_use that is already paired is not paired again', () => {
    const pre = hookEvent('pre_tool_use', '2026-01-02T00:00:00.000Z', { actionKey: FIRST_KEY });
    const first = hookEvent('permission_request', '2026-01-02T00:00:00.100Z');
    const second = hookEvent('permission_request', '2026-01-02T00:00:00.200Z');

    const result = pairPermissionRequests([pre, first, second], WINDOW);

    expect(result).toEqual({
      observations: [pre, { ...first, actionKey: FIRST_KEY }, second],
      unpairedPermissionRequests: 1,
    });
  });

  test('an unpaired permission_request before the window is not counted for the run', () => {
    const window = {
      from: IsoTimestampSchema.parse('2026-01-02T00:00:00.000Z'),
      to: IsoTimestampSchema.parse('2026-01-03T00:00:00.000Z'),
    };
    const request = hookEvent('permission_request', '2026-01-01T23:59:59.000Z');

    const result = pairPermissionRequests([request], window);

    expect(result).toEqual({ observations: [request], unpairedPermissionRequests: 0 });
  });

  test('a request inside the window still pairs with a pre_tool_use before the window edge', () => {
    const window = {
      from: IsoTimestampSchema.parse('2026-01-02T00:00:00.000Z'),
      to: IsoTimestampSchema.parse('2026-01-03T00:00:00.000Z'),
    };
    const pre = hookEvent('pre_tool_use', '2026-01-01T23:59:59.000Z', { actionKey: FIRST_KEY });
    const request = hookEvent('permission_request', '2026-01-02T00:00:00.100Z');

    const result = pairPermissionRequests([pre, request], window);

    expect(result).toEqual({
      observations: [pre, { ...request, actionKey: FIRST_KEY }],
      unpairedPermissionRequests: 0,
    });
  });
});

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
      WINDOW,
    );

    expect(result.findings.map((finding) => finding.kind)).toEqual(
      expected === null ? [] : [expected],
    );
  });

  test('a permission_request without an actionKey reaches its Action through the paired pre_tool_use', () => {
    const target = action('a', [operation(0, 'write')]);
    const [pre] = observationsFor(target, [PRE]);
    if (pre === undefined) {
      throw new Error('one pre_tool_use');
    }

    const result = computeConformanceWith(
      () => decision(['allow']),
      [target],
      [pre, { ...pre, actionKey: null, event: 'permission_request' }],
      WINDOW,
    );

    expect(result.findings.map((finding) => finding.kind)).toEqual(['over_asked']);
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
      WINDOW,
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
      WINDOW,
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
      WINDOW,
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
      operationWidening: [],
      byPermissionMode: [{ permissionMode: 'unknown', actionCount: 4, findingCount: 1 }],
    });
  });

  test('byPermissionMode counts every Action under the first mode its observations carried, or unknown', () => {
    const bypassed = action('a', [operation(0, 'write')]);
    const asked = action('b', [operation(0, 'write')]);
    const unobserved = action('c', [operation(0, 'write')]);
    const empty = action('d', []);

    const result = computeConformanceWith(
      (operations) => (operations.length === 0 ? null : decision(['allow'])),
      [bypassed, asked, unobserved, empty],
      [
        ...observationsFor(bypassed, [PRE], 'bypassPermissions'),
        ...observationsFor(asked, [PRE]),
        ...observationsFor(asked, [ASKED], 'default'),
        ...observationsFor(empty, [PRE], 'auto'),
      ],
      WINDOW,
    );

    expect(result.stats.byPermissionMode).toEqual([
      { permissionMode: 'auto', actionCount: 1, findingCount: 0 },
      { permissionMode: 'bypassPermissions', actionCount: 1, findingCount: 0 },
      { permissionMode: 'default', actionCount: 1, findingCount: 1 },
      { permissionMode: 'unknown', actionCount: 1, findingCount: 0 },
    ]);
  });

  test('byPermissionMode.findingCount counts the Actions of each mode inside a finding', () => {
    const bypassed = action('a', [operation(0, 'write')]);
    const prompted = action('b', [operation(0, 'write')]);
    const autoExecuted = action('c', [operation(0, 'write')]);

    const result = computeConformanceWith(
      () => decision(['ask']),
      [bypassed, prompted, autoExecuted],
      [
        ...observationsFor(bypassed, [PRE], 'bypassPermissions'),
        ...observationsFor(prompted, [PRE, ASKED], 'default'),
        ...observationsFor(autoExecuted, [PRE], 'default'),
      ],
      WINDOW,
    );

    expect(result.stats.byPermissionMode).toEqual([
      { permissionMode: 'bypassPermissions', actionCount: 1, findingCount: 1 },
      { permissionMode: 'default', actionCount: 2, findingCount: 1 },
    ]);
  });

  test('the permission mode of an observation is part of resultHash', () => {
    const target = action('a', [operation(0, 'write')]);

    const bypassed = computeConformanceWith(
      () => decision(['allow']),
      [target],
      observationsFor(target, [PRE], 'bypassPermissions'),
      WINDOW,
    );
    const plain = computeConformanceWith(
      () => decision(['allow']),
      [target],
      observationsFor(target, [PRE], 'default'),
      WINDOW,
    );

    expect(bypassed.resultHash).not.toBe(plain.resultHash);
  });

  test('resultHash is stable across observation order', () => {
    const target = action('a', [operation(0, 'write')]);
    const evidence = observationsFor(target, [PRE, ASKED]);

    const forward = computeConformanceWith(() => decision(['allow']), [target], evidence, WINDOW);
    const reversed = computeConformanceWith(
      () => decision(['allow']),
      [target],
      [...evidence].reverse(),
      WINDOW,
    );

    expect(reversed.resultHash).toBe(forward.resultHash);
  });
});
