import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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
  migratePolicyStore,
  type PolicyRepository,
} from '../index.ts';
import { PolicyVersionIdSchema } from '../schema.ts';
import { expectErr, expectOk } from './support/result.ts';

// Matches docker-compose.test.yml, run via `pnpm test:int`.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';
const MIGRATIONS = fileURLToPath(new URL('../../../drizzle', import.meta.url));

// Each test uses a fresh unique policy name so the shared database needs no
// truncation between tests; rows are isolated by their generated policy id.
const names = createUlidGenerator();
const uniqueName = (): string => names.next('policy');

let database: Database;
let repository: PolicyRepository;

beforeAll(async () => {
  const config = expectOk(
    parseConfig({
      AUTHORITY_DB_URL: TEST_DB_URL,
      AUTHORITY_AUTH_TOKEN: 'test-token',
      AUTHORITY_DB_POOL_MAX: '4',
    }),
  );
  database = createDatabase(config);
  await migratePolicyStore(database.db, MIGRATIONS);
  repository = createPolicyRepository({
    db: database.db,
    clock: createSystemClock(),
    idGenerator: createUlidGenerator(),
  });
});

afterAll(async () => {
  await database.close();
});

async function createDefaultPolicy(name = uniqueName()) {
  return expectOk(await repository.createPolicy({ name, template: 'default' }));
}

describe('policy store', () => {
  test('createPolicy seeds an accepted version 1 from the default template', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();

    expect(initialVersion.policyId).toBe(policy.id);
    expect(initialVersion.versionNumber).toBe(1);
    expect(initialVersion.status).toBe('accepted');
    expect(initialVersion.baseVersionId).toBeNull();
    expect(initialVersion.document).toEqual(DEFAULT_POLICY_DOCUMENT);
  });

  test('createPolicy with the empty template stores an empty document', async () => {
    const { initialVersion } = expectOk(
      await repository.createPolicy({ name: uniqueName(), template: 'empty' }),
    );
    expect(initialVersion.document).toEqual(EMPTY_POLICY_DOCUMENT);
  });

  test('createPolicy rejects a duplicate name', async () => {
    const name = uniqueName();
    await createDefaultPolicy(name);
    const error = expectErr(await repository.createPolicy({ name, template: 'empty' }));
    expect(error.code).toBe('policy.name_conflict');
  });

  test('baseline is the initial accepted version, then the most recent accepted', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    expect(expectOk(await repository.getBaseline(policy.id)).id).toBe(initialVersion.id);

    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    expectOk(await repository.transitionVersion(draft.id, 'submit'));
    const accepted = expectOk(await repository.transitionVersion(draft.id, 'accept'));

    const baseline = expectOk(await repository.getBaseline(policy.id));
    expect(baseline.id).toBe(accepted.id);
    expect(baseline.versionNumber).toBe(2);
  });

  test('createDraftVersion derives a draft from a base version', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));

    expect(draft.status).toBe('draft');
    expect(draft.versionNumber).toBe(2);
    expect(draft.baseVersionId).toBe(initialVersion.id);
    expect(draft.document).toEqual(initialVersion.document);
    expect(draft.contentHash).toBe(initialVersion.contentHash);
  });

  test('createDraftVersion rejects a second open draft', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    const error = expectErr(await repository.createDraftVersion(policy.id, initialVersion.id));
    expect(error.code).toBe('policy.draft_exists');
  });

  test('createDraftVersion rejects an unknown base version', async () => {
    const { policy } = await createDefaultPolicy();
    const missing = PolicyVersionIdSchema.parse(createUlidGenerator().next('pver'));
    const error = expectErr(await repository.createDraftVersion(policy.id, missing));
    expect(error.code).toBe('policy.version_not_found');
  });

  test('updateDraftDocument replaces the document when If-Match matches', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));

    const updated = expectOk(
      await repository.updateDraftDocument(draft.id, draft.contentHash, EMPTY_POLICY_DOCUMENT),
    );
    expect(updated.status).toBe('draft');
    expect(updated.document).toEqual(EMPTY_POLICY_DOCUMENT);
    expect(updated.contentHash).not.toBe(draft.contentHash);
  });

  test('updateDraftDocument rejects a stale If-Match without changing the document', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));

    const error = expectErr(
      await repository.updateDraftDocument(draft.id, 'stale', EMPTY_POLICY_DOCUMENT),
    );
    expect(error.code).toBe('policy.content_conflict');
    expect(expectOk(await repository.getVersion(draft.id)).document).toEqual(draft.document);
  });

  // I13: a Policy Version that is not draft is immutable.
  test('I13: updateDraftDocument cannot change a non-draft version', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();

    const acceptedError = expectErr(
      await repository.updateDraftDocument(
        initialVersion.id,
        initialVersion.contentHash,
        EMPTY_POLICY_DOCUMENT,
      ),
    );
    expect(acceptedError.code).toBe('policy.version_not_draft');

    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    const inReview = expectOk(await repository.transitionVersion(draft.id, 'submit'));
    const reviewError = expectErr(
      await repository.updateDraftDocument(
        inReview.id,
        inReview.contentHash,
        EMPTY_POLICY_DOCUMENT,
      ),
    );
    expect(reviewError.code).toBe('policy.version_not_draft');
    expect(expectOk(await repository.getVersion(inReview.id)).document).toEqual(draft.document);
  });

  test('at most one version per policy is in review', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    const first = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    expectOk(await repository.transitionVersion(first.id, 'submit'));

    const second = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    const error = expectErr(await repository.transitionVersion(second.id, 'submit'));
    expect(error.code).toBe('policy.in_review_exists');
  });

  test('withdrawing a version returns it to draft', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    expectOk(await repository.transitionVersion(draft.id, 'submit'));
    const withdrawn = expectOk(await repository.transitionVersion(draft.id, 'withdraw'));
    expect(withdrawn.status).toBe('draft');
  });

  test('an invalid transition is rejected', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    const error = expectErr(await repository.transitionVersion(draft.id, 'accept'));
    expect(error.code).toBe('policy.invalid_transition');
  });
});
