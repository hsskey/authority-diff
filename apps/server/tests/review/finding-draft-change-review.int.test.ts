import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { err, IsoTimestampSchema, ok } from '@authority/kernel';
import {
  createDatabase,
  createSystemClock,
  createUlidGenerator,
  parseConfig,
} from '@authority/platform';
import type { Database } from '@authority/platform';
import { createPolicyRepository, EMPTY_POLICY_DOCUMENT } from '@authority/policy';
import type { PolicyId, PolicyVersionId } from '@authority/policy/schema';
import { createMemoryJobQueue, createMemoryLogger } from '@authority/platform/testing';
import type { PolicyReader } from '@authority/replay';
import { createReviewModule } from '@authority/review';
import type { ChangeReviewView, PolicyReviewRepository } from '@authority/review';
import { ChangeReviewIdSchema } from '@authority/review/schema';
import type { ActionReader } from '@authority/trace';
import { ActionForReplaySchema, StoredAgentActionSchema } from '@authority/trace/schema';
import type { ObservationForReplay, StoredAgentAction } from '@authority/trace/schema';
import actionFixture from '../../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import { createQueuedReplayModule } from '../support/queued-replay.ts';

const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';
const WINDOW_FROM = IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z');

function freshWindow() {
  return { windowFrom: WINDOW_FROM, windowTo: IsoTimestampSchema.parse(new Date().toISOString()) };
}

function makePolicyReader(repo: ReturnType<typeof createPolicyRepository>): PolicyReader {
  return {
    async getVersion(id: PolicyVersionId) {
      const result = await repo.getVersion(id);
      if (!result.ok) {
        return null;
      }
      return {
        document: result.value.document,
        contentHash: result.value.contentHash,
        status: result.value.status,
      };
    },
  };
}

function makePolicyReviewRepository(
  repo: ReturnType<typeof createPolicyRepository>,
): PolicyReviewRepository {
  return {
    async getVersion(id: PolicyVersionId) {
      const result = await repo.getVersion(id);
      if (!result.ok) {
        return err(result.error);
      }
      const version = result.value;
      return ok({
        id: version.id,
        policyId: version.policyId,
        contentHash: version.contentHash,
        status: version.status,
      });
    },
    async getBaseline(policyId: PolicyId) {
      const result = await repo.getBaseline(policyId);
      if (!result.ok) {
        return err(result.error);
      }
      return ok({ id: result.value.id, contentHash: result.value.contentHash });
    },
    async submitForReview(id: PolicyVersionId) {
      const result = await repo.transitionVersion(id, 'submit');
      return result.ok ? ok(undefined) : err(result.error);
    },
    createDraftVersion: (policyId, baseVersionId) =>
      repo.createDraftVersion(policyId, baseVersionId),
    updateDraftDocument: (id, ifMatch, document) => repo.updateDraftDocument(id, ifMatch, document),
  };
}

let database: Database;

beforeAll(() => {
  const config = parseConfig({
    AUTHORITY_DB_URL: TEST_DB_URL,
    AUTHORITY_AUTH_TOKEN: 'test-token',
    AUTHORITY_DB_POOL_MAX: '4',
  });
  if (!config.ok) {
    throw new Error('test config failed to parse');
  }
  database = createDatabase(config.value);
});

afterAll(async () => {
  await database.close();
});

async function waitReady(
  review: ReturnType<typeof createReviewModule>,
  id: ReturnType<typeof ChangeReviewIdSchema.parse>,
): Promise<ChangeReviewView> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const view = await review.getChangeReview(id);
    if (!view.ok) {
      throw new Error(view.error.code);
    }
    if (view.value.review.status === 'ready') {
      return view.value;
    }
    if (view.value.review.status === 'failed') {
      throw new Error('replay failed');
    }
    await sleep(25);
  }
  throw new Error('timed out waiting for review to become ready');
}

test('under_asked with allow is widening in Change Review', async () => {
  const clock = createSystemClock();
  const idGenerator = createUlidGenerator();
  const actions = ActionForReplaySchema.array().parse(actionFixture);
  const now = IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z');
  const storedActions: StoredAgentAction[] = actions.map((action) =>
    StoredAgentActionSchema.parse({
      ...action,
      toolName: 'Bash',
      toolInputRedacted: 'synthetic redacted input',
      isInputTruncated: false,
      isSidechain: false,
      classifierVersion: 'test-classifier-1',
      recordedAt: now,
    }),
  );
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
  const repository = createPolicyRepository({ db: database.db, clock, idGenerator });
  const seeded = await repository.seedAcceptedPolicy({
    name: idGenerator.next('policy'),
    document: EMPTY_POLICY_DOCUMENT,
  });
  if (!seeded.ok) {
    throw new Error('seedAcceptedPolicy failed');
  }
  const reader: ActionReader = {
    streamActions: async function* () {
      await Promise.resolve();
      yield actions;
    },
    getActions: (keys) =>
      Promise.resolve(storedActions.filter((action) => keys.includes(action.actionKey))),
    countStaleClassifications: () => Promise.resolve(0),
    listObservationSessions: () => Promise.resolve([pushAction.sessionExternalId]),
    getObservations: () => Promise.resolve(observations),
  };
  const jobs = createMemoryJobQueue();
  const replay = createQueuedReplayModule(
    {
      database,
      reader,
      policy: makePolicyReader(repository),
      clock,
      idGenerator,
      logger: createMemoryLogger(),
      classifierVersion: 'test-classifier-1',
    },
    jobs,
  );
  const review = createReviewModule({
    database,
    replay,
    policy: makePolicyReviewRepository(repository),
    traceSources: {
      countActionsBySource: () => Promise.resolve({ transcript: 0, hook: 0, synthetic: 0 }),
    },
    clock,
    idGenerator,
  });

  const requested = await replay.requestConformanceReplay({
    candidateVersionId: seeded.value.version.id,
    ...freshWindow(),
  });
  if (!requested.ok) {
    throw new Error(requested.error.code);
  }
  await jobs.drain();
  const finding = (await replay.listConformanceFindings()).items.find(
    (item) => item.kind === 'under_asked' && item.capability === 'push',
  );
  if (finding === undefined) {
    throw new Error('empty Policy Version plus auto-executed push is under_asked');
  }

  const drafted = await review.createPolicyDraftFromFinding(finding.findingKey, 'allow');
  if (!drafted.ok) {
    throw new Error(drafted.error.code);
  }
  expect(drafted.value.document.rules.at(-1)?.effect).toBe('allow');

  const created = await review.createChangeReview({
    candidateVersionId: drafted.value.id,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  const ready = await waitReady(review, created.value.review.id);
  const widening = await review.listDiffGroups(created.value.review.id, {
    direction: 'widening',
    limit: 200,
  });
  if (!widening.ok) {
    throw new Error(widening.error.code);
  }

  expect(widening.value.items.length).toBeGreaterThan(0);
  expect(ready.gate.isOpen).toBe(false);
  const blocked = await review.decide({
    changeReviewId: created.value.review.id,
    decision: 'accept',
    note: '',
    reviewerName: 'tester',
  });
  expect(blocked.ok).toBe(false);
  if (!blocked.ok) {
    expect(blocked.error.code).toBe('review.gate_blocked');
  }
});
