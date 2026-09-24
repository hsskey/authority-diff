import { afterAll, beforeAll, expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import {
  createDatabase,
  createSystemClock,
  createUlidGenerator,
  parseConfig,
} from '@authority/platform';
import type { Database } from '@authority/platform';
import {
  createPolicyRepository,
  DEFAULT_POLICY_DOCUMENT,
  EMPTY_POLICY_DOCUMENT,
} from '@authority/policy';
import { PolicyDocumentSchema } from '@authority/policy/schema';
import type { PolicyVersionId } from '@authority/policy/schema';
import { createTraceModule } from '@authority/trace';
import type { ActionReader } from '@authority/trace';
import { ParsedSessionSchema } from '@authority/trace/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import { countRowsByRun, createMemoryLogger } from '@authority/platform/testing';
import { createReplayModule } from '../index.ts';
import type { PolicyReader } from '../index.ts';
import { createEvaluator } from '@authority/policy/evaluate';
import { computeAdoption, computeConformanceWith, computeDiff } from '../diff.ts';
import baselineFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidateFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };
import sessionFixture from '../../../tests/fixtures/parsed-session.json' with { type: 'json' };

// Matches docker-compose.test.yml, run via `pnpm test:int`.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';

const WINDOW_FROM = IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z');

// The shared test database persists across `pnpm test:int` runs, and inputsHash
// is content-based; a fresh windowTo per run keeps each run's inputsHash unique.
function freshWindow() {
  return { windowFrom: WINDOW_FROM, windowTo: IsoTimestampSchema.parse(new Date().toISOString()) };
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

function makePolicyReader(repository: ReturnType<typeof createPolicyRepository>): PolicyReader {
  return {
    async getVersion(id: PolicyVersionId) {
      const result = await repository.getVersion(id);
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

test('drizzle store persists a run whose resultHash matches the local pipeline and is idempotent', async () => {
  const clock = createSystemClock();
  const idGenerator = createUlidGenerator();
  const repository = createPolicyRepository({ db: database.db, clock, idGenerator });

  const seeded = await repository.seedAcceptedPolicy({
    name: idGenerator.next('policy'),
    document: DEFAULT_POLICY_DOCUMENT,
  });
  if (!seeded.ok) {
    throw new Error('seedAcceptedPolicy failed');
  }
  const baselineVersion = seeded.value.version;

  const draft = await repository.createDraftVersion(seeded.value.policy.id, baselineVersion.id);
  if (!draft.ok) {
    throw new Error('createDraftVersion failed');
  }
  const emptied = await repository.updateDraftDocument(
    draft.value.id,
    draft.value.contentHash,
    EMPTY_POLICY_DOCUMENT,
  );
  if (!emptied.ok) {
    throw new Error('updateDraftDocument failed');
  }
  const submitted = await repository.transitionVersion(emptied.value.id, 'submit');
  if (!submitted.ok) {
    throw new Error('submit failed');
  }
  const candidateVersion = await repository.transitionVersion(emptied.value.id, 'accept');
  if (!candidateVersion.ok) {
    throw new Error('accept failed');
  }

  const trace = createTraceModule({ database, clock, idGenerator });
  const imported = await trace.importTrace(ParsedSessionSchema.parse(sessionFixture));
  if (!imported.ok) {
    throw new Error('importTrace failed');
  }

  const window = freshWindow();
  const streamed: ActionForReplay[] = [];
  for await (const batch of trace.reader.streamActions({
    from: window.windowFrom,
    to: window.windowTo,
    batchSize: 5000,
  })) {
    streamed.push(...batch);
  }
  expect(streamed.length).toBeGreaterThan(0);
  const local = computeDiff({
    actions: streamed,
    baseline: baselineVersion.document,
    candidate: emptied.value.document,
  });

  const replay = createReplayModule({
    database,
    reader: trace.reader,
    policy: makePolicyReader(repository),
    clock,
    idGenerator,
    logger: createMemoryLogger(),
    classifierVersion: trace.classifierVersion,
  });

  const first = await replay.requestReplay({
    baselineVersionId: baselineVersion.id,
    candidateVersionId: candidateVersion.value.id,
    ...window,
  });
  if (!first.ok) {
    throw new Error(`requestReplay failed: ${first.error.code}`);
  }
  expect(first.value.reused).toBe(false);
  await first.value.execution;

  const stored = await replay.getRun(first.value.run.id);
  expect(stored?.status).toBe('completed');
  expect(stored?.resultHash).toBe(local.resultHash);

  const second = await replay.requestReplay({
    baselineVersionId: baselineVersion.id,
    candidateVersionId: candidateVersion.value.id,
    ...window,
  });
  if (!second.ok) {
    throw new Error(second.error.code);
  }
  expect(second.value.reused).toBe(true);
  expect(second.value.run.id).toBe(first.value.run.id);

  const groups = await replay.listDiffGroups(first.value.run.id, { limit: 50 });
  if (!groups.ok) {
    throw new Error(groups.error.code);
  }
  expect(groups.value.items.length).toBe(local.groups.length);
  const group = groups.value.items[0];
  if (group !== undefined) {
    const samples = await replay.getSamples(first.value.run.id, group.groupKey);
    if (!samples.ok) {
      throw new Error(samples.error.code);
    }
    expect(samples.value.length).toBeGreaterThan(0);
  }

  const map = await replay.getAuthorityMap();
  expect(map.run?.policyVersionId).toBe(candidateVersion.value.id);
  const total = map.cells.reduce((sum, cell) => sum + cell.count, 0);
  expect(total).toBe(local.stats.evaluatedActions);
});

test('a conformance run joins observations by toolUseId, pairs permission requests, and persists its findings', async () => {
  const clock = createSystemClock();
  const idGenerator = createUlidGenerator();
  const repository = createPolicyRepository({ db: database.db, clock, idGenerator });
  const seeded = await repository.seedAcceptedPolicy({
    name: idGenerator.next('policy'),
    document: DEFAULT_POLICY_DOCUMENT,
  });
  if (!seeded.ok) {
    throw new Error('seedAcceptedPolicy failed');
  }
  const candidate = seeded.value.version;
  const trace = createTraceModule({ database, clock, idGenerator });
  const session = ParsedSessionSchema.parse(sessionFixture);
  const imported = await trace.importTrace(session);
  if (!imported.ok) {
    throw new Error('importTrace failed');
  }
  await trace.ingestObservations({
    runtime: session.runtime,
    observations: session.toolCalls.flatMap((call, index) => [
      {
        event: 'pre_tool_use' as const,
        sessionExternalId: session.sessionExternalId,
        toolUseId: call.toolUseId,
        toolName: call.toolName,
        toolInputHash: String(index).padStart(64, '0'),
        hookDecision: null,
        permissionMode: null,
        cwd: null,
        runtimeVersion: null,
        occurredAt: call.occurredAt,
      },
      {
        event: 'permission_request' as const,
        sessionExternalId: session.sessionExternalId,
        toolUseId: null,
        toolName: call.toolName,
        toolInputHash: String(index).padStart(64, '0'),
        hookDecision: null,
        permissionMode: 'default',
        cwd: null,
        runtimeVersion: null,
        occurredAt: call.occurredAt,
      },
    ]),
  });
  const [firstCall] = session.toolCalls;
  if (firstCall === undefined) {
    throw new Error('the session fixture has a tool call');
  }
  await trace.ingestObservations({
    runtime: session.runtime,
    observations: [
      {
        event: 'permission_request',
        sessionExternalId: session.sessionExternalId,
        toolUseId: null,
        toolName: 'Bash',
        toolInputHash: 'f'.repeat(64),
        hookDecision: null,
        permissionMode: null,
        cwd: null,
        runtimeVersion: null,
        occurredAt: firstCall.occurredAt,
      },
    ],
  });
  const window = freshWindow();
  const streamed: ActionForReplay[] = [];
  for await (const batch of trace.reader.streamActions({
    from: window.windowFrom,
    to: window.windowTo,
    batchSize: 5000,
  })) {
    streamed.push(...batch);
  }
  const observations = await trace.reader.getObservations([
    ...new Set(streamed.map((a) => a.sessionExternalId)),
  ]);
  const local = computeConformanceWith(
    createEvaluator(candidate.document),
    streamed,
    observations,
    {
      from: window.windowFrom,
      to: window.windowTo,
    },
  );
  const replay = createReplayModule({
    database,
    reader: trace.reader,
    policy: makePolicyReader(repository),
    clock,
    idGenerator,
    logger: createMemoryLogger(),
    classifierVersion: trace.classifierVersion,
  });

  const requested = await replay.requestConformanceReplay({
    candidateVersionId: candidate.id,
    ...window,
  });
  if (!requested.ok) {
    throw new Error(`requestConformanceReplay failed: ${requested.error.code}`);
  }
  await requested.value.execution;
  const stored = await replay.getRun(requested.value.run.id);
  const listed = await replay.listConformanceFindings();

  expect(observations.length).toBeGreaterThanOrEqual(session.toolCalls.length);
  expect(stored?.kind).toBe('conformance');
  expect(stored?.resultHash).toBe(local.resultHash);
  expect(listed.run?.replayRunId).toBe(requested.value.run.id);
  expect(listed.items).toEqual(local.findings);
  expect(local.findings.map((finding) => finding.kind)).not.toContain('under_asked');
  expect(listed.run?.unpairedPermissionRequests).toBe(1);
  expect(listed.run?.byPermissionMode).toEqual(local.stats.byPermissionMode);
});

test('an adoption run persists its groups and assignments, is idempotent, and pages in review order', async () => {
  const clock = createSystemClock();
  const idGenerator = createUlidGenerator();
  const repository = createPolicyRepository({ db: database.db, clock, idGenerator });
  const seeded = await repository.seedAcceptedPolicy({
    name: idGenerator.next('policy'),
    document: DEFAULT_POLICY_DOCUMENT,
  });
  if (!seeded.ok) {
    throw new Error('seedAcceptedPolicy failed');
  }
  const candidate = seeded.value.version;
  const trace = createTraceModule({ database, clock, idGenerator });
  const imported = await trace.importTrace(ParsedSessionSchema.parse(sessionFixture));
  if (!imported.ok) {
    throw new Error('importTrace failed');
  }
  const window = freshWindow();
  const streamed: ActionForReplay[] = [];
  for await (const batch of trace.reader.streamActions({
    from: window.windowFrom,
    to: window.windowTo,
    batchSize: 5000,
  })) {
    streamed.push(...batch);
  }
  const local = computeAdoption({ actions: streamed, candidate: candidate.document });
  expect(local.groups.length).toBeGreaterThan(0);
  const replay = createReplayModule({
    database,
    reader: trace.reader,
    policy: makePolicyReader(repository),
    clock,
    idGenerator,
    logger: createMemoryLogger(),
    classifierVersion: trace.classifierVersion,
  });

  const first = await replay.requestAdoptionReplay({ candidateVersionId: candidate.id, ...window });
  if (!first.ok) {
    throw new Error(`requestAdoptionReplay failed: ${first.error.code}`);
  }
  await first.value.execution;
  const stored = await replay.getRun(first.value.run.id);
  const second = await replay.requestAdoptionReplay({
    candidateVersionId: candidate.id,
    ...window,
  });
  if (!second.ok) {
    throw new Error(second.error.code);
  }

  expect([stored?.kind, stored?.baselineVersionId, stored?.status]).toEqual([
    'adoption',
    null,
    'completed',
  ]);
  expect(stored?.resultHash).toBe(local.resultHash);
  expect(stored?.stats).toEqual(local.stats);
  expect([second.value.reused, second.value.run.id]).toEqual([true, first.value.run.id]);

  const all = await replay.listAdoptionGroups(first.value.run.id, { limit: 200 });
  expect(all.ok ? all.value.items : null).toEqual(local.groups);

  const paged: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await replay.listAdoptionGroups(first.value.run.id, { cursor, limit: 1 });
    if (!page.ok) {
      throw new Error(page.error.code);
    }
    paged.push(...page.value.items.map((group) => group.groupKey));
    cursor = page.value.nextCursor ?? undefined;
  } while (cursor !== undefined);
  expect(paged).toEqual(local.groups.map((group) => group.groupKey));

  const asks = await replay.listAdoptionGroups(first.value.run.id, { effect: 'ask', limit: 200 });
  expect(asks.ok ? asks.value.items : null).toEqual(
    local.groups.filter((group) => group.effect === 'ask'),
  );

  const [group] = local.groups;
  if (group === undefined) {
    throw new Error('expected an adoption group');
  }
  const samples = await replay.getAdoptionSamples(first.value.run.id, group.groupKey);
  if (!samples.ok) {
    throw new Error(samples.error.code);
  }
  expect(samples.value.length).toBe(group.sampleActionKeys.length);
  expect(
    samples.value.every(
      (sample) =>
        sample.candidateDecision.effect === group.effect &&
        sample.targetKeys.length === sample.action.operations.length,
    ),
  ).toBe(true);

  const map = await replay.getAuthorityMap();
  expect(map.run?.replayRunId).toBe(first.value.run.id);
  expect(map.cells).toEqual(local.stats.cells);
});

// Above the 16,383 rows a single statement of a four-column table can carry.
const ACTION_COUNT = 20_000;

function syntheticPushActions(count: number): ActionForReplay[] {
  return Array.from({ length: count }, (_, index) => ({
    actionKey: index.toString(16).padStart(64, '0'),
    sessionExternalId: `synthetic-session-${index % 50}`,
    operations: [
      {
        index: 0,
        capability: 'push' as const,
        target: {
          kind: 'vcs_remote' as const,
          remoteName: 'origin',
          remoteKey: 'example.invalid/synthetic/project',
          branch: `feature/synthetic-${index}`,
        },
        analyzability: 'full' as const,
        program: 'git',
        fragment: 'synthetic redacted publish',
        signals: [],
      },
    ],
    observedOutcome: 'executed' as const,
    occurredAt: IsoTimestampSchema.parse('2026-01-02T03:04:05.006Z'),
  }));
}

function syntheticReader(actions: readonly ActionForReplay[]): ActionReader {
  return {
    getActions: () => Promise.resolve([]),
    streamActions: async function* () {
      await Promise.resolve();
      yield actions;
    },
    countStaleClassifications: () => Promise.resolve(0),
    listObservationSessions: () => Promise.resolve([]),
    getObservations: () => Promise.resolve([]),
  };
}

test('a run persists more assignments and changed actions than one statement can bind', async () => {
  const clock = createSystemClock();
  const idGenerator = createUlidGenerator();
  const repository = createPolicyRepository({ db: database.db, clock, idGenerator });
  const seeded = await repository.seedAcceptedPolicy({
    name: idGenerator.next('policy'),
    document: PolicyDocumentSchema.parse(baselineFixture),
  });
  if (!seeded.ok) {
    throw new Error('seedAcceptedPolicy failed');
  }
  const baseline = seeded.value.version;
  const draft = await repository.createDraftVersion(seeded.value.policy.id, baseline.id);
  if (!draft.ok) {
    throw new Error('createDraftVersion failed');
  }
  const widened = await repository.updateDraftDocument(
    draft.value.id,
    draft.value.contentHash,
    PolicyDocumentSchema.parse(candidateFixture),
  );
  if (!widened.ok) {
    throw new Error('updateDraftDocument failed');
  }
  const actions = syntheticPushActions(ACTION_COUNT);
  const window = freshWindow();
  const replay = createReplayModule({
    database,
    reader: syntheticReader(actions),
    policy: makePolicyReader(repository),
    clock,
    idGenerator,
    logger: createMemoryLogger(),
    classifierVersion: 'synthetic-classifier',
  });
  const askOrDeny = computeAdoption({ actions, candidate: baseline.document }).groups.reduce(
    (sum, group) => sum + group.actionCount,
    0,
  );
  const changed = computeDiff({
    actions,
    baseline: baseline.document,
    candidate: widened.value.document,
  }).changedActions.length;
  expect(Math.min(askOrDeny, changed)).toBeGreaterThan(16_384);

  const adoption = await replay.requestAdoptionReplay({
    candidateVersionId: baseline.id,
    ...window,
  });
  const diff = await replay.requestReplay({
    baselineVersionId: baseline.id,
    candidateVersionId: widened.value.id,
    ...window,
  });
  if (!adoption.ok || !diff.ok) {
    throw new Error('replay request failed');
  }
  await Promise.all([adoption.value.execution, diff.value.execution]);

  expect([
    (await replay.getRun(adoption.value.run.id))?.status,
    (await replay.getRun(diff.value.run.id))?.status,
  ]).toEqual(['completed', 'completed']);
  expect(
    await countRowsByRun(database.db, 'replay_adoption_assignments', adoption.value.run.id),
  ).toBe(askOrDeny);
  expect(await countRowsByRun(database.db, 'replay_changed_actions', diff.value.run.id)).toBe(
    changed,
  );
});
