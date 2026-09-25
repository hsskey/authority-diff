import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { IsoTimestampSchema, ok } from '@authority/kernel';
import type { IsoTimestamp } from '@authority/kernel';
import {
  createFixedClock,
  createMemoryJobQueue,
  createMemoryLogger,
  createSequentialIdGenerator,
} from '@authority/platform/testing';
import { createEvaluator } from '@authority/policy/evaluate';
import {
  PolicyActivationSchema,
  PolicyDocumentSchema,
  PolicyVersionIdSchema,
} from '@authority/policy/schema';
import type { PolicyActivation } from '@authority/policy/schema';
import { assembleReplayModule, REPLAY_RUN_JOB } from '@authority/replay';
import type { ReplayModule, ReplayStore } from '@authority/replay';
import { computeConformanceWith } from '@authority/replay/diff';
import type { ReplayRun } from '@authority/replay/schema';
import type { ActionReader } from '@authority/trace';
import { ActionForReplaySchema } from '@authority/trace/schema';
import type { ObservationForReplay } from '@authority/trace/schema';
import {
  CONFORMANCE_DAILY_JOB,
  createConformanceDailyJob,
  previousUtcDay,
} from '../../src/jobs/conformance-daily.job.ts';
import { registerJobs } from '../../src/jobs/index.ts';
import { okProbe } from '../support/harness.ts';
import actionFixture from '../../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import candidateFixture from '../../../../tests/fixtures/candidate-policy.json' with { type: 'json' };

const actions = z.array(ActionForReplaySchema).parse(actionFixture);
const candidateDocument = PolicyDocumentSchema.parse(candidateFixture);
const declaredVersionId = PolicyVersionIdSchema.parse(`pver_${'D'.repeat(26)}`);
const CLASSIFIER_VERSION = 'test-classifier-1';
// The fixture Actions occurred on 2026-01-02; the run the next morning covers that day.
const SCHEDULED_AT = IsoTimestampSchema.parse('2026-01-03T01:00:00.000Z');
const FIXTURE_DAY = {
  windowFrom: IsoTimestampSchema.parse('2026-01-02T00:00:00.000Z'),
  windowTo: IsoTimestampSchema.parse('2026-01-02T23:59:59.999Z'),
};
// Pinned: scheduling must not change what a conformance run computes.
const FIXTURE_DAY_RESULT_HASH = 'e48e2cbbd95b91a7bac4cb7a8aaa88ecdb60d86ea70539c161c3472733746a24';

const pushAction = actions[1];
if (pushAction === undefined) {
  throw new Error('fixture has a push Action');
}
const observations: ObservationForReplay[] = [
  {
    actionKey: pushAction.actionKey,
    event: 'pre_tool_use',
    sessionExternalId: pushAction.sessionExternalId,
    toolName: 'Bash',
    toolInputHash: 'c'.repeat(64),
    hookDecision: null,
    permissionMode: null,
    occurredAt: pushAction.occurredAt,
  },
];

const activation: PolicyActivation = PolicyActivationSchema.parse({
  id: `pact_${'E'.repeat(26)}`,
  policyVersionId: declaredVersionId,
  reason: 'applied to managed settings',
  actorName: 'operator',
  createdAt: '2026-01-01T00:00:00.000Z',
});

function makeStore(): ReplayStore {
  const runs = new Map<string, ReplayRun>();
  const unused = () => Promise.reject(new Error('not used by a conformance run'));
  return {
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
        runs.set(run.id, {
          ...run,
          status: 'completed',
          resultHash: input.resultHash,
          completedAt: input.completedAt,
        });
      }
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
    listDiffGroups: unused,
    getDiffGroup: unused,
    listAdoptionGroups: unused,
    getAdoptionGroup: unused,
    failStaleRunningRuns: unused,
    listQueuedRunIds: unused,
    listCompletedRunsNewestFirst: unused,
    findLatestConformanceRun: unused,
    listConformanceFindings: unused,
    getConformanceFinding: unused,
    acknowledgeConformanceFinding: unused,
  };
}

const reader: ActionReader = {
  streamActions: async function* ({ from, to }) {
    await Promise.resolve();
    yield actions.filter((action) => action.occurredAt >= from && action.occurredAt <= to);
  },
  getActions: () => Promise.resolve([]),
  countStaleClassifications: () => Promise.resolve(0),
  listObservationSessions: () => Promise.resolve([]),
  getObservations: () => Promise.resolve(observations),
};

function makeReplay(now: IsoTimestamp) {
  const jobs = createMemoryJobQueue();
  const replay = assembleReplayModule({
    store: makeStore(),
    reader,
    policy: {
      getVersion: (id) =>
        Promise.resolve(
          id === declaredVersionId
            ? { document: candidateDocument, contentHash: 'h'.repeat(64), status: 'accepted' }
            : null,
        ),
    },
    jobQueue: jobs,
    clock: createFixedClock(now),
    idGenerator: createSequentialIdGenerator(),
    logger: createMemoryLogger(),
    classifierVersion: CLASSIFIER_VERSION,
  });
  void jobs.work(REPLAY_RUN_JOB, replay.runReplayJob);
  return { jobs, replay };
}

function stubReplay(): Pick<ReplayModule, 'requestConformanceReplay'> {
  return { requestConformanceReplay: vi.fn(() => Promise.reject(new Error('not expected'))) };
}

describe('previousUtcDay', () => {
  test.each([
    ['2026-01-03T01:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-02T23:59:59.999Z'],
    ['2026-01-03T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-02T23:59:59.999Z'],
    ['2026-03-01T23:59:59.999Z', '2026-02-28T00:00:00.000Z', '2026-02-28T23:59:59.999Z'],
  ])('at %s covers %s to %s', (now, windowFrom, windowTo) => {
    expect(previousUtcDay(IsoTimestampSchema.parse(now))).toEqual({ windowFrom, windowTo });
  });
});

describe('conformance.daily job', () => {
  test('is scheduled daily at 01:00 UTC', async () => {
    const queue = createMemoryJobQueue();

    await registerJobs({
      queue,
      replay: makeReplay(SCHEDULED_AT).replay,
      database: okProbe,
      clock: createFixedClock(SCHEDULED_AT),
      idGenerator: createSequentialIdGenerator(),
      logger: createMemoryLogger(),
    });

    expect(queue.schedules).toEqual([{ name: 'conformance.daily', cron: '0 1 * * *' }]);
  });

  test('requests nothing when no Policy Version was declared', async () => {
    const replay = stubReplay();
    const job = createConformanceDailyJob({
      activations: { findLatestActivation: () => Promise.resolve(ok(null)) },
      replay,
      clock: createFixedClock(SCHEDULED_AT),
      logger: createMemoryLogger(),
    });

    await job({});

    expect(replay.requestConformanceReplay).not.toHaveBeenCalled();
  });

  test('requests a conformance run of the declared version over the previous UTC day', async () => {
    const { replay } = makeReplay(SCHEDULED_AT);
    const request = vi.spyOn(replay, 'requestConformanceReplay');
    const job = createConformanceDailyJob({
      activations: { findLatestActivation: () => Promise.resolve(ok(activation)) },
      replay,
      clock: createFixedClock(SCHEDULED_AT),
      logger: createMemoryLogger(),
    });

    await job({});

    expect(request).toHaveBeenCalledWith({ candidateVersionId: declaredVersionId, ...FIXTURE_DAY });
  });

  test('the scheduled run stores the same resultHash as a requested run and the pure computation', async () => {
    const local = computeConformanceWith(
      createEvaluator(candidateDocument),
      actions,
      observations,
      { from: FIXTURE_DAY.windowFrom, to: FIXTURE_DAY.windowTo },
    );
    const requested = makeReplay(SCHEDULED_AT);
    const direct = await requested.replay.requestConformanceReplay({
      candidateVersionId: declaredVersionId,
      ...FIXTURE_DAY,
    });
    if (!direct.ok) {
      throw new Error(direct.error.code);
    }
    await requested.jobs.drain();
    const scheduled = makeReplay(SCHEDULED_AT);
    const queue = createMemoryJobQueue();
    await queue.work(
      CONFORMANCE_DAILY_JOB,
      createConformanceDailyJob({
        activations: { findLatestActivation: () => Promise.resolve(ok(activation)) },
        replay: scheduled.replay,
        clock: createFixedClock(SCHEDULED_AT),
        logger: createMemoryLogger(),
      }),
    );

    await queue.send(CONFORMANCE_DAILY_JOB, {});
    await queue.drain();
    await scheduled.jobs.drain();

    const scheduledRun = await scheduled.replay.getRun(direct.value.run.id);
    const directRun = await requested.replay.getRun(direct.value.run.id);
    expect([scheduledRun?.resultHash, directRun?.resultHash, local.resultHash]).toEqual([
      FIXTURE_DAY_RESULT_HASH,
      FIXTURE_DAY_RESULT_HASH,
      FIXTURE_DAY_RESULT_HASH,
    ]);
  });
});
