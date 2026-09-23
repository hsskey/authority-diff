import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { invariant, IsoTimestampSchema } from '@authority/kernel';
import type { Effect } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Analyzability, Capability, Operation, Target } from '@authority/action/schema';
import type { Decision, OperationDecision, Reversibility, Zone } from '@authority/policy/schema';
import type { ActionForReplay, ObservedOutcome } from '@authority/trace/schema';
import { DiffResultSchema, type DiffResult } from '@authority/replay/schema';
import { computeDiffWith, deriveTargetKey } from '../diff.ts';

// --- builders (Arrange helpers, no assertion logic) --------------------------

type Evaluate = (operations: readonly Operation[]) => Decision | null;

interface Case {
  readonly action: ActionForReplay;
  readonly baseline: Decision | null;
  readonly candidate: Decision | null;
}

function scenario(cases: readonly Case[]): {
  actions: ActionForReplay[];
  evaluateBaseline: Evaluate;
  evaluateCandidate: Evaluate;
} {
  const baselineByOps = new Map<readonly Operation[], Decision | null>();
  const candidateByOps = new Map<readonly Operation[], Decision | null>();
  for (const item of cases) {
    baselineByOps.set(item.action.operations, item.baseline);
    candidateByOps.set(item.action.operations, item.candidate);
  }
  const lookup =
    (map: Map<readonly Operation[], Decision | null>): Evaluate =>
    (operations) => {
      invariant(map.has(operations), 'scenario evaluator received unknown operations');
      return map.get(operations) ?? null;
    };
  return {
    actions: cases.map((item) => item.action),
    evaluateBaseline: lookup(baselineByOps),
    evaluateCandidate: lookup(candidateByOps),
  };
}

function operation(
  index: number,
  capability: Capability,
  target: Target,
  extra?: { analyzability?: Analyzability; program?: string | null; fragment?: string },
): Operation {
  return {
    index,
    capability,
    target,
    analyzability: extra?.analyzability ?? 'full',
    program: extra?.program ?? null,
    fragment: extra?.fragment ?? 'synthetic redacted fragment',
    signals: [],
  };
}

function opDecision(
  index: number,
  effect: Effect,
  zone: Zone,
  extra?: {
    reversibility?: Reversibility;
    decidingRuleId?: string | null;
    matchedRuleIds?: string[];
  },
): OperationDecision {
  return {
    operationIndex: index,
    zone,
    reversibility: extra?.reversibility ?? 'reversible',
    matchedRuleIds: extra?.matchedRuleIds ?? [],
    decidingRuleId: extra?.decidingRuleId ?? null,
    effect,
  };
}

function decision(
  effect: Effect,
  operations: OperationDecision[],
  decidingOperationIndex = 0,
): Decision {
  return { effect, decidingOperationIndex, operations };
}

function action(
  actionKey: string,
  occurredAt: string,
  operations: Operation[],
  extra?: { sessionExternalId?: string; observedOutcome?: ObservedOutcome },
): ActionForReplay {
  return {
    actionKey,
    sessionExternalId: extra?.sessionExternalId ?? 'synthetic-session-001',
    operations,
    observedOutcome: extra?.observedOutcome ?? 'executed',
    occurredAt: IsoTimestampSchema.parse(occurredAt),
  };
}

const hex = (char: string): string => char.repeat(64);
const workspacePath: Target = {
  kind: 'path',
  path: '~/synthetic/note.txt',
  isInsideWorkspace: true,
};
const remoteTarget: Target = {
  kind: 'vcs_remote',
  remoteName: 'origin',
  remoteKey: 'example.invalid/synthetic/project',
  branch: 'feature/synthetic',
};

/** A single-Operation Action that widens ask -> allow on an unknown_remote push. */
function pushWideningCase(actionKey: string, occurredAt: string, sessionExternalId?: string): Case {
  const ops = [operation(0, 'push', remoteTarget, { program: 'git' })];
  return {
    action: action(
      actionKey,
      occurredAt,
      ops,
      sessionExternalId ? { sessionExternalId } : undefined,
    ),
    baseline: decision('ask', [
      opDecision(0, 'ask', 'unknown_remote', { decidingRuleId: 'push_policy' }),
    ]),
    candidate: decision('allow', [
      opDecision(0, 'allow', 'trusted_remote', { decidingRuleId: 'push_policy' }),
    ]),
  };
}

/** An unchanged workspace write: ask -> ask. */
function unchangedWriteCase(actionKey: string, occurredAt: string): Case {
  const ops = [operation(0, 'write', workspacePath)];
  return {
    action: action(actionKey, occurredAt, ops),
    baseline: decision('ask', [opDecision(0, 'ask', 'workspace')]),
    candidate: decision('ask', [opDecision(0, 'ask', 'workspace')]),
  };
}

/** The hashed projection: exactly the fields resultHash covers (headline excluded). */
function hashedProjection(result: DiffResult) {
  return {
    stats: result.stats,
    groups: result.groups.map((group) => ({
      groupKey: group.groupKey,
      direction: group.direction,
      fromEffect: group.fromEffect,
      toEffect: group.toEffect,
      capability: group.capability,
      fromZone: group.fromZone,
      toZone: group.toZone,
      program: group.program,
      severity: group.severity,
      actionCount: group.actionCount,
      sessionCount: group.sessionCount,
      analyzabilityNoneCount: group.analyzabilityNoneCount,
      firstOccurredAt: group.firstOccurredAt,
      lastOccurredAt: group.lastOccurredAt,
      baselineRuleIds: group.baselineRuleIds,
      candidateRuleIds: group.candidateRuleIds,
      targetSummary: group.targetSummary,
      sampleActionKeys: group.sampleActionKeys,
    })),
    changedActions: result.changedActions,
  };
}

// --- tests -------------------------------------------------------------------

describe('deriveTargetKey', () => {
  test.each<[string, Target, string]>([
    [
      'workspace path',
      { kind: 'path', path: '~/proj/a.txt', isInsideWorkspace: true },
      'workspace',
    ],
    [
      'other path',
      { kind: 'path', path: '/etc/nginx/nginx.conf', isInsideWorkspace: false },
      'etc/nginx',
    ],
    [
      'single-segment path',
      { kind: 'path', path: '/rootfile', isInsideWorkspace: false },
      'rootfile',
    ],
    ['host', { kind: 'host', host: 'example.invalid', scheme: 'https' }, 'example.invalid'],
    ['remote with key', remoteTarget, 'example.invalid/synthetic/project'],
    [
      'remote name fallback',
      { kind: 'vcs_remote', remoteName: 'origin', remoteKey: null, branch: null },
      'origin',
    ],
    [
      'remote unknown',
      { kind: 'vcs_remote', remoteName: null, remoteKey: null, branch: null },
      'unknown',
    ],
    [
      'package with source',
      { kind: 'package', ecosystem: 'npm', source: '@scope/pkg' },
      'npm:@scope/pkg',
    ],
    ['package without source', { kind: 'package', ecosystem: 'cargo', source: null }, 'cargo'],
    ['mcp', { kind: 'mcp', server: 'files', tool: 'read' }, 'mcp:files'],
    ['deploy label', { kind: 'deploy_target', label: 'prod' }, 'prod'],
    ['deploy unknown', { kind: 'deploy_target', label: null }, 'unknown'],
    ['unknown', { kind: 'unknown' }, 'unknown'],
  ])('maps %s', (_name, target, expected) => {
    expect(deriveTargetKey(target)).toBe(expected);
  });
});

describe('stats and transitions', () => {
  test('counts totals, exclusions, and the nine transition cells', () => {
    const emptyAction = action(hex('e'), '2026-01-02T03:04:09.000Z', []);
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      unchangedWriteCase(hex('a'), '2026-01-02T03:04:05.000Z'),
      pushWideningCase(hex('b'), '2026-01-02T03:04:06.000Z'),
      unchangedWriteCase(hex('c'), '2026-01-02T03:04:07.000Z'),
      {
        action: action(hex('d'), '2026-01-02T03:04:08.000Z', [
          operation(0, 'delete', workspacePath),
        ]),
        baseline: decision('deny', [opDecision(0, 'deny', 'workspace')]),
        candidate: decision('ask', [opDecision(0, 'ask', 'workspace')]),
      },
      { action: emptyAction, baseline: null, candidate: null },
    ]);

    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);

    expect(result.stats).toEqual({
      totalActions: 5,
      evaluatedActions: 4,
      excludedActions: 1,
      changedActions: 2,
      transitions: [
        { from: 'allow', to: 'allow', count: 0 },
        { from: 'allow', to: 'ask', count: 0 },
        { from: 'allow', to: 'deny', count: 0 },
        { from: 'ask', to: 'allow', count: 1 },
        { from: 'ask', to: 'ask', count: 2 },
        { from: 'ask', to: 'deny', count: 0 },
        { from: 'deny', to: 'allow', count: 0 },
        { from: 'deny', to: 'ask', count: 1 },
        { from: 'deny', to: 'deny', count: 0 },
      ],
      operationWidening: [],
    });
  });

  test('the nine transition counts sum to evaluatedActions', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      unchangedWriteCase(hex('a'), '2026-01-02T03:04:05.000Z'),
      pushWideningCase(hex('b'), '2026-01-02T03:04:06.000Z'),
      { action: action(hex('e'), '2026-01-02T03:04:09.000Z', []), baseline: null, candidate: null },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const sum = result.stats.transitions.reduce((total, cell) => total + cell.count, 0);
    expect(sum).toBe(result.stats.evaluatedActions);
    expect(result.stats.evaluatedActions).toBe(2);
  });

  test('counts operation-level widening when Action effect stays ask', () => {
    const privateOne: Target = {
      kind: 'vcs_remote',
      remoteName: 'origin',
      remoteKey: 'github.example/acme/private-one',
      branch: 'main',
    };
    const privateTwo: Target = {
      kind: 'vcs_remote',
      remoteName: 'origin',
      remoteKey: 'github.example/acme/private-two',
      branch: 'main',
    };
    const registry: Target = {
      kind: 'package',
      ecosystem: 'npm',
      source: 'registry.npmjs.org',
    };
    const ops = [
      operation(0, 'write', workspacePath),
      operation(1, 'push', privateOne, { program: 'git' }),
      operation(2, 'push', privateTwo, { program: 'git' }),
      operation(3, 'push', registry, { program: 'npm' }),
    ];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('ask', [
          opDecision(0, 'ask', 'workspace'),
          opDecision(1, 'ask', 'unknown_remote'),
          opDecision(2, 'ask', 'unknown_remote'),
          opDecision(3, 'ask', 'public_remote'),
        ]),
        candidate: decision('ask', [
          opDecision(0, 'ask', 'workspace'),
          opDecision(1, 'allow', 'trusted_remote'),
          opDecision(2, 'allow', 'trusted_remote'),
          opDecision(3, 'allow', 'trusted_remote'),
        ]),
      },
    ]);

    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);

    expect(result.stats.changedActions).toBe(0);
    expect(result.groups).toEqual([]);
    expect(result.changedActions).toEqual([]);
    expect(result.stats.operationWidening).toEqual([
      { capability: 'push', fromZone: 'public_remote', toZone: 'trusted_remote', count: 1 },
      { capability: 'push', fromZone: 'unknown_remote', toZone: 'trusted_remote', count: 2 },
    ]);
    expect(result.resultHash).toBe(sha256Hex(canonicalJson(hashedProjection(result))));
    expect(
      sha256Hex(
        canonicalJson({
          ...hashedProjection(result),
          stats: { ...result.stats, operationWidening: [] },
        }),
      ),
    ).not.toBe(result.resultHash);
  });
});

describe('invariants', () => {
  test('throws on a duplicate actionKey', () => {
    const first = unchangedWriteCase(hex('a'), '2026-01-02T03:04:05.000Z');
    const second = unchangedWriteCase(hex('a'), '2026-01-02T03:04:06.000Z');
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([first, second]);
    expect(() => computeDiffWith(evaluateBaseline, evaluateCandidate, actions)).toThrow(
      /duplicate actionKey/,
    );
  });
});

describe('signature Operation selection', () => {
  test('widening picks the most restrictive baseline Effect', () => {
    // op0 ask->allow (baseline ask), op1 deny->ask (baseline deny). Action deny->ask widening.
    const ops = [operation(0, 'push', remoteTarget), operation(1, 'fetch', remoteTarget)];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('deny', [
          opDecision(0, 'ask', 'unknown_remote'),
          opDecision(1, 'deny', 'unknown_remote'),
        ]),
        candidate: decision('ask', [
          opDecision(0, 'allow', 'unknown_remote'),
          opDecision(1, 'ask', 'unknown_remote'),
        ]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect([group.fromEffect, group.toEffect, group.capability]).toEqual(['deny', 'ask', 'fetch']);
  });

  test('narrowing picks the most restrictive candidate Effect', () => {
    // op0 allow->ask, op1 ask->deny (candidate deny). Action ask->deny narrowing.
    const ops = [operation(0, 'push', remoteTarget), operation(1, 'fetch', remoteTarget)];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('ask', [
          opDecision(0, 'allow', 'unknown_remote'),
          opDecision(1, 'ask', 'unknown_remote'),
        ]),
        candidate: decision('deny', [
          opDecision(0, 'ask', 'unknown_remote'),
          opDecision(1, 'deny', 'unknown_remote'),
        ]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect([group.direction, group.fromEffect, group.toEffect, group.capability]).toEqual([
      'narrowing',
      'ask',
      'deny',
      'fetch',
    ]);
  });

  test('a tie selects the smallest Operation index', () => {
    // op0 deny->ask (push), op1 deny->allow (fetch). Both baseline deny; widening picks op0.
    const ops = [operation(0, 'push', remoteTarget), operation(1, 'fetch', remoteTarget)];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('deny', [
          opDecision(0, 'deny', 'unknown_remote'),
          opDecision(1, 'deny', 'unknown_remote'),
        ]),
        candidate: decision('ask', [
          opDecision(0, 'ask', 'unknown_remote'),
          opDecision(1, 'allow', 'unknown_remote'),
        ]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect([group.toEffect, group.capability]).toEqual(['ask', 'push']);
  });
});

describe('severity', () => {
  test.each<[Zone]>([
    ['credentials'],
    ['agent_config'],
    ['protected'],
    ['public_remote'],
    ['unknown_remote'],
  ])('widening from baseline Zone %s is critical', (zone) => {
    const ops = [operation(0, 'push', remoteTarget)];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('ask', [opDecision(0, 'ask', zone)]),
        candidate: decision('allow', [opDecision(0, 'allow', 'trusted_remote')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.severity).toBe('critical');
  });

  test('widening with an irreversible baseline Operation is critical', () => {
    const ops = [operation(0, 'push', remoteTarget)];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('ask', [
          opDecision(0, 'ask', 'workspace', { reversibility: 'irreversible' }),
        ]),
        candidate: decision('allow', [opDecision(0, 'allow', 'workspace')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.severity).toBe('critical');
  });

  test('widening with an analyzability-none signature Operation is critical', () => {
    const ops = [operation(0, 'execute', { kind: 'unknown' }, { analyzability: 'none' })];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('ask', [opDecision(0, 'ask', 'workspace')]),
        candidate: decision('allow', [opDecision(0, 'allow', 'workspace')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect([group.severity, group.analyzabilityNoneCount]).toEqual(['critical', 1]);
  });

  test('a benign widening (workspace, reversible, full) is normal', () => {
    const ops = [operation(0, 'write', workspacePath)];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('ask', [opDecision(0, 'ask', 'workspace')]),
        candidate: decision('allow', [opDecision(0, 'allow', 'workspace')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.severity).toBe('normal');
  });

  test('narrowing is always normal, even from a critical Zone', () => {
    const ops = [operation(0, 'push', remoteTarget)];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('allow', [
          opDecision(0, 'allow', 'credentials', { reversibility: 'irreversible' }),
        ]),
        candidate: decision('deny', [opDecision(0, 'deny', 'credentials')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect([group.direction, group.severity]).toEqual(['narrowing', 'normal']);
  });
});

describe('group aggregation', () => {
  test('targetSummary sorts by count desc then key asc and truncates to five', () => {
    // Six distinct remotes; counts: k6->3, k5->2, others->1. Expect top five, k6 first.
    const remote = (key: string): Target => ({
      kind: 'vcs_remote',
      remoteName: null,
      remoteKey: key,
      branch: null,
    });
    const keys = [
      'h/o/r6',
      'h/o/r6',
      'h/o/r6',
      'h/o/r5',
      'h/o/r5',
      'h/o/r1',
      'h/o/r2',
      'h/o/r3',
      'h/o/r4',
    ];
    const cases: Case[] = keys.map((key, i) => {
      const ops = [operation(0, 'push', remote(key))];
      return {
        action: action(hex('a').slice(0, 63) + String(i), `2026-01-02T03:04:0${i}.000Z`, ops),
        baseline: decision('ask', [opDecision(0, 'ask', 'unknown_remote')]),
        candidate: decision('allow', [opDecision(0, 'allow', 'unknown_remote')]),
      };
    });
    const { actions, evaluateBaseline, evaluateCandidate } = scenario(cases);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect(group.targetSummary).toEqual([
      { key: 'h/o/r6', count: 3 },
      { key: 'h/o/r5', count: 2 },
      { key: 'h/o/r1', count: 1 },
      { key: 'h/o/r2', count: 1 },
      { key: 'h/o/r3', count: 1 },
    ]);
  });

  test('ruleIds drop null, dedup, and sort ascending', () => {
    const remote = (key: string): Target => ({
      kind: 'vcs_remote',
      remoteName: null,
      remoteKey: key,
      branch: null,
    });
    const cases: Case[] = [
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', [
          operation(0, 'push', remote('h/o/x')),
        ]),
        baseline: decision('ask', [
          opDecision(0, 'ask', 'unknown_remote', { decidingRuleId: 'zeta_rule' }),
        ]),
        candidate: decision('allow', [
          opDecision(0, 'allow', 'unknown_remote', { decidingRuleId: null }),
        ]),
      },
      {
        action: action(hex('b'), '2026-01-02T03:04:06.000Z', [
          operation(0, 'push', remote('h/o/y')),
        ]),
        baseline: decision('ask', [
          opDecision(0, 'ask', 'unknown_remote', { decidingRuleId: 'alpha_rule' }),
        ]),
        candidate: decision('allow', [
          opDecision(0, 'allow', 'unknown_remote', { decidingRuleId: 'alpha_rule' }),
        ]),
      },
    ];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario(cases);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect([group.baselineRuleIds, group.candidateRuleIds]).toEqual([
      ['alpha_rule', 'zeta_rule'],
      ['alpha_rule'],
    ]);
  });

  test('sampleActionKeys returns all when at most ten', () => {
    const cases: Case[] = Array.from({ length: 4 }, (_v, i) =>
      pushWideningCase(hex(String.fromCharCode(97 + i)), `2026-01-02T03:04:0${i}.000Z`),
    );
    const { actions, evaluateBaseline, evaluateCandidate } = scenario(cases);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.sampleActionKeys).toHaveLength(4);
  });

  test('sampleActionKeys keeps the first five and last five when over ten', () => {
    const cases: Case[] = Array.from({ length: 12 }, (_v, i) =>
      pushWideningCase(
        String(i).padStart(64, '0'),
        `2026-01-02T03:04:${String(i).padStart(2, '0')}.000Z`,
      ),
    );
    const { actions, evaluateBaseline, evaluateCandidate } = scenario(cases);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect(group.sampleActionKeys).toEqual([
      '0000000000000000000000000000000000000000000000000000000000000000',
      '0000000000000000000000000000000000000000000000000000000000000001',
      '0000000000000000000000000000000000000000000000000000000000000002',
      '0000000000000000000000000000000000000000000000000000000000000003',
      '0000000000000000000000000000000000000000000000000000000000000004',
      '0000000000000000000000000000000000000000000000000000000000000007',
      '0000000000000000000000000000000000000000000000000000000000000008',
      '0000000000000000000000000000000000000000000000000000000000000009',
      '0000000000000000000000000000000000000000000000000000000000000010',
      '0000000000000000000000000000000000000000000000000000000000000011',
    ]);
  });

  test('sessionCount is the distinct session count and occurrence bounds are min/max', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      pushWideningCase(hex('a'), '2026-01-02T03:04:07.000Z', 'session-1'),
      pushWideningCase(hex('b'), '2026-01-02T03:04:05.000Z', 'session-2'),
      pushWideningCase(hex('c'), '2026-01-02T03:04:06.000Z', 'session-1'),
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');
    expect([group.sessionCount, group.firstOccurredAt, group.lastOccurredAt]).toEqual([
      2,
      '2026-01-02T03:04:05.000Z',
      '2026-01-02T03:04:07.000Z',
    ]);
  });
});

describe('headline', () => {
  test('renders the fixed template with a Zone-change sentence', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      pushWideningCase(hex('a'), '2026-01-02T03:04:06.007Z'),
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.headline).toBe(
      'example.invalid/synthetic/project 1곳으로의 push 1건이 ' +
        "'확인 필요'에서 '허용'으로 바뀝니다. " +
        '기준 정책에서는 신뢰 목록에 없는 원격이었고 변경안에서는 신뢰하는 원격으로 분류됩니다.',
    );
  });

  test('omits the Zone sentence when the Zone is unchanged', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', [
          operation(0, 'write', workspacePath),
        ]),
        baseline: decision('ask', [opDecision(0, 'ask', 'workspace')]),
        candidate: decision('allow', [opDecision(0, 'allow', 'workspace')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.headline).toBe(
      "workspace 1곳으로의 쓰기 1건이 '확인 필요'에서 '허용'으로 바뀝니다.",
    );
  });

  test('counts distinct Target keys beyond the five-entry Target Summary', () => {
    const hosts = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => `${name}.invalid`);
    const { actions, evaluateBaseline, evaluateCandidate } = scenario(
      hosts.map((host, index) => ({
        action: action(hex(String(index)), '2026-01-02T03:04:05.000Z', [
          operation(0, 'fetch', { kind: 'host', host, scheme: 'https' }),
        ]),
        baseline: decision('ask', [opDecision(0, 'ask', 'unknown_remote')]),
        candidate: decision('allow', [opDecision(0, 'allow', 'unknown_remote')]),
      })),
    );
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.targetSummary).toHaveLength(5);
    expect(result.groups[0]?.headline).toBe(
      "a.invalid 등 7곳으로의 가져오기 7건이 '확인 필요'에서 '허용'으로 바뀝니다.",
    );
  });

  test('uses 으로 after 차단', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', [
          operation(0, 'write', workspacePath),
        ]),
        baseline: decision('allow', [opDecision(0, 'allow', 'workspace')]),
        candidate: decision('deny', [opDecision(0, 'deny', 'workspace')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.headline).toBe(
      "workspace 1곳으로의 쓰기 1건이 '허용'에서 '차단'으로 바뀝니다.",
    );
  });

  test('uses 로 after 호스트 when the Zone changes to host', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', [
          operation(0, 'fetch', { kind: 'host', host: 'example.invalid', scheme: 'https' }),
        ]),
        baseline: decision('ask', [opDecision(0, 'ask', 'credentials')]),
        candidate: decision('allow', [opDecision(0, 'allow', 'host')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(result.groups[0]?.headline).toBe(
      "example.invalid 1곳으로의 가져오기 1건이 '확인 필요'에서 '허용'으로 바뀝니다. " +
        '기준 정책에서는 자격 증명이었고 변경안에서는 호스트로 분류됩니다.',
    );
  });

  test('never contains the command fragment or ruleId', () => {
    const ops = [operation(0, 'push', remoteTarget, { fragment: 'git push --force origin main' })];
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      {
        action: action(hex('a'), '2026-01-02T03:04:05.000Z', ops),
        baseline: decision('ask', [
          opDecision(0, 'ask', 'unknown_remote', { decidingRuleId: 'force_push_rule' }),
        ]),
        candidate: decision('allow', [
          opDecision(0, 'allow', 'trusted_remote', { decidingRuleId: 'force_push_rule' }),
        ]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const headline = result.groups[0]?.headline ?? '';
    expect(headline.includes('--force')).toBe(false);
    expect(headline.includes('force_push_rule')).toBe(false);
  });
});

describe('sorting and determinism (I6)', () => {
  const baseCases = (): Case[] => [
    pushWideningCase(hex('b'), '2026-01-02T03:04:06.000Z'),
    unchangedWriteCase(hex('a'), '2026-01-02T03:04:05.000Z'),
    {
      action: action(hex('d'), '2026-01-02T03:04:08.000Z', [operation(0, 'delete', workspacePath)]),
      baseline: decision('allow', [opDecision(0, 'allow', 'workspace')]),
      candidate: decision('deny', [opDecision(0, 'deny', 'workspace')]),
    },
  ];

  test('groups sort by groupKey and changedActions by actionKey, both ascending', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario(baseCases());
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    const groupKeys = result.groups.map((group) => group.groupKey);
    const actionKeys = result.changedActions.map((changed) => changed.actionKey);
    expect(groupKeys).toEqual([...groupKeys].sort());
    expect(actionKeys).toEqual([...actionKeys].sort());
  });

  test('resultHash is stable across two runs and input permutations', () => {
    const built = scenario(baseCases());
    const reference = computeDiffWith(
      built.evaluateBaseline,
      built.evaluateCandidate,
      built.actions,
    );
    fc.assert(
      fc.property(fc.shuffledSubarray([0, 1, 2], { minLength: 3, maxLength: 3 }), (order) => {
        const cases = baseCases();
        const permuted = order.map((index) => cases[index]).filter((item) => item !== undefined);
        const built = scenario(permuted);
        const result = computeDiffWith(
          built.evaluateBaseline,
          built.evaluateCandidate,
          built.actions,
        );
        expect(result.resultHash).toBe(reference.resultHash);
      }),
    );
  });

  test('resultHash covers exactly the projection and excludes each headline', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario(baseCases());
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(sha256Hex(canonicalJson(hashedProjection(result)))).toBe(result.resultHash);
    const withHeadline = sha256Hex(
      canonicalJson({
        stats: result.stats,
        groups: result.groups,
        changedActions: result.changedActions,
      }),
    );
    expect(withHeadline).not.toBe(result.resultHash);
  });
});

describe('output shape', () => {
  test('the Diff Result conforms to the frozen DiffResultSchema', () => {
    const { actions, evaluateBaseline, evaluateCandidate } = scenario([
      unchangedWriteCase(hex('a'), '2026-01-02T03:04:05.006Z'),
      pushWideningCase(hex('b'), '2026-01-02T03:04:06.007Z'),
      {
        action: action(hex('c'), '2026-01-02T03:04:07.008Z', [
          operation(0, 'execute', { kind: 'unknown' }, { analyzability: 'none' }),
        ]),
        baseline: decision('ask', [opDecision(0, 'ask', 'host')]),
        candidate: decision('ask', [opDecision(0, 'ask', 'host')]),
      },
    ]);
    const result = computeDiffWith(evaluateBaseline, evaluateCandidate, actions);
    expect(DiffResultSchema.safeParse(result).success).toBe(true);
  });
});
