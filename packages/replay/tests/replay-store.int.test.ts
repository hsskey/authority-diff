import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import {
  createDatabase,
  createSystemClock,
  createUlidGenerator,
  parseConfig,
} from '@authority/platform';
import type { Database } from '@authority/platform';
import { createPolicyRepository, EMPTY_POLICY_DOCUMENT } from '@authority/policy';
import type { PolicyVersionId } from '@authority/policy/schema';
import { createTraceModule } from '@authority/trace';
import { ParsedSessionSchema } from '@authority/trace/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import { createReplayModule, migrateReplayStore } from '../index.ts';
import type { PolicyReader } from '../index.ts';
import { computeDiff } from '../diff.ts';
import sessionFixture from '../../../tests/fixtures/parsed-session.json' with { type: 'json' };

// Matches docker-compose.test.yml, run via `pnpm test:int`.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';
const MIGRATIONS = fileURLToPath(new URL('../../../drizzle', import.meta.url));

const WINDOW_FROM = IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z');

// The shared test database persists across `pnpm test:int` runs, and inputsHash
// is content-based; a fresh windowTo per run keeps each run's inputsHash unique.
function freshWindow() {
  return { windowFrom: WINDOW_FROM, windowTo: IsoTimestampSchema.parse(new Date().toISOString()) };
}

let database: Database;

beforeAll(async () => {
  const config = parseConfig({
    AUTHORITY_DB_URL: TEST_DB_URL,
    AUTHORITY_AUTH_TOKEN: 'test-token',
    AUTHORITY_DB_POOL_MAX: '4',
  });
  if (!config.ok) {
    throw new Error('test config failed to parse');
  }
  database = createDatabase(config.value);
  await migrateReplayStore(database.db, MIGRATIONS);
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

  const created = await repository.createPolicy({
    name: idGenerator.next('policy'),
    template: 'default',
  });
  if (!created.ok) {
    throw new Error('createPolicy failed');
  }
  const baselineVersion = created.value.initialVersion;

  const draft = await repository.createDraftVersion(created.value.policy.id, baselineVersion.id);
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
