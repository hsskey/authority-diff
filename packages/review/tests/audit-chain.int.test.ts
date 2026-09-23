import { afterAll, beforeAll, expect, test } from 'vitest';
import { IsoTimestampSchema, Sha256Schema } from '@authority/kernel';
import {
  createDatabase,
  createSystemClock,
  createUlidGenerator,
  parseConfig,
} from '@authority/platform';
import type { Database } from '@authority/platform';
import { createPolicyRepository, EMPTY_POLICY_DOCUMENT } from '@authority/policy';
import type { PolicyVersionId } from '@authority/policy/schema';
import {
  createReviewStore,
  recordSeedOnlyAcceptance,
  SEED_ONLY_AUDIT_NOTE,
  verifyAuditChain,
} from '@authority/review';
import type { ReviewStore } from '@authority/review';
import { ChangeReviewIdSchema } from '@authority/review/schema';
import type { ChangeReviewId, ReviewDecision } from '@authority/review/schema';

const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';
const HASH = Sha256Schema.parse('a'.repeat(64));

const clock = createSystemClock();
const idGenerator = createUlidGenerator();

let database: Database;
let store: ReviewStore;
let repository: ReturnType<typeof createPolicyRepository>;

beforeAll(() => {
  const config = parseConfig({
    AUTHORITY_DB_URL: TEST_DB_URL,
    AUTHORITY_AUTH_TOKEN: 'test-token',
    AUTHORITY_DB_POOL_MAX: '8',
  });
  if (!config.ok) {
    throw new Error('test config failed to parse');
  }
  database = createDatabase(config.value);
  repository = createPolicyRepository({ db: database.db, clock, idGenerator });
  store = createReviewStore({ database, clock, idGenerator });
});

afterAll(async () => {
  await database.close();
});

async function seedInReviewCandidate(): Promise<PolicyVersionId> {
  const seeded = await repository.seedAcceptedPolicy({
    name: idGenerator.next('policy'),
    document: EMPTY_POLICY_DOCUMENT,
  });
  if (!seeded.ok) {
    throw new Error('seedAcceptedPolicy failed');
  }
  const draft = await repository.createDraftVersion(
    seeded.value.policy.id,
    seeded.value.version.id,
  );
  if (!draft.ok) {
    throw new Error('createDraftVersion failed');
  }
  const submitted = await repository.transitionVersion(draft.value.id, 'submit');
  if (!submitted.ok) {
    throw new Error('submit failed');
  }
  return submitted.value.id;
}

function decision(
  changeReviewId: ChangeReviewId,
  baselineContentHash: ReviewDecision['baselineContentHash'] = HASH,
): ReviewDecision {
  return {
    changeReviewId,
    decision: 'accept',
    note: 'synthetic decision',
    reviewerName: 'synthetic-reviewer',
    decidedAt: IsoTimestampSchema.parse(new Date().toISOString()),
    baselineContentHash,
    candidateContentHash: HASH,
    replayInputsHash: HASH,
    replayResultHash: HASH,
    classifierVersion: 'synthetic-classifier',
    verdictSnapshot: [{ groupKey: HASH, verdict: 'expected' }],
  };
}

async function decideOnce(
  baselineContentHash: ReviewDecision['baselineContentHash'] = HASH,
): Promise<ChangeReviewId> {
  const candidateVersionId = await seedInReviewCandidate();
  const changeReviewId = ChangeReviewIdSchema.parse(idGenerator.next('rev'));
  const decided = await store.decide({
    decision: decision(changeReviewId, baselineContentHash),
    candidateVersionId,
  });
  if (!decided.ok) {
    throw new Error(decided.error.code);
  }
  return changeReviewId;
}

async function sequenceOf(changeReviewId: ChangeReviewId): Promise<number> {
  const [row] = await database.db.execute<{ sequence: string }>(
    `select sequence from review_decisions where change_review_id = '${changeReviewId}'`,
  );
  if (row === undefined) {
    throw new Error('decision row not found');
  }
  return Number(row.sequence);
}

// Rewrites a row's note with the append-only triggers disabled, as a tamperer
// with table ownership could, then restores them in the same transaction.
async function rewriteNoteBypassingTrigger(
  changeReviewId: ChangeReviewId,
  note: string,
): Promise<void> {
  await database.db.transaction(async (tx) => {
    await tx.execute('alter table review_decisions disable trigger review_decisions_append_only');
    await tx.execute(
      `update review_decisions set note = '${note}' where change_review_id = '${changeReviewId}'`,
    );
    await tx.execute('alter table review_decisions enable trigger review_decisions_append_only');
  });
}

test('seed-only acceptance appends one audit row with the seed note', async () => {
  const changeReviewId = ChangeReviewIdSchema.parse(idGenerator.next('rev'));
  await recordSeedOnlyAcceptance(database, {
    changeReviewId,
    contentHash: HASH,
    decidedAt: IsoTimestampSchema.parse(new Date().toISOString()),
  });

  const [row] = await database.db.execute<{ note: string }>(
    `select note from review_decisions where change_review_id = '${changeReviewId}'`,
  );
  if (row === undefined) {
    throw new Error('seed audit row not found');
  }
  expect(row.note).toBe(SEED_ONLY_AUDIT_NOTE);
  expect((await verifyAuditChain(database)).isIntact).toBe(true);
});

test('decisions recorded concurrently extend one intact chain', async () => {
  await Promise.all(Array.from({ length: 6 }, () => decideOnce()));

  const verification = await verifyAuditChain(database);

  expect(verification).toMatchObject({ isIntact: true, firstBrokenSequence: null });
});

test('an adoption decision with a null baselineContentHash chains between other decisions and verifies', async () => {
  await decideOnce();
  const adoption = await decideOnce(null);
  await decideOnce();

  const stored = await store.getDecision(adoption);
  const verification = await verifyAuditChain(database);

  expect(stored?.baselineContentHash).toBeNull();
  expect(verification).toMatchObject({ isIntact: true, firstBrokenSequence: null });
});

test.each([
  ['UPDATE', 'update review_decisions set note = note'],
  ['DELETE', 'delete from review_decisions'],
  ['TRUNCATE', 'truncate review_decisions'],
])('the append-only trigger rejects %s', async (operation, statement) => {
  await decideOnce();

  const attempt = database.db.execute(statement);

  await expect(attempt).rejects.toMatchObject({
    cause: { message: `review_decisions is append-only: ${operation} is not allowed` },
  });
});

test('changing one recorded decision makes verification report it as the first broken sequence', async () => {
  const tampered = await decideOnce();
  await decideOnce();
  const tamperedSequence = await sequenceOf(tampered);

  await rewriteNoteBypassingTrigger(tampered, 'rewritten after the fact');
  const verification = await verifyAuditChain(database);
  await rewriteNoteBypassingTrigger(tampered, 'synthetic decision');

  expect(verification).toMatchObject({
    isIntact: false,
    firstBrokenSequence: tamperedSequence,
  });
});
