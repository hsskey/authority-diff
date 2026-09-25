import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { IsoTimestampSchema } from '@authority/kernel';
import {
  createFixedClock,
  createMemoryJobQueue,
  createMemoryLogger,
  createSequentialIdGenerator,
} from '@authority/platform/testing';
import type { MemoryJobQueue } from '@authority/platform/testing';
import { PolicyDocumentSchema, PolicyVersionIdSchema } from '@authority/policy/schema';
import type { PolicyVersionId, PolicyVersionStatus } from '@authority/policy/schema';
import type { ActionReader } from '@authority/trace';
import { ActionForReplaySchema, StoredAgentActionSchema } from '@authority/trace/schema';
import type {
  ActionForReplay,
  ObservationForReplay,
  StoredAgentAction,
} from '@authority/trace/schema';
import { assembleReplayModule, REPLAY_RUN_JOB } from '../index.ts';
import type {
  AnalyzabilityCounts,
  AuthorityMapCell,
  PolicyReader,
  ReplayModule,
  ReplayStore,
} from '../index.ts';
import { computeAdoption, computeDiff } from '../diff.ts';
import { ReplayRunIdSchema, ReplayRunSchema } from '../schema.ts';
import type {
  ConformanceFindingView,
  PermissionModeCount,
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
  permissionMode: string | null = null,
): ObservationForReplay {
  return {
    actionKey,
    event,
    sessionExternalId: target.sessionExternalId,
    toolName: 'Bash',
    toolInputHash: TOOL_INPUT_HASH,
    hookDecision: null,
    permissionMode,
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
  const findings = new Map<string, ConformanceFindingView[]>();
  const unpaired = new Map<string, number>();
  const byPermissionMode = new Map<string, readonly PermissionModeCount[]>();
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
      if (run?.status !== 'queued') {
        return Promise.resolve(false);
      }
      runs.set(id, { ...run, status: 'running', startedAt });
      return Promise.resolve(true);
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
        input.findings.map(({ replayRunId: _replayRunId, ...finding }) => ({
          ...finding,
          status: finding.status,
          note: finding.note,
        })),
      );
      if ('matrix' in input.stats) {
        matrices.set(input.replayRunId, input.stats.matrix);
        unpaired.set(input.replayRunId, input.stats.unpairedPermissionRequests ?? 0);
        byPermissionMode.set(input.replayRunId, input.stats.byPermissionMode ?? []);
      } else {
        matrices.set(input.replayRunId, input.stats.cells);
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
    listQueuedRunIds: () =>
      Promise.resolve(
        [...runs.values()].filter((run) => run.status === 'queued').map((run) => run.id),
      ),
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
              byPermissionMode: byPermissionMode.get(run.id) ?? [],
            },
      );
    },
    listConformanceFindings: (id) => Promise.resolve(findings.get(id) ?? []),
    getConformanceFinding: (id, findingKey) =>
      Promise.resolve(
        (findings.get(id) ?? []).find((finding) => finding.findingKey === findingKey) ?? null,
      ),
    acknowledgeConformanceFinding: (id, findingKey, note) => {
      const items = findings.get(id) ?? [];
      const index = items.findIndex((finding) => finding.findingKey === findingKey);
      const current = items[index];
      if (current === undefined) {
        return Promise.resolve(null);
      }
      const updated = { ...current, status: 'acknowledged' as const, note };
      findings.set(
        id,
        items.map((finding, i) => (i === index ? updated : finding)),
      );
      return Promise.resolve(updated);
    },
    listCompletedRunsNewestFirst: () =>
      Promise.resolve(
        completedNewestFirst()
          .filter((run) => run.kind === 'version_diff' || run.kind === 'adoption')
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
  parts: { store?: FakeStore; reader?: ActionReader; policy?: PolicyReader; worker?: boolean } = {},
) {
  const store = parts.store ?? makeStore();
  const logger = createMemoryLogger();
  const jobs = createMemoryJobQueue();
  const module = assembleReplayModule({
    store,
    reader: parts.reader ?? makeReader(),
    policy: parts.policy ?? makePolicy(),
    jobQueue: jobs,
    clock: createFixedClock(NOW),
    idGenerator: createSequentialIdGenerator(),
    logger,
    classifierVersion: CLASSIFIER_VERSION,
  });
  if (parts.worker ?? true) {
    void jobs.work(REPLAY_RUN_JOB, module.runReplayJob);
  }
  return { store, logger, jobs, module };
}

function requestInput() {
  return { baselineVersionId, candidateVersionId, ...WINDOW };
}

async function runToCompletion(module: ReplayModule, jobs: MemoryJobQueue) {
  const result = await module.requestReplay(requestInput());
  if (!result.ok) {
    throw new Error(`requestReplay failed: ${result.error.code}`);
  }
  await jobs.drain();
  return result.value;
}

describe('replay module', () => {
  test('a run whose persist fails is marked replay.persist_failed and logs the cause', async () => {
    const cause = new Error('too many bind parameters');
    const failingStore: FakeStore = {
      ...makeStore(),
      recordCompletion: () => Promise.reject(cause),
    };
    const { module, logger, jobs } = makeModule({ store: failingStore });

    const { run } = await runToCompletion(module, jobs);
    const stored = await module.getRun(run.id);

    expect([stored?.status, stored?.errorCode]).toEqual(['failed', 'replay.persist_failed']);
    expect(logger.records.filter((record) => record.level === 'error')).toEqual([
      {
        level: 'error',
        msg: 'replay run failed',
        fields: { runId: run.id, errorCode: 'replay.persist_failed', cause },
      },
    ]);
  });

  test('stores the same resultHash as the local diff pipeline for the same input', async () => {
    const { module, jobs } = makeModule();
    const local = computeDiff({
      actions,
      baseline: baselineDocument,
      candidate: candidateDocument,
    });

    const { run } = await runToCompletion(module, jobs);
    const stored = await module.getRun(run.id);

    expect(stored?.status).toBe('completed');
    expect(stored?.resultHash).toBe(local.resultHash);
  });

  // I6: a repeated request is idempotent by inputsHash.
  test('I6: the same request twice yields the same run id and resultHash', async () => {
    const { module, jobs } = makeModule();

    const first = await module.requestReplay(requestInput());
    if (!first.ok) {
      throw new Error(first.error.code);
    }
    expect(first.value.reused).toBe(false);
    await jobs.drain();
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
    const { module, jobs } = makeModule();
    const { run } = await runToCompletion(module, jobs);

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
    const { module, jobs } = makeModule();
    const { run } = await runToCompletion(module, jobs);
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
    const { module, jobs } = makeModule();
    await runToCompletion(module, jobs);

    const map = await module.getAuthorityMap();

    expect(map.run).not.toBeNull();
    expect(map.run?.policyVersionId).toBe(candidateVersionId);
    const total = map.cells.reduce((sum, cell) => sum + cell.count, 0);
    expect(total).toBe(3);
    expect(map.analyzability).toEqual({ full: 2, partial: 0, none: 1 });
  });

  test('authority-map returns run null when no completed run candidate is accepted', async () => {
    const { module, jobs } = makeModule({ policy: makePolicy({ candidateStatus: 'draft' }) });
    await runToCompletion(module, jobs);

    const map = await module.getAuthorityMap();

    expect(map.run).toBeNull();
    expect(map.cells).toEqual([]);
    expect(map.analyzability).toEqual({ full: 0, partial: 0, none: 0 });
  });

  test('a redelivered replay.run job leaves the completed run as it was', async () => {
    let windowActions: readonly ActionForReplay[] = actions;
    const { module, jobs } = makeModule({
      reader: makeReader({
        streamActions: async function* () {
          await Promise.resolve();
          yield windowActions;
        },
      }),
    });
    const { run } = await runToCompletion(module, jobs);
    const completed = await module.getRun(run.id);
    windowActions = actions.slice(0, 1);

    await module.runReplayJob({ replayRunId: run.id });

    expect(await module.getRun(run.id)).toEqual(completed);
  });

  test('a run whose Actions changed before its job ran fails with replay.inputs_changed', async () => {
    let windowActions: readonly ActionForReplay[] = actions;
    const { module, jobs } = makeModule({
      worker: false,
      reader: makeReader({
        streamActions: async function* () {
          await Promise.resolve();
          yield windowActions;
        },
      }),
    });
    const requested = await module.requestReplay(requestInput());
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    windowActions = actions.slice(0, 1);

    await jobs.work(REPLAY_RUN_JOB, module.runReplayJob);
    await jobs.drain();

    const stored = await module.getRun(requested.value.run.id);
    expect([stored?.status, stored?.errorCode]).toEqual(['failed', 'replay.inputs_changed']);
  });

  test('a replay.run payload without a run id is logged and dropped', async () => {
    const { module, logger } = makeModule();

    await module.runReplayJob({ runId: 'rpl_1' });

    expect(logger.records.map((record) => [record.level, record.msg])).toEqual([
      ['error', 'replay job payload invalid'],
    ]);
  });

  test('recoverInterruptedRuns runs a queued run whose job was lost', async () => {
    const store = makeStore();
    const stopped = makeModule({ store, worker: false });
    const requested = await stopped.module.requestReplay(requestInput());
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    const restarted = makeModule({ store });

    await restarted.module.recoverInterruptedRuns();
    await restarted.jobs.drain();

    expect((await restarted.module.getRun(requested.value.run.id))?.status).toBe('completed');
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
    const { module, jobs } = makeModule({
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
    await jobs.drain();
    const listed = await module.listConformanceFindings();

    expect(listed.run?.replayRunId).toBe(requested.value.run.id);
    expect(listed.run?.policyVersionId).toBe(candidateVersionId);
    expect(listed.items.map((finding) => [finding.kind, finding.capability])).toEqual([
      ['over_asked', 'push'],
    ]);
    expect(listed.items.map((finding) => finding.status)).toEqual(['open']);
  });

  test('acknowledging a finding of the latest run stores the note and is idempotent', async () => {
    const pushAction = actions[1];
    if (pushAction === undefined) {
      throw new Error('fixture has a push Action');
    }
    const { module, jobs } = makeModule({
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
    await jobs.drain();
    const listed = await module.listConformanceFindings();
    const findingKey = listed.items[0]?.findingKey;
    if (findingKey === undefined) {
      throw new Error('the run produced a finding');
    }

    const first = await module.acknowledgeConformanceFinding(findingKey, 'expected in bypass');
    const second = await module.acknowledgeConformanceFinding(findingKey, 'updated note');
    const missing = await module.acknowledgeConformanceFinding('a'.repeat(64), 'no such finding');

    expect(first.ok && first.value.status).toBe('acknowledged');
    expect(first.ok && first.value.note).toBe('expected in bypass');
    expect(second.ok && second.value.note).toBe('updated note');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('replay.finding_not_found');
    }
    expect((await module.listConformanceFindings()).items[0]?.note).toBe('updated note');
  });

  test('a conformance run lists its Action counts per permission mode', async () => {
    const target = actions[0];
    if (target === undefined) {
      throw new Error('fixture has an Action');
    }
    const { module, jobs } = makeModule({
      reader: makeReader({
        getObservations: () =>
          Promise.resolve([
            observation(target, 'pre_tool_use', target.actionKey, 'bypassPermissions'),
          ]),
      }),
    });

    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    await jobs.drain();
    const listed = await module.listConformanceFindings();

    expect(
      listed.run?.byPermissionMode.map((row) => [row.permissionMode, row.actionCount]),
    ).toEqual([
      ['bypassPermissions', 1],
      ['unknown', actions.length - 1],
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
    const { module, jobs } = makeModule({
      reader: makeReader({
        getObservations: () => Promise.resolve([observation(target, 'permission_request', null)]),
      }),
    });

    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    await jobs.drain();
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
      permissionMode: null,
      occurredAt: IsoTimestampSchema.parse('2026-01-02T02:46:00.000Z'),
    };
    const { module, jobs } = makeModule({
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
    await jobs.drain();
    const listed = await module.listConformanceFindings();

    expect(listed.run?.unpairedPermissionRequests).toBe(1);
  });

  test('a new observation makes a repeated conformance request run again', async () => {
    const observations: ObservationForReplay[] = [];
    const { module, jobs } = makeModule({
      reader: makeReader({ getObservations: () => Promise.resolve([...observations]) }),
    });
    const first = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!first.ok) {
      throw new Error(first.error.code);
    }
    await jobs.drain();
    const target = actions[0];
    if (target === undefined) {
      throw new Error('fixture has an Action');
    }
    observations.push(observation(target, 'pre_tool_use'));

    const second = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });

    expect(second.ok && second.value.reused).toBe(false);
  });

  test('authority-map ignores a completed conformance run', async () => {
    const { module, jobs } = makeModule();
    const requested = await module.requestConformanceReplay({ candidateVersionId, ...WINDOW });
    if (!requested.ok) {
      throw new Error(requested.error.code);
    }
    await jobs.drain();

    const map = await module.getAuthorityMap();

    expect(map.run).toBeNull();
  });

  describe('adoption run', () => {
    // The baseline fixture asks on the push Action, so the adoption preview has groups.
    const adoptionInput = () => ({ candidateVersionId: baselineVersionId, ...WINDOW });

    async function runAdoption(module: ReplayModule, jobs: MemoryJobQueue) {
      const result = await module.requestAdoptionReplay(adoptionInput());
      if (!result.ok) {
        throw new Error(`requestAdoptionReplay failed: ${result.error.code}`);
      }
      await jobs.drain();
      return result.value;
    }

    test('stores kind adoption, no baseline, and the local adoption pipeline resultHash and stats', async () => {
      const { module, jobs } = makeModule();
      const local = computeAdoption({ actions, candidate: baselineDocument });

      const { run } = await runAdoption(module, jobs);
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
      const { module, jobs } = makeModule();

      const first = await runAdoption(module, jobs);
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
      const { module, jobs } = makeModule();
      const local = computeAdoption({ actions, candidate: baselineDocument });
      const { run } = await runAdoption(module, jobs);

      const all = await module.listAdoptionGroups(run.id, { limit: 50 });
      const denies = await module.listAdoptionGroups(run.id, { effect: 'deny', limit: 50 });

      expect(all.ok ? all.value.items : null).toEqual(local.groups);
      expect(local.groups.length).toBeGreaterThan(0);
      expect(denies.ok ? denies.value.items : null).toEqual([]);
    });

    test('adoption samples carry the candidate Decision, Target keys, and the deciding rule rationale', async () => {
      const { module, jobs } = makeModule();
      const { run } = await runAdoption(module, jobs);
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
      const { module, jobs } = makeModule();
      const { run } = await runAdoption(module, jobs);

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

    test('authority-map returns the cells of a completed adoption run whose candidate is accepted', async () => {
      const { module, jobs } = makeModule();
      const { run } = await runAdoption(module, jobs);

      const map = await module.getAuthorityMap();

      expect(map.run?.replayRunId).toBe(run.id);
      expect(map.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(3);
    });

    test('authority-map ignores a completed adoption run whose candidate is not accepted', async () => {
      const { module, jobs } = makeModule({ policy: makePolicy({ baselineStatus: 'in_review' }) });
      await runAdoption(module, jobs);

      const map = await module.getAuthorityMap();

      expect(map.run).toBeNull();
    });
  });
});
