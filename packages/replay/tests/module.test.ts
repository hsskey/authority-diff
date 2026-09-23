import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { IsoTimestampSchema } from '@authority/kernel';
import { createFixedClock, createSequentialIdGenerator } from '@authority/platform/testing';
import { PolicyDocumentSchema, PolicyVersionIdSchema } from '@authority/policy/schema';
import type { PolicyVersionId, PolicyVersionStatus } from '@authority/policy/schema';
import type { ActionReader } from '@authority/trace';
import { ActionForReplaySchema, StoredAgentActionSchema } from '@authority/trace/schema';
import type {
  ActionForReplay,
  ObservationForReplay,
  StoredAgentAction,
} from '@authority/trace/schema';
import { assembleReplayModule } from '../index.ts';
import type { AnalyzabilityCounts, AuthorityMapCell, PolicyReader, ReplayStore } from '../index.ts';
import { computeAdoption, computeDiff } from '../diff.ts';
import { ReplayRunIdSchema, ReplayRunSchema } from '../schema.ts';
import type {
  ConformanceFinding,
  ReplayRun,
  StoredAdoptionGroup,
  StoredDiffGroup,
} from '../schema.ts';
import actionFixture from '../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import baselineFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidateFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };

const actions = z.array(ActionForReplaySchema).parse(actionFixture);
const baselineDocument = PolicyDocumentSchema.parse(baselineFixture);
const candidateDocument = PolicyDocumentSchema.parse(candidateFixture);

const CLASSIFIER_VERSION = 'test-classifier-1';
const NOW = IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z');
const WINDOW = {
  windowFrom: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
  windowTo: IsoTimestampSchema.parse('2026-01-31T23:59:59.999Z'),
};

const ids = createSequentialIdGenerator();
const baselineVersionId = PolicyVersionIdSchema.parse(ids.next('pver'));
const candidateVersionId = PolicyVersionIdSchema.parse(ids.next('pver'));

function toStored(action: ActionForReplay): StoredAgentAction {
  return StoredAgentActionSchema.parse({
    ...action,
    toolName: 'Bash',
    toolInputRedacted: 'synthetic redacted input',
    isInputTruncated: false,
    isSidechain: false,
    classifierVersion: CLASSIFIER_VERSION,
    recordedAt: NOW,
  });
}

const storedActions = actions.map(toStored);

const TOOL_INPUT_HASH = 'c'.repeat(64);

function observation(
  target: ActionForReplay,
  event: 'pre_tool_use' | 'permission_request',
  actionKey: string | null = target.actionKey,
): ObservationForReplay {
  return {
    actionKey,
    event,
    sessionExternalId: target.sessionExternalId,
    toolName: 'Bash',
    toolInputHash: TOOL_INPUT_HASH,
    hookDecision: null,
    occurredAt: target.occurredAt,
  };
}

interface FakeStore extends ReplayStore {
  readonly runs: Map<string, ReplayRun>;
}

function makeStore(): FakeStore {
  const runs = new Map<string, ReplayRun>();
  const groups = new Map<string, StoredDiffGroup[]>();
  const adoptionGroups = new Map<string, StoredAdoptionGroup[]>();
  const matrices = new Map<string, readonly AuthorityMapCell[]>();
  const analyzabilityCounts = new Map<string, AnalyzabilityCounts>();
  const findings = new Map<string, readonly ConformanceFinding[]>();
  const unpaired = new Map<string, number>();
  const completedNewestFirst = () =>
    [...runs.values()]
      .filter((run) => run.status === 'completed')
      .sort((a, b) => ((a.completedAt ?? '') < (b.completedAt ?? '') ? 1 : -1));
  return {
    runs,
    findCompletedByInputsHash: (inputsHash) =>
      Promise.resolve(
        [...runs.values()].find(
          (run) => run.inputsHash === inputsHash && run.status === 'completed',
        ) ?? null,
      ),
    insertQueuedRun: (run) => {
      runs.set(run.id, run);
      return Promise.resolve();
    },
    markRunning: (id, startedAt) => {
      const run = runs.get(id);
      if (run !== undefined) {
        runs.set(id, { ...run, status: 'running', startedAt });
      }
      return Promise.resolve();
    },
    recordCompletion: (input) => {
      const run = runs.get(input.replayRunId);
      if (run !== undefined) {
        // The stored stats jsonb is parsed back by kind, as the drizzle store does.
        runs.set(
          input.replayRunId,
          ReplayRunSchema.parse({
            ...run,
            status: 'completed',
            resultHash: input.resultHash,
            stats: input.stats,
            completedAt: input.completedAt,
          }),
        );
      }
      groups.set(input.replayRunId, [...input.groups]);
      adoptionGroups.set(input.replayRunId, [...input.adoptionGroups]);
      findings.set(
        input.replayRunId,
        input.findings.map(({ replayRunId: _replayRunId, ...finding }) => finding),
      );
      if ('matrix' in input.stats) {
        matrices.set(input.replayRunId, input.stats.matrix);
        unpaired.set(input.replayRunId, input.stats.unpairedPermissionRequests ?? 0);
      }
      analyzabilityCounts.set(input.replayRunId, input.stats.analyzability);
      return Promise.resolve();
    },
    markFailed: (id, errorCode, completedAt) => {
      const run = runs.get(id);
      if (run !== undefined) {
        runs.set(id, { ...run, status: 'failed', errorCode, completedAt });
      }
      return Promise.resolve();
    },
    getRun: (id) => Promise.resolve(runs.get(id) ?? null),
    listDiffGroups: (query) => {
      const items = (groups.get(query.replayRunId) ?? [])
        .filter((group) => query.direction === undefined || group.direction === query.direction)
        .filter((group) => query.severity === undefined || group.severity === query.severity)
        .sort((a, b) => (a.groupKey < b.groupKey ? -1 : a.groupKey > b.groupKey ? 1 : 0));
      return Promise.resolve({ items, nextCursor: null });
    },
    getDiffGroup: (id, groupKey) =>
      Promise.resolve((groups.get(id) ?? []).find((group) => group.groupKey === groupKey) ?? null),
    listAdoptionGroups: (query) => {
      const ordered = (adoptionGroups.get(query.replayRunId) ?? [])
        .filter((group) => query.effect === undefined || group.effect === query.effect)
        .sort((a, b) => a.position - b.position);
      const after =
        query.cursor === undefined
          ? -1
          : (ordered.find((group) => group.groupKey === query.cursor)?.position ?? Infinity);
      const items = ordered.filter((group) => group.position > after).slice(0, query.limit);
      return Promise.resolve({ items, nextCursor: null });
    },
    getAdoptionGroup: (id, groupKey) =>
      Promise.resolve(
        (adoptionGroups.get(id) ?? []).find((group) => group.groupKey === groupKey) ?? null,
      ),
    failStaleRunningRuns: (input) => {
      const olderThan = new Date(Date.parse(input.now) - input.staleMs).toISOString();
      let failed = 0;
      for (const [id, run] of runs) {
        if (run.status === 'running' && run.startedAt !== null && run.startedAt < olderThan) {
          runs.set(id, {
            ...run,
            status: 'failed',
            errorCode: input.errorCode,
            completedAt: input.now,
          });
          failed += 1;
        }
      }
      return Promise.resolve(failed);
    },
    findLatestConformanceRun: () => {
      const run = completedNewestFirst().find((candidate) => candidate.kind === 'conformance');
      return Promise.resolve(
        run === undefined
          ? null
          : {
              replayRunId: run.id,
              candidateVersionId: run.candidateVersionId,
              windowFrom: run.windowFrom,
              windowTo: run.windowTo,
              unpairedPermissionRequests: unpaired.get(run.id) ?? 0,
            },
      );
    },
    listConformanceFindings: (id) => Promise.resolve(findings.get(id) ?? []),
    listCompletedRunsNewestFirst: () =>
      Promise.resolve(
        completedNewestFirst()
          .filter((run) => run.kind === 'version_diff')
          .map((run) => ({
            replayRunId: run.id,
            candidateVersionId: run.candidateVersionId,
            windowFrom: run.windowFrom,
            windowTo: run.windowTo,
            matrix: matrices.get(run.id) ?? [],
            analyzability: analyzabilityCounts.get(run.id) ?? { full: 0, partial: 0, none: 0 },
          })),
      ),
  };
}

function makeReader(overrides: Partial<ActionReader> = {}): ActionReader {
  return {
    streamActions: async function* () {
      await Promise.resolve();
      yield actions;
    },
    getActions: (keys) =>
      Promise.resolve(storedActions.filter((action) => keys.includes(action.actionKey))),
    countStaleClassifications: () => Promise.resolve(0),
    listObservationSessions: () => Promise.resolve([]),
    getObservations: () => Promise.resolve([]),
    ...overrides,
  };
}

function makePolicy(
  overrides: { baselineStatus?: PolicyVersionStatus; candidateStatus?: PolicyVersionStatus } = {},
): PolicyReader {
  const versions = new Map<PolicyVersionId, PolicyVersionStatus>([
    [baselineVersionId, overrides.baselineStatus ?? 'accepted'],
    [candidateVersionId, overrides.candidateStatus ?? 'accepted'],
  ]);
  return {
    getVersion: (id) => {
      const status = versions.get(id);
      if (status === undefined) {
        return Promise.resolve(null);
      }
      const document = id === baselineVersionId ? baselineDocument : candidateDocument;
      return Promise.resolve({ document, contentHash: `hash-${id}`, status });
    },
  };
}

function makeModule(
  parts: { store?: FakeStore; reader?: ActionReader; policy?: PolicyReader } = {},
) {
  const store = parts.store ?? makeStore();
  return {
    store,
    module: assembleReplayModule({
      store,
      reader: parts.reader ?? makeReader(),
      policy: parts.policy ?? makePolicy(),
      clock: createFixedClock(NOW),
      idGenerator: createSequentialIdGenerator(),
      classifierVersion: CLASSIFIER_VERSION,
    }),
  };
}

function requestInput() {
  return { baselineVersionId, candidateVersionId, ...WINDOW };
}

async function runToCompletion(module: ReturnType<typeof makeModule>['module']) {
  const result = await module.requestReplay(requestInput());
  if (!result.ok) {
    throw new Error(`requestReplay failed: ${result.error.code}`);
  }
  await result.value.execution;
  return result.value;
}

describe('replay module', () => {
  test('stores the same resultHash as the local diff pipeline for the same input', async () => {
    const { module } = makeModule();
    const local = computeDiff({
      actions,
      baseline: baselineDocument,
      candidate: candidateDocument,
    });

    const { run } = await runToCompletion(module);
    const stored = await module.getRun(run.id);

    expect(stored?.status).toBe('completed');
    expect(stored?.resultHash).toBe(local.resultHash);
  });

  // I6: a repeated request is idempotent by inputsHash.
  test('I6: the same request twice yields the same run id and resultHash', async () => {
    const { module } = makeModule();

    const first = await module.requestReplay(requestInput());
    if (!first.ok) {
      throw new Error(first.error.code);
    }
    expect(first.value.reused).toBe(false);
    await first.value.execution;
    const completed = await module.getRun(first.value.run.id);

    const second = await module.requestReplay(requestInput());
    if (!second.ok) {
      throw new Error(second.error.code);
    }
    expect(second.value.reused).toBe(true);
    expect(second.value.run.id).toBe(first.value.run.id);
    expect(completed?.resultHash).not.toBeNull();
    expect(second.value.run.resultHash).toBe(completed?.resultHash);
  });

  test('classifier version mismatch returns replay.classifier_version_mismatch', async () => {
    const { module } = makeModule({
      reader: makeReader({ countStaleClassifications: () => Promise.resolve(2) }),
    });

    const result = await module.requestReplay(requestInput());
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected an error');
    }
    expect(result.error.code).toBe('replay.classifier_version_mismatch');
  });

  test('an unknown baseline version returns replay.source_invalid', async () => {
    const { module } = makeModule({
      policy: {
        getVersion: (id) =>
          id === candidateVersionId
            ? Promise.resolve({ document: candidateDocument, contentHash: 'h', status: 'accepted' })
            : Promise.resolve(null),
      },
    });

    const result = await module.requestReplay(requestInput());
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected an error');
    }
    expect(result.error.code).toBe('replay.source_invalid');
  });

  test('samples recompute both decisions for the changed group', async () => {
    const { module } = makeModule();
    const { run } = await runToCompletion(module);

    const listed = await module.listDiffGroups(run.id, { limit: 50 });
    if (!listed.ok) {
      throw new Error(listed.error.code);
    }
    const group = listed.ok ? listed.value.items[0] : undefined;
    if (group === undefined) {
      throw new Error('expected one diff group');
    }

    const samples = await module.getSamples(run.id, group.groupKey);
    if (!samples.ok) {
      throw new Error(samples.error.code);
    }
    expect(samples.value).toHaveLength(1);
    const sample = samples.value[0];
    expect(sample?.baselineDecision.effect).toBe('ask');
    expect(sample?.candidateDecision.effect).toBe('allow');
  });

  test('samples carry each Operation Target key and the deciding rule rationale', async () => {
    const { module } = makeModule();
    const { run } = await runToCompletion(module);
    const listed = await module.listDiffGroups(run.id, { limit: 50 });
    const groupKey = listed.ok ? listed.value.items[0]?.groupKey : undefined;
    if (groupKey === undefined) {
      throw new Error('expected one diff group');
    }

    const samples = await module.getSamples(run.id, groupKey);

    expect(samples.ok ? samples.value[0] : null).toMatchObject({
      targetKeys: ['example.invalid/synthetic/project'],
      baselineRuleRationales: { push_policy: 'Synthetic rule controls remote publication.' },
      candidateRuleRationales: { push_policy: 'Synthetic rule controls remote publication.' },
    });
  });

  test('listDiffGroups on an unknown run returns replay.run_not_found', async () => {
    const { module } = makeModule();
    const missing = ReplayRunIdSchema.parse('rpl_0000000000000000000000000Z');

    const result = await module.listDiffGroups(missing, { limit: 50 });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected an error');
    }
    expect(result.error.code).toBe('replay.run_not_found');
  });

  test('authority-map returns the matrix of the completed run when the candidate is accepted', async () => {
    const { module } = makeModule();
    await runToCompletion(module);

    const map = await module.getAuthorityMap();

    expect(map.run).not.toBeNull();
    expect(map.run?.policyVersionId).toBe(candidateVersionId);
    const total = map.cells.reduce((sum, cell) => sum + cell.count, 0);
    expect(total).toBe(3);
    expect(map.analyzability).toEqual({ full: 2, partial: 0, none: 1 });
  });

  test('authority-map returns run null when no completed run candidate is accepted', async () => {
    const { module } = makeModule({ policy: makePolicy({ candidateStatus: 'draft' }) });
    await runToCompletion(module);

    const map = await module.getAuthorityMap();

    expect(map.run).toBeNull();
    expect(map.cells).toEqual([]);
    expect(map.analyzability).toEqual({ full: 0, partial: 0, none: 0 });
  });

  test('recoverInterruptedRuns fails a run left running past 60 seconds', async () => {
    const { store, module } = makeModule();
    const staleId = ReplayRunIdSchema.parse('rpl_0000000000000000000000000S');
    store.runs.set(staleId, {
      id: staleId,
      kind: 'version_diff',
      baselineVersionId,
      candidateVersionId,
      windowFrom: WINDOW.windowFrom,
      windowTo: WINDOW.windowTo,
      status: 'running',
      classifierVersion: CLASSIFIER_VERSION,
      inputsHash: 'a'.repeat(64),
      resultHash: null,
      stats: null,
      errorCode: null,
      createdAt: IsoTimestampSchema.parse('2026-01-31T23:00:00.000Z'),
      startedAt: IsoTimestampSchema.parse('2026-01-31T23:58:00.000Z'),
      completedAt: null,
    });

    await module.recoverInterruptedRuns();

    const recovered = store.runs.get(staleId);
    expect(recovered?.status).toBe('failed');
    expect(recovered?.errorCode).toBe('replay.interrupted');
  });

  test('a conformance run lists its findings against the candidate version', async () => {
    const pushAction = actions[1];
    if (pushAction === undefined) {
      throw new Error('fixture has a push Action');
    }
    const { module } = makeModule({
      reader: makeReader({
        getObservations: () =>
          Promise.resolve([
            observation(pushAction, 'pre_tool_use'),
            observation(pushAction, 'permission_request', null),
          ]),
      }),
    });

    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    await requested.value.execution;
    const listed = await module.listConformanceFindings();

    expect(listed.run?.replayRunId).toBe(requested.value.run.id);
    expect(listed.run?.policyVersionId).toBe(candidateVersionId);
    expect(listed.items.map((finding) => [finding.kind, finding.capability])).toEqual([
      ['over_asked', 'push'],
    ]);
  });

  test('a conformance run is stored with kind conformance and no baseline version', async () => {
    const { module } = makeModule();

    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }

    expect([requested.value.run.kind, requested.value.run.baselineVersionId]).toEqual([
      'conformance',
      null,
    ]);
  });

  test('a conformance run reports the permission_requests no pre_tool_use matched', async () => {
    const target = actions[0];
    if (target === undefined) {
      throw new Error('fixture has an Action');
    }
    const { module } = makeModule({
      reader: makeReader({
        getObservations: () => Promise.resolve([observation(target, 'permission_request', null)]),
      }),
    });

    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    await requested.value.execution;
    const listed = await module.listConformanceFindings();

    expect(listed.run?.unpairedPermissionRequests).toBe(1);
  });

  test('a permission_request with null tool identity in another Session inside the window counts as unpaired', async () => {
    const orphanSession = 'orphan-session';
    const orphanRequest: ObservationForReplay = {
      actionKey: null,
      event: 'permission_request',
      sessionExternalId: orphanSession,
      toolName: null,
      toolInputHash: null,
      hookDecision: null,
      occurredAt: IsoTimestampSchema.parse('2026-01-02T02:46:00.000Z'),
    };
    const { module } = makeModule({
      reader: makeReader({
        listObservationSessions: () => Promise.resolve([orphanSession]),
        getObservations: (sessionExternalIds) =>
          Promise.resolve(sessionExternalIds.includes(orphanSession) ? [orphanRequest] : []),
      }),
    });

    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    await requested.value.execution;
    const listed = await module.listConformanceFindings();

    expect(listed.run?.unpairedPermissionRequests).toBe(1);
  });

  test('a new observation makes a repeated conformance request run again', async () => {
    const observations: ObservationForReplay[] = [];
    const { module } = makeModule({
      reader: makeReader({ getObservations: () => Promise.resolve([...observations]) }),
    });
    const first = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!first.ok) {
      throw new Error(first.error.code);
    }
    await first.value.execution;
    const target = actions[0];
    if (target === undefined) {
      throw new Error('fixture has an Action');
    }
    observations.push(observation(target, 'pre_tool_use'));

    const second = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });

    expect(second.ok && second.value.reused).toBe(false);
  });

  test('authority-map ignores a completed conformance run', async () => {
    const { module } = makeModule();
    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    await requested.value.execution;

    const map = await module.getAuthorityMap();

    expect(map.run).toBeNull();
  });

  describe('adoption run', () => {
    // The baseline fixture asks on the push Action, so the adoption preview has groups.
    const adoptionInput = () => ({ candidateVersionId: baselineVersionId, ...WINDOW });

    async function runAdoption(module: ReturnType<typeof makeModule>['module']) {
      const result = await module.requestAdoptionReplay(adoptionInput());
      if (!result.ok) {
        throw new Error(`requestAdoptionReplay failed: ${result.error.code}`);
      }
      await result.value.execution;
      return result.value;
    }

    test('stores kind adoption, no baseline, and the local adoption pipeline resultHash and stats', async () => {
      const { module } = makeModule();
      const local = computeAdoption({ actions, candidate: baselineDocument });

      const { run } = await runAdoption(module);
      const stored = await module.getRun(run.id);

      expect([run.kind, run.baselineVersionId, run.candidateVersionId]).toEqual([
        'adoption',
        null,
        baselineVersionId,
      ]);
      expect(stored?.status).toBe('completed');
      expect(stored?.resultHash).toBe(local.resultHash);
      expect(stored?.stats).toEqual(local.stats);
    });

    test('I6: the same adoption request twice yields the same run id and resultHash', async () => {
      const { module } = makeModule();

      const first = await runAdoption(module);
      const completed = await module.getRun(first.run.id);
      const second = await module.requestAdoptionReplay(adoptionInput());
      if (!second.ok) {
        throw new Error(second.error.code);
      }

      expect([first.reused, second.value.reused]).toEqual([false, true]);
      expect(second.value.run.id).toBe(first.run.id);
      expect(completed?.resultHash).not.toBeNull();
      expect(second.value.run.resultHash).toBe(completed?.resultHash);
    });

    test('lists the Adoption Groups in review order and filters by effect', async () => {
      const { module } = makeModule();
      const local = computeAdoption({ actions, candidate: baselineDocument });
      const { run } = await runAdoption(module);

      const all = await module.listAdoptionGroups(run.id, { limit: 50 });
      const denies = await module.listAdoptionGroups(run.id, { effect: 'deny', limit: 50 });

      expect(all.ok ? all.value.items : null).toEqual(local.groups);
      expect(local.groups.length).toBeGreaterThan(0);
      expect(denies.ok ? denies.value.items : null).toEqual([]);
    });

    test('adoption samples carry the candidate Decision, Target keys, and the deciding rule rationale', async () => {
      const { module } = makeModule();
      const { run } = await runAdoption(module);
      const listed = await module.listAdoptionGroups(run.id, { limit: 50 });
      const pushGroup = listed.ok
        ? listed.value.items.find((group) => group.capability === 'push')
        : undefined;
      if (pushGroup === undefined) {
        throw new Error('expected the push adoption group');
      }

      const samples = await module.getAdoptionSamples(run.id, pushGroup.groupKey);

      expect(samples.ok ? samples.value : null).toMatchObject([
        {
          targetKeys: ['example.invalid/synthetic/project'],
          candidateDecision: { effect: 'ask' },
          candidateRuleRationales: { push_policy: 'Synthetic rule controls remote publication.' },
        },
      ]);
    });

    test('adoption samples of an unknown group return replay.group_not_found', async () => {
      const { module } = makeModule();
      const { run } = await runAdoption(module);

      const result = await module.getAdoptionSamples(run.id, 'f'.repeat(64));

      expect(result.ok ? null : result.error.code).toBe('replay.group_not_found');
    });

    test('an unknown candidate version returns replay.source_invalid', async () => {
      const { module } = makeModule();

      const result = await module.requestAdoptionReplay({
        candidateVersionId: PolicyVersionIdSchema.parse('pver_0000000000000000000000000Z'),
        ...WINDOW,
      });

      expect(result.ok ? null : result.error.code).toBe('replay.source_invalid');
    });

    test('authority-map ignores a completed adoption run', async () => {
      const { module } = makeModule();
      await runAdoption(module);

      const map = await module.getAuthorityMap();

      expect(map.run).toBeNull();
    });
  });
});
