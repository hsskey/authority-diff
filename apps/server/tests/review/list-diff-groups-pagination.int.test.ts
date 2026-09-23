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
import type { PolicyDocument, PolicyId, PolicyVersionId } from '@authority/policy/schema';
import { createMemoryLogger } from '@authority/platform/testing';
import { createReplayModule } from '@authority/replay';
import type { PolicyReader, ReplayModule } from '@authority/replay';
import { createTraceModule } from '@authority/trace';
import { ParsedSessionSchema } from '@authority/trace/schema';
import { createReviewModule } from '@authority/review';
import type { ChangeReviewView, PolicyReviewRepository, ReviewModule } from '@authority/review';
import { ChangeReviewIdSchema } from '@authority/review/schema';
import sessionFixture from '../../../../tests/fixtures/parsed-session.json' with { type: 'json' };

const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';
const WINDOW_FROM = IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z');

function freshWindow() {
  return { windowFrom: WINDOW_FROM, windowTo: IsoTimestampSchema.parse(new Date().toISOString()) };
}

const clock = createSystemClock();
const idGenerator = createUlidGenerator();

let database: Database;
let review: ReviewModule;
let repository: ReturnType<typeof createPolicyRepository>;

const WIDE_OPEN: PolicyDocument = {
  ...EMPTY_POLICY_DOCUMENT,
  rules: [
    {
      ruleId: 'allow_everything',
      match: { capabilities: '*', zones: '*', reversibility: null, analyzability: null },
      effect: 'allow',
      rationale: 'test fixture: widen every action so the review has widening groups',
    },
  ],
};

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
  };
}

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
  repository = createPolicyRepository({ db: database.db, clock, idGenerator });
  const trace = createTraceModule({ database, clock, idGenerator });
  const imported = await trace.importTrace(ParsedSessionSchema.parse(sessionFixture));
  if (!imported.ok) {
    throw new Error('importTrace failed');
  }
  const replay: ReplayModule = createReplayModule({
    database,
    reader: trace.reader,
    policy: makePolicyReader(repository),
    clock,
    idGenerator,
    logger: createMemoryLogger(),
    classifierVersion: trace.classifierVersion,
  });
  review = createReviewModule({
    database,
    replay,
    policy: makePolicyReviewRepository(repository),
    traceSources: trace,
    clock,
    idGenerator,
  });
});

afterAll(async () => {
  await database.close();
});

async function seedCandidate(): Promise<PolicyVersionId> {
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
  const widened = await repository.updateDraftDocument(
    draft.value.id,
    draft.value.contentHash,
    WIDE_OPEN,
  );
  if (!widened.ok) {
    throw new Error('updateDraftDocument failed');
  }
  return widened.value.id;
}

async function waitReady(
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

// Regression for the fix in 9088f85: listDiffGroups must apply the verdict
// filter BEFORE paginating, so limit and nextCursor are computed over the
// filtered set. Before the fix, the replay layer sliced the page first and the
// verdict filter ran in-memory afterward: a page whose limit-sized slice held
// only non-matching verdicts returned empty items WITH a non-null nextCursor,
// so a consumer that stops on an empty/short page silently missed later matches.
test('verdict filter is applied before pagination: no empty page with a non-null cursor, and every match is returned (regression)', async () => {
  const candidateId = await seedCandidate();
  const created = await review.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  const reviewId = created.value.review.id;
  await waitReady(reviewId);

  const all = await review.listDiffGroups(reviewId, { direction: 'widening', limit: 200 });
  if (!all.ok) {
    throw new Error(all.error.code);
  }
  const ordered = [...all.value.items].sort((a, b) => (a.groupKey < b.groupKey ? -1 : 1));
  // Need at least two widening groups to exercise a filtered page boundary.
  expect(ordered.length).toBeGreaterThanOrEqual(2);

  // Mark the group with the SMALLEST groupKey (the one replay returns first) as
  // 'expected' and every other group as 'unexpected'. That is exactly the shape
  // that broke before the fix: a verdict=unexpected&limit=1 query's first
  // replay page holds only the 'expected' group.
  const [firstByKey, ...rest] = ordered;
  if (!firstByKey) {
    throw new Error('expected at least one widening group');
  }
  const expectedUnexpectedKeys = rest.map((g) => g.groupKey);
  {
    const r = await review.recordVerdict({
      changeReviewId: reviewId,
      groupKey: firstByKey.groupKey,
      verdict: 'expected',
      note: '',
    });
    if (!r.ok) {
      throw new Error(r.error.code);
    }
  }
  for (const g of rest) {
    const r = await review.recordVerdict({
      changeReviewId: reviewId,
      groupKey: g.groupKey,
      verdict: 'unexpected',
      note: '',
    });
    if (!r.ok) {
      throw new Error(r.error.code);
    }
  }

  // Page through verdict=unexpected one at a time and collect every match.
  const collected: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const page = await review.listDiffGroups(reviewId, {
      direction: 'widening',
      verdict: 'unexpected',
      cursor,
      limit: 1,
    });
    if (!page.ok) {
      throw new Error(page.error.code);
    }
    pages += 1;
    // Every returned item actually matches the requested verdict.
    for (const item of page.value.items) {
      expect(item.verdict).toBe('unexpected');
      collected.push(item.groupKey);
    }
    // The regression: an empty page must never carry a non-null cursor. With the
    // pre-fix code the first page here was [] with nextCursor = firstByKey.
    if (page.value.items.length === 0) {
      expect(page.value.nextCursor).toBeNull();
    }
    if (page.value.nextCursor === null) {
      break;
    }
    cursor = page.value.nextCursor;
    expect(pages).toBeLessThan(50); // guard against a cursor that never terminates
  }

  // Every unexpected group was returned, in ascending groupKey order, and the
  // 'expected' group was never surfaced by the verdict=unexpected filter.
  expect(collected).toEqual(expectedUnexpectedKeys);
  expect(collected).not.toContain(firstByKey.groupKey);
});
