import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  createDatabase,
  createSystemClock,
  createUlidGenerator,
  parseConfig,
} from '@authority/platform';
import type { Database } from '@authority/platform';
import {
  createPolicyModule,
  createPolicyRepository,
  DEFAULT_POLICY_DOCUMENT,
  EMPTY_POLICY_DOCUMENT,
  upgradePolicyDocument,
  type PolicyRepository,
} from '../index.ts';
import { IsoTimestampSchema } from '@authority/kernel';
import { PolicyDocumentSchema, PolicyVersionIdSchema } from '../schema.ts';
import { expectErr, expectOk } from './support/result.ts';
import baselinePolicyFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };

// Matches docker-compose.test.yml, run via `pnpm test:int`.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';

// Each test uses a fresh unique policy name so the shared database needs no
// truncation between tests; rows are isolated by their generated policy id.
const names = createUlidGenerator();
const SCHEMA_VERSION_1_DOCUMENT = PolicyDocumentSchema.parse(baselinePolicyFixture);
const uniqueName = (): string => names.next('policy');

let database: Database;
let repository: PolicyRepository;

beforeAll(() => {
  const config = expectOk(
    parseConfig({
      AUTHORITY_DB_URL: TEST_DB_URL,
      AUTHORITY_AUTH_TOKEN: 'test-token',
      AUTHORITY_DB_POOL_MAX: '4',
    }),
  );
  database = createDatabase(config);
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

// The legacy seed path stands in for an accepted version 1, which product code
// reaches only by accepting the draft through review.
async function seedAcceptedDefaultPolicy(name = uniqueName()) {
  const { policy, version } = expectOk(
    await repository.seedAcceptedPolicy({ name, document: DEFAULT_POLICY_DOCUMENT }),
  );
  return { policy, initialVersion: version };
}

describe('policy store', () => {
  test('createPolicy creates a draft version 1 from the default template', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();

    expect(initialVersion.policyId).toBe(policy.id);
    expect(initialVersion.versionNumber).toBe(1);
    expect(initialVersion.status).toBe('draft');
    expect(initialVersion.baseVersionId).toBeNull();
    expect(initialVersion.document).toEqual(DEFAULT_POLICY_DOCUMENT);
  });

  test('the draft version 1 is editable and follows the draft transitions', async () => {
    const { initialVersion } = await createDefaultPolicy();

    const edited = expectOk(
      await repository.updateDraftDocument(
        initialVersion.id,
        initialVersion.contentHash,
        EMPTY_POLICY_DOCUMENT,
      ),
    );
    expect(edited.document).toEqual(EMPTY_POLICY_DOCUMENT);
    expect(expectOk(await repository.transitionVersion(edited.id, 'submit')).status).toBe(
      'in_review',
    );
  });

  test('createPolicy with the empty template stores an empty document', async () => {
    const { initialVersion } = expectOk(
      await repository.createPolicy({ name: uniqueName(), template: 'empty' }),
    );
    expect(initialVersion.document).toEqual(EMPTY_POLICY_DOCUMENT);
  });

  test('the module refuses a second Policy once the store holds one', async () => {
    await seedAcceptedDefaultPolicy();

    const error = expectErr(
      await createPolicyModule(repository).createPolicy({
        name: uniqueName(),
        template: 'default',
      }),
    );
    expect(error.code).toBe('policy.organization_policy_exists');
  });

  test('createPolicy rejects a duplicate name', async () => {
    const name = uniqueName();
    await createDefaultPolicy(name);
    const error = expectErr(await repository.createPolicy({ name, template: 'empty' }));
    expect(error.code).toBe('policy.name_conflict');
  });

  test('a policy whose version 1 is still a draft has no baseline', async () => {
    const { policy } = await createDefaultPolicy();

    const error = expectErr(await repository.getBaseline(policy.id));
    expect(error.code).toBe('policy.no_accepted_version');
    expect(expectOk(await repository.hasAcceptedVersion(policy.id))).toBe(false);
  });

  test('baseline is the accepted version 1 once accepted, then the most recent accepted', async () => {
    const { policy, initialVersion } = await createDefaultPolicy();
    expectOk(await repository.transitionVersion(initialVersion.id, 'submit'));
    expectOk(await repository.transitionVersion(initialVersion.id, 'accept'));
    expect(expectOk(await repository.getBaseline(policy.id)).id).toBe(initialVersion.id);
    expect(expectOk(await repository.hasAcceptedVersion(policy.id))).toBe(true);

    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    expectOk(await repository.transitionVersion(draft.id, 'submit'));
    const accepted = expectOk(await repository.transitionVersion(draft.id, 'accept'));

    const baseline = expectOk(await repository.getBaseline(policy.id));
    expect(baseline.id).toBe(accepted.id);
    expect(baseline.versionNumber).toBe(2);
  });

  test('a legacy seeded accepted version 1 is the baseline', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();

    expect(expectOk(await repository.getBaseline(policy.id)).id).toBe(initialVersion.id);
    expect(expectOk(await repository.hasAcceptedVersion(policy.id))).toBe(true);
  });

  test('createDraftVersion derives a draft from a base version', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));

    expect(draft.status).toBe('draft');
    expect(draft.versionNumber).toBe(2);
    expect(draft.baseVersionId).toBe(initialVersion.id);
    expect(draft.document).toEqual(initialVersion.document);
    expect(draft.contentHash).toBe(initialVersion.contentHash);
  });

  test('createDraftVersion upgrades a schemaVersion 1 base into a new draft and leaves the base as stored', async () => {
    const { policy, version } = expectOk(
      await repository.seedAcceptedPolicy({
        name: uniqueName(),
        document: SCHEMA_VERSION_1_DOCUMENT,
      }),
    );

    const draft = expectOk(await repository.createDraftVersion(policy.id, version.id));
    const base = expectOk(await repository.getVersion(version.id));

    expect({ draft: draft.document, base: [base.document, base.contentHash] }).toEqual({
      draft: upgradePolicyDocument(SCHEMA_VERSION_1_DOCUMENT),
      base: [SCHEMA_VERSION_1_DOCUMENT, version.contentHash],
    });
  });

  test('listVersions returns the versions in version order and pages by versionNumber', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));

    const firstPage = expectOk(await repository.listVersions(policy.id, null, 1));
    const secondPage = expectOk(await repository.listVersions(policy.id, firstPage.nextCursor, 1));

    expect(firstPage.items.map((version) => version.id)).toEqual([initialVersion.id]);
    expect(firstPage.nextCursor).toBe(String(initialVersion.versionNumber));
    expect(secondPage.items.map((version) => version.versionNumber)).toEqual([2]);
    expect(secondPage.items[0]?.id).toBe(draft.id);
    expect(secondPage.nextCursor).toBeNull();
  });

  test('createDraftVersion rejects a second open draft', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
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
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));

    const updated = expectOk(
      await repository.updateDraftDocument(draft.id, draft.contentHash, EMPTY_POLICY_DOCUMENT),
    );
    expect(updated.status).toBe('draft');
    expect(updated.document).toEqual(EMPTY_POLICY_DOCUMENT);
    expect(updated.contentHash).not.toBe(draft.contentHash);
  });

  test('updateDraftDocument rejects a stale If-Match without changing the document', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));

    const error = expectErr(
      await repository.updateDraftDocument(draft.id, 'stale', EMPTY_POLICY_DOCUMENT),
    );
    expect(error.code).toBe('policy.content_conflict');
    expect(expectOk(await repository.getVersion(draft.id)).document).toEqual(draft.document);
  });

  // I13: a Policy Version that is not draft is immutable.
  test('I13: updateDraftDocument cannot change a non-draft version', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();

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
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const first = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    expectOk(await repository.transitionVersion(first.id, 'submit'));

    const second = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    const error = expectErr(await repository.transitionVersion(second.id, 'submit'));
    expect(error.code).toBe('policy.in_review_exists');
  });

  test('withdrawing a version returns it to draft', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    expectOk(await repository.transitionVersion(draft.id, 'submit'));
    const withdrawn = expectOk(await repository.transitionVersion(draft.id, 'withdraw'));
    expect(withdrawn.status).toBe('draft');
  });

  test('an invalid transition is rejected', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    const error = expectErr(await repository.transitionVersion(draft.id, 'accept'));
    expect(error.code).toBe('policy.transition_not_allowed');
  });

  test('declareActivation records the declaration on an accepted version', async () => {
    const { initialVersion } = await seedAcceptedDefaultPolicy();

    const activation = expectOk(
      await repository.declareActivation(initialVersion.id, {
        reason: 'applied to managed settings',
        actorName: 'operator',
      }),
    );

    expect(activation).toMatchObject({
      policyVersionId: initialVersion.id,
      reason: 'applied to managed settings',
      actorName: 'operator',
    });
  });

  test('declaring an older accepted version leaves statuses and the baseline unchanged', async () => {
    const { policy, initialVersion } = await seedAcceptedDefaultPolicy();
    const draft = expectOk(await repository.createDraftVersion(policy.id, initialVersion.id));
    expectOk(await repository.transitionVersion(draft.id, 'submit'));
    const latest = expectOk(await repository.transitionVersion(draft.id, 'accept'));

    expectOk(
      await repository.declareActivation(initialVersion.id, { reason: 'kept', actorName: 'ops' }),
    );

    expect(expectOk(await repository.getVersion(initialVersion.id))).toEqual(initialVersion);
    expect(expectOk(await repository.getBaseline(policy.id))).toEqual(latest);
  });

  // Declarations one second apart in 2099, later than any other test's and in a minute of
  // their own per test, so the order and the window contents are unambiguous.
  async function declareThreeSecondsApart(minute: number) {
    let tick = 0;
    const declaring = createPolicyRepository({
      db: database.db,
      clock: {
        now: () => IsoTimestampSchema.parse(`2099-01-01T00:0${minute}:0${tick++}.000Z`),
      },
      idGenerator: createUlidGenerator(),
    });
    const { initialVersion: first } = await seedAcceptedDefaultPolicy();
    const { initialVersion: second } = await seedAcceptedDefaultPolicy();
    const declare = async (id: typeof first.id) =>
      expectOk(await declaring.declareActivation(id, { reason: 'applied', actorName: 'ops' }));
    return [await declare(first.id), await declare(second.id), await declare(first.id)] as const;
  }

  test('findLatestActivation returns the latest declaration at or before the given time', async () => {
    const [, atOneSecond] = await declareThreeSecondsApart(0);

    const found = expectOk(
      await repository.findLatestActivation(IsoTimestampSchema.parse('2099-01-01T00:00:01.000Z')),
    );

    expect(found).toEqual(atOneSecond);
  });

  test('listActivationsBetween excludes the start and includes the end', async () => {
    const [, atOneSecond, atTwoSeconds] = await declareThreeSecondsApart(1);

    const listed = expectOk(
      await repository.listActivationsBetween(
        IsoTimestampSchema.parse('2099-01-01T00:01:00.000Z'),
        IsoTimestampSchema.parse('2099-01-01T00:01:02.000Z'),
      ),
    );

    expect(listed).toEqual([atOneSecond, atTwoSeconds]);
  });

  test('declareActivation refuses a version that is not accepted', async () => {
    const { initialVersion } = await createDefaultPolicy();

    const error = expectErr(
      await repository.declareActivation(initialVersion.id, { reason: 'early', actorName: 'ops' }),
    );

    expect(error.code).toBe('policy.version_not_accepted');
  });

  test('declareActivation reports an unknown version', async () => {
    const missing = PolicyVersionIdSchema.parse(createUlidGenerator().next('pver'));

    const error = expectErr(
      await repository.declareActivation(missing, { reason: 'none', actorName: 'ops' }),
    );

    expect(error.code).toBe('policy.version_not_found');
  });

  test.each([
    ['UPDATE', 'update policy_activations set reason = reason'],
    ['DELETE', 'delete from policy_activations'],
    ['TRUNCATE', 'truncate policy_activations'],
  ])('policy_activations rejects %s', async (operation, statement) => {
    const { initialVersion } = await seedAcceptedDefaultPolicy();
    expectOk(
      await repository.declareActivation(initialVersion.id, { reason: 'kept', actorName: 'ops' }),
    );

    const attempt = database.db.execute(statement);

    await expect(attempt).rejects.toMatchObject({
      cause: { message: `policy_activations is append-only: ${operation} is not allowed` },
    });
  });

  test('seedAcceptedPolicy inserts an accepted version 1 and is idempotent', async () => {
    const name = uniqueName();
    const first = expectOk(
      await repository.seedAcceptedPolicy({ name, document: EMPTY_POLICY_DOCUMENT }),
    );
    expect(first.created).toBe(true);
    expect(first.version.versionNumber).toBe(1);
    expect(first.version.status).toBe('accepted');
    expect(first.version.document).toEqual(EMPTY_POLICY_DOCUMENT);

    const second = expectOk(
      await repository.seedAcceptedPolicy({ name, document: EMPTY_POLICY_DOCUMENT }),
    );
    expect(second.created).toBe(false);
    expect(second.policy.id).toBe(first.policy.id);
    expect(second.version.id).toBe(first.version.id);
  });

  test('seedAcceptedPolicy rejects a different document for an existing name', async () => {
    const name = uniqueName();
    expectOk(await repository.seedAcceptedPolicy({ name, document: EMPTY_POLICY_DOCUMENT }));
    const error = expectErr(
      await repository.seedAcceptedPolicy({ name, document: DEFAULT_POLICY_DOCUMENT }),
    );
    expect(error.code).toBe('policy.seed_document_mismatch');
  });
});
