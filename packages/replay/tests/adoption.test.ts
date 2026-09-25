import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { invariant, IsoTimestampSchema } from '@authority/kernel';
import type { Effect } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Analyzability, Capability, Operation, Target } from '@authority/action/schema';
import type { Decision, OperationDecision, Zone } from '@authority/policy/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import { AdoptionResultSchema, type AdoptionResult } from '@authority/replay/schema';
import { computeAdoptionWith } from '../diff.ts';

type Evaluate = (operations: readonly Operation[]) => Decision | null;

interface Case {
  readonly action: ActionForReplay;
  readonly candidate: Decision | null;
}

function scenario(cases: readonly Case[]): { actions: ActionForReplay[]; evaluate: Evaluate } {
  const byOps = new Map<readonly Operation[], Decision | null>();
  for (const item of cases) {
    byOps.set(item.action.operations, item.candidate);
  }
  return {
    actions: cases.map((item) => item.action),
    evaluate: (operations) => {
      invariant(byOps.has(operations), 'scenario evaluator received unknown operations');
      return byOps.get(operations) ?? null;
    },
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
  extra?: { decidingRuleId?: string | null },
): OperationDecision {
  return {
    operationIndex: index,
    zone,
    reversibility: 'reversible',
    matchedRuleIds: [],
    decidingRuleId: extra?.decidingRuleId ?? null,
    effect,
    isMandateDependent: false,
  };
}

function decision(
  effect: Effect,
  operations: OperationDecision[],
  decidingOperationIndex = 0,
): Decision {
  return { effect, decidingOperationIndex, isMandateDependent: false, operations };
}

function action(
  actionKey: string,
  occurredAt: string,
  operations: Operation[],
  extra?: { sessionExternalId?: string },
): ActionForReplay {
  return {
    actionKey,
    sessionExternalId: extra?.sessionExternalId ?? 'synthetic-session-001',
    operations,
    observedOutcome: 'executed',
    occurredAt: IsoTimestampSchema.parse(occurredAt),
  };
}

const key = (n: number): string => String(n).padStart(64, '0');
const at = (n: number): string => `2026-01-02T03:04:${String(n).padStart(2, '0')}.000Z`;

const workspacePath: Target = {
  kind: 'path',
  path: '~/synthetic/note.txt',
  isInsideWorkspace: true,
};
const hostPath: Target = { kind: 'path', path: '/tmp/synthetic/out.txt', isInsideWorkspace: false };
const credentialPath: Target = {
  kind: 'path',
  path: '~/.synthetic-credentials/token',
  isInsideWorkspace: false,
};
const remoteTarget: Target = {
  kind: 'vcs_remote',
  remoteName: 'origin',
  remoteKey: 'example.invalid/synthetic/project',
  branch: 'feature/synthetic',
};

/** One single-Operation Action decided as `effect` in `zone`. */
function singleCase(
  actionKey: string,
  occurredAt: string,
  capability: Capability,
  target: Target,
  effect: Effect,
  zone: Zone,
  extra?: {
    program?: string | null;
    analyzability?: Analyzability;
    decidingRuleId?: string | null;
    sessionExternalId?: string;
    fragment?: string;
  },
): Case {
  const ops = [
    operation(0, capability, target, {
      program: extra?.program ?? null,
      analyzability: extra?.analyzability ?? 'full',
      ...(extra?.fragment === undefined ? {} : { fragment: extra.fragment }),
    }),
  ];
  return {
    action: action(
      actionKey,
      occurredAt,
      ops,
      extra?.sessionExternalId === undefined
        ? undefined
        : { sessionExternalId: extra.sessionExternalId },
    ),
    candidate: decision(effect, [
      opDecision(0, effect, zone, { decidingRuleId: extra?.decidingRuleId ?? null }),
    ]),
  };
}

const askPush = (n: number, program: string | null = 'git', session?: string): Case =>
  singleCase(key(n), at(n), 'push', remoteTarget, 'ask', 'unknown_remote', {
    program,
    decidingRuleId: 'push_policy',
    ...(session === undefined ? {} : { sessionExternalId: session }),
  });

/** The hashed projection: exactly the fields resultHash covers (headline excluded, groupKey order). */
function hashedProjection(result: AdoptionResult) {
  return {
    stats: result.stats,
    groups: [...result.groups]
      .sort((a, b) => (a.groupKey < b.groupKey ? -1 : 1))
      .map(({ headline: _headline, ...group }) => group),
    assignments: result.assignments,
  };
}

describe('stats', () => {
  test('counts totals, exclusions, Action Effects, analyzability, and the authority-map cells', () => {
    const { actions, evaluate } = scenario([
      singleCase(key(1), at(1), 'write', workspacePath, 'allow', 'workspace'),
      askPush(2),
      singleCase(key(3), at(3), 'read', credentialPath, 'deny', 'credentials'),
      singleCase(key(4), at(4), 'execute', { kind: 'unknown' }, 'ask', 'host', {
        analyzability: 'none',
      }),
      { action: action(key(5), at(5), []), candidate: null },
    ]);

    const result = computeAdoptionWith(evaluate, actions);

    expect(result.stats).toEqual({
      totalActions: 5,
      evaluatedActions: 4,
      excludedActions: 1,
      effectCounts: { allow: 1, ask: 2, deny: 1 },
      analyzability: { full: 3, partial: 0, none: 1 },
      cells: [
        { capability: 'execute', zone: 'host', effect: 'ask', count: 1 },
        { capability: 'push', zone: 'unknown_remote', effect: 'ask', count: 1 },
        { capability: 'read', zone: 'credentials', effect: 'deny', count: 1 },
        { capability: 'write', zone: 'workspace', effect: 'allow', count: 1 },
      ],
    });
  });

  test('allow Actions are counted but never grouped or assigned', () => {
    const { actions, evaluate } = scenario([
      singleCase(key(1), at(1), 'write', workspacePath, 'allow', 'workspace'),
      singleCase(key(2), at(2), 'read', workspacePath, 'allow', 'workspace'),
    ]);

    const result = computeAdoptionWith(evaluate, actions);

    expect([result.stats.effectCounts.allow, result.groups, result.assignments]).toEqual([
      2,
      [],
      [],
    ]);
  });
});

describe('grouping', () => {
  test('groups by Effect, Capability, and Zone of the deciding Operation and ignores program', () => {
    const { actions, evaluate } = scenario([askPush(1, 'git'), askPush(2, 'gh')]);

    const result = computeAdoptionWith(evaluate, actions);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      groupKey: sha256Hex(canonicalJson(['ask', 'push', 'unknown_remote'])),
      effect: 'ask',
      capability: 'push',
      zone: 'unknown_remote',
      program: null,
      programSummary: [
        { program: 'gh', count: 1 },
        { program: 'git', count: 1 },
      ],
      distinctProgramCount: 2,
      actionCount: 2,
    });
  });

  test('the signature Operation is the Decision deciding Operation', () => {
    // op0 read allow, op1 push ask: the Action asks because of op1.
    const ops = [operation(0, 'read', workspacePath), operation(1, 'push', remoteTarget)];
    const { actions, evaluate } = scenario([
      {
        action: action(key(1), at(1), ops),
        candidate: decision(
          'ask',
          [opDecision(0, 'allow', 'workspace'), opDecision(1, 'ask', 'unknown_remote')],
          1,
        ),
      },
    ]);

    const result = computeAdoptionWith(evaluate, actions);

    expect([result.groups[0]?.capability, result.groups[0]?.zone]).toEqual([
      'push',
      'unknown_remote',
    ]);
  });

  test('programSummary sorts by count desc then program asc with null first, and keeps ten', () => {
    const programs = [
      null,
      null,
      'zeta',
      'alpha',
      ...Array.from({ length: 9 }, (_v, i) => `p${i}`),
    ];
    const cases = programs.map((program, i) => askPush(i + 1, program));
    const { actions, evaluate } = scenario(cases);

    const result = computeAdoptionWith(evaluate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');

    expect(group.distinctProgramCount).toBe(12);
    expect(group.programSummary).toEqual([
      { program: null, count: 2 },
      { program: 'alpha', count: 1 },
      { program: 'p0', count: 1 },
      { program: 'p1', count: 1 },
      { program: 'p2', count: 1 },
      { program: 'p3', count: 1 },
      { program: 'p4', count: 1 },
      { program: 'p5', count: 1 },
      { program: 'p6', count: 1 },
      { program: 'p7', count: 1 },
    ]);
  });

  test('decidingRuleIds drop null, dedup, and sort ascending', () => {
    const { actions, evaluate } = scenario([
      singleCase(key(1), at(1), 'push', remoteTarget, 'ask', 'unknown_remote', {
        decidingRuleId: 'zeta_rule',
      }),
      singleCase(key(2), at(2), 'push', remoteTarget, 'ask', 'unknown_remote', {
        decidingRuleId: null,
      }),
      singleCase(key(3), at(3), 'push', remoteTarget, 'ask', 'unknown_remote', {
        decidingRuleId: 'alpha_rule',
      }),
      singleCase(key(4), at(4), 'push', remoteTarget, 'ask', 'unknown_remote', {
        decidingRuleId: 'alpha_rule',
      }),
    ]);

    const result = computeAdoptionWith(evaluate, actions);

    expect(result.groups[0]?.decidingRuleIds).toEqual(['alpha_rule', 'zeta_rule']);
  });

  test('targetSummary keeps the top five Target keys by count desc then key asc', () => {
    const remote = (remoteKey: string): Target => ({
      kind: 'vcs_remote',
      remoteName: null,
      remoteKey,
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
    const { actions, evaluate } = scenario(
      keys.map((remoteKey, i) =>
        singleCase(key(i + 1), at(i + 1), 'push', remote(remoteKey), 'ask', 'unknown_remote'),
      ),
    );

    const result = computeAdoptionWith(evaluate, actions);

    expect(result.groups[0]?.targetSummary).toEqual([
      { key: 'h/o/r6', count: 3 },
      { key: 'h/o/r5', count: 2 },
      { key: 'h/o/r1', count: 1 },
      { key: 'h/o/r2', count: 1 },
      { key: 'h/o/r3', count: 1 },
    ]);
  });

  test('sampleActionKeys keeps the first five and last five by occurredAt when over ten', () => {
    const { actions, evaluate } = scenario(Array.from({ length: 12 }, (_v, i) => askPush(i)));

    const result = computeAdoptionWith(evaluate, actions);

    expect(result.groups[0]?.sampleActionKeys).toEqual([0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map(key));
  });

  test('sessionCount is the distinct Session count, analyzabilityNoneCount and bounds follow the entries', () => {
    const { actions, evaluate } = scenario([
      singleCase(key(1), at(7), 'execute', { kind: 'unknown' }, 'ask', 'host', {
        analyzability: 'none',
        sessionExternalId: 'session-1',
      }),
      singleCase(key(2), at(5), 'execute', hostPath, 'ask', 'host', {
        sessionExternalId: 'session-2',
      }),
      singleCase(key(3), at(6), 'execute', hostPath, 'ask', 'host', {
        sessionExternalId: 'session-1',
      }),
    ]);

    const result = computeAdoptionWith(evaluate, actions);
    const group = result.groups[0];
    invariant(group !== undefined, 'expected one group');

    expect([
      group.actionCount,
      group.sessionCount,
      group.analyzabilityNoneCount,
      group.firstOccurredAt,
      group.lastOccurredAt,
    ]).toEqual([3, 2, 1, at(5), at(7)]);
  });
});

describe('headline', () => {
  test('renders the zone, capability, and count for an ask group', () => {
    const { actions, evaluate } = scenario([
      singleCase(key(1), at(1), 'read', hostPath, 'ask', 'host'),
      singleCase(key(2), at(2), 'read', hostPath, 'ask', 'host'),
    ]);

    const result = computeAdoptionWith(evaluate, actions);

    expect(result.groups[0]?.headline).toBe(
      "This policy gives 'ask' to 2 read Actions in the host Zone.",
    );
  });

  test('renders the deny form for a deny group', () => {
    const { actions, evaluate } = scenario([
      singleCase(key(1), at(1), 'read', credentialPath, 'deny', 'credentials'),
    ]);

    const result = computeAdoptionWith(evaluate, actions);

    expect(result.groups[0]?.headline).toBe(
      "This policy gives 'deny' to 1 read Action in the credentials Zone.",
    );
  });

  test('never contains the command fragment, program, or ruleId', () => {
    const { actions, evaluate } = scenario([
      singleCase(key(1), at(1), 'push', remoteTarget, 'ask', 'unknown_remote', {
        program: 'git',
        decidingRuleId: 'force_push_rule',
        fragment: 'git push --force origin main',
      }),
    ]);

    const result = computeAdoptionWith(evaluate, actions);
    const headline = result.groups[0]?.headline ?? '';

    expect([
      headline.includes('--force'),
      headline.includes('git'),
      headline.includes('force_push_rule'),
    ]).toEqual([false, false, false]);
  });
});

describe('ordering and determinism', () => {
  const reviewCases = (): Case[] => [
    askPush(1, 'git', 's1'),
    askPush(2, 'git', 's1'),
    askPush(3, 'git', 's1'),
    singleCase(key(4), at(4), 'read', hostPath, 'ask', 'host', { sessionExternalId: 's1' }),
    singleCase(key(5), at(5), 'read', hostPath, 'ask', 'host', { sessionExternalId: 's2' }),
    singleCase(key(6), at(6), 'write', hostPath, 'ask', 'host', { sessionExternalId: 's1' }),
    singleCase(key(7), at(7), 'write', hostPath, 'ask', 'host', { sessionExternalId: 's1' }),
    singleCase(key(8), at(8), 'read', credentialPath, 'deny', 'credentials'),
    singleCase(key(9), at(9), 'write', workspacePath, 'allow', 'workspace'),
  ];

  test('groups sort deny first, then actionCount desc, then sessionCount desc', () => {
    const { actions, evaluate } = scenario(reviewCases());

    const result = computeAdoptionWith(evaluate, actions);

    expect(
      result.groups.map((group) => [
        group.effect,
        group.capability,
        group.actionCount,
        group.sessionCount,
      ]),
    ).toEqual([
      ['deny', 'read', 1, 1],
      ['ask', 'push', 3, 1],
      ['ask', 'read', 2, 2],
      ['ask', 'write', 2, 1],
    ]);
  });

  test('assignments cover exactly the ask and deny Actions, sorted by actionKey', () => {
    const { actions, evaluate } = scenario(reviewCases());

    const result = computeAdoptionWith(evaluate, actions);
    const byGroup = new Map(result.groups.map((group) => [group.groupKey, group]));

    expect(result.assignments.map((assignment) => assignment.actionKey)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map(key),
    );
    expect(
      result.assignments.every(
        (assignment) => byGroup.get(assignment.groupKey)?.effect === assignment.effect,
      ),
    ).toBe(true);
  });

  test('resultHash covers exactly the projection and excludes each headline', () => {
    const { actions, evaluate } = scenario(reviewCases());

    const result = computeAdoptionWith(evaluate, actions);

    expect(sha256Hex(canonicalJson(hashedProjection(result)))).toBe(result.resultHash);
    expect(
      sha256Hex(canonicalJson({ ...hashedProjection(result), groups: result.groups })),
    ).not.toBe(result.resultHash);
  });

  test.each(['rejected_by_human', 'blocked_by_runtime', 'unknown'] as const)(
    'the result is unchanged when every observedOutcome is %s',
    (outcome) => {
      const { actions, evaluate } = scenario(reviewCases());
      const reference = computeAdoptionWith(evaluate, actions);

      const result = computeAdoptionWith(
        evaluate,
        actions.map((item) => ({ ...item, observedOutcome: outcome })),
      );

      expect(result).toEqual(reference);
    },
  );

  test('resultHash and groupKeys are pinned to fixed values', () => {
    const { actions, evaluate } = scenario(reviewCases());

    const result = computeAdoptionWith(evaluate, actions);

    expect({
      resultHash: result.resultHash,
      groupKeys: result.groups.map((group) => group.groupKey),
    }).toEqual({
      resultHash: '466a23342755a7afcb8bad9d650395c1dea7903e89e2cc080ffeb2196561e609',
      groupKeys: [
        '7586de0b344a5e367426d6c4587af4652e615c5ec40fa18f1942030c147f31b1',
        '0faa462702eefe5b3854dd9821f349587cb4c215941bea619789a7b6ad941cb2',
        'b3a0daf06e6afd5e93b7ebdc268be53b4ae61c44aa8126001afcb49d2fd71539',
        '078ec3021340ce1d7fbe4abe47cc20ddfe5b9318cf516ce4b10f9e04034ccd76',
      ],
    });
  });

  test('resultHash changes when only the program mix inside a group changes', () => {
    const git = computeAdoptionWith(...toArgs(scenario([askPush(1, 'git'), askPush(2, 'git')])));
    const mixed = computeAdoptionWith(...toArgs(scenario([askPush(1, 'git'), askPush(2, 'gh')])));

    expect(git.groups.map((group) => group.groupKey)).toEqual(
      mixed.groups.map((group) => group.groupKey),
    );
    expect(mixed.resultHash).not.toBe(git.resultHash);
  });

  test('resultHash and group order are stable across input permutations', () => {
    const reference = computeAdoptionWith(...toArgs(scenario(reviewCases())));
    const indices = reviewCases().map((_case, i) => i);
    fc.assert(
      fc.property(fc.shuffledSubarray(indices, { minLength: indices.length }), (order) => {
        const cases = reviewCases();
        const permuted = order.map((index) => cases[index]).filter((item) => item !== undefined);
        const result = computeAdoptionWith(...toArgs(scenario(permuted)));
        expect(result.resultHash).toBe(reference.resultHash);
        expect(result.groups).toEqual(reference.groups);
      }),
    );
  });
});

function toArgs(built: {
  actions: ActionForReplay[];
  evaluate: Evaluate;
}): [Evaluate, ActionForReplay[]] {
  return [built.evaluate, built.actions];
}

describe('invariants and output shape', () => {
  test('throws on a duplicate actionKey', () => {
    const { actions, evaluate } = scenario([askPush(1), askPush(1)]);
    expect(() => computeAdoptionWith(evaluate, actions)).toThrow(/duplicate actionKey/);
  });

  test('the Adoption Result conforms to the frozen AdoptionResultSchema', () => {
    const { actions, evaluate } = scenario([
      askPush(1),
      singleCase(key(2), at(2), 'read', credentialPath, 'deny', 'credentials'),
      singleCase(key(3), at(3), 'write', workspacePath, 'allow', 'workspace'),
      { action: action(key(4), at(4), []), candidate: null },
    ]);

    const result = computeAdoptionWith(evaluate, actions);

    expect(AdoptionResultSchema.safeParse(result).success).toBe(true);
  });

  test('every group matches an authority-map cell with the same count', () => {
    const { actions, evaluate } = scenario(reviewCasesForCells());

    const result = computeAdoptionWith(evaluate, actions);

    for (const group of result.groups) {
      const cell = result.stats.cells.find(
        (candidate) =>
          candidate.capability === group.capability &&
          candidate.zone === group.zone &&
          candidate.effect === group.effect,
      );
      expect(cell?.count).toBe(group.actionCount);
    }
  });
});

function reviewCasesForCells(): Case[] {
  return [
    askPush(1),
    askPush(2),
    singleCase(key(3), at(3), 'read', credentialPath, 'deny', 'credentials'),
    singleCase(key(4), at(4), 'write', workspacePath, 'allow', 'workspace'),
  ];
}
