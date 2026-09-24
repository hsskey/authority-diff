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
import type { ActionReader, TraceModule } from '@authority/trace';
import { ActionForReplaySchema, ParsedSessionSchema } from '@authority/trace/schema';
import { createReviewModule, verifyAuditChain } from '@authority/review';
import type { ChangeReviewView, PolicyReviewRepository, ReviewModule } from '@authority/review';
import type { ChangeReviewId } from '@authority/review/schema';
import actionFixture from '../../../../tests/fixtures/action-for-replay.json' with { type: 'json' };
import sessionFixture from '../../../../tests/fixtures/parsed-session.json' with { type: 'json' };

const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';

// The window starts before the other review tests' windows so the extra
// session below stays out of their replays; it still covers the shared fixture.
const WINDOW_FROM = IsoTimestampSchema.parse('2025-12-01T00:00:00.000Z');

function freshWindow() {
  return { windowFrom: WINDOW_FROM, windowTo: IsoTimestampSchema.parse(new Date().toISOString()) };
}

// A second synthetic session whose one Action reads a credentials path, so the
// candidate below yields one deny group next to the fixture's ask group.
const CREDENTIALS_SESSION = ParsedSessionSchema.parse({
  ...sessionFixture,
  sessionExternalId: 'synthetic-session-adoption-002',
  startedAt: '2025-12-15T03:04:05.006Z',
  endedAt: '2025-12-15T03:04:06.007Z',
  toolCalls: [
    {
      toolUseId: 'synthetic-tool-adoption-101',
      toolName: 'Bash',
      toolInputRedacted: 'cat ~/.synthetic-credentials/token',
      isInputTruncated: false,
      workspaceRoot: '~/synthetic-workspace',
      gitBranch: 'feature/synthetic-contract',
      repoRemotes: null,
      sequence: 0,
      isSidechain: false,
      observedOutcome: 'executed',
      occurredAt: '2025-12-15T03:04:05.006Z',
    },
  ],
  totalLineCount: 2,
  unparsedLineCount: 0,
  redactions: [],
});

const INITIAL_POLICY: PolicyDocument = {
  ...EMPTY_POLICY_DOCUMENT,
  environment: {
    ...EMPTY_POLICY_DOCUMENT.environment,
    credentialPaths: ['~/.synthetic-credentials/**'],
  },
  rules: [
    {
      ruleId: 'deny_credentials_access',
      match: {
        capabilities: '*',
        zones: ['credentials'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'deny',
      rationale: 'test fixture: credentials reads are denied so the preview has a deny group',
    },
  ],
};

const clock = createSystemClock();
const idGenerator = createUlidGenerator();

let database: Database;
let review: ReviewModule;
let repository: ReturnType<typeof createPolicyRepository>;
let trace: TraceModule;

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
  trace = createTraceModule({ database, clock, idGenerator });
  for (const session of [ParsedSessionSchema.parse(sessionFixture), CREDENTIALS_SESSION]) {
    const imported = await trace.importTrace(session);
    if (!imported.ok) {
      throw new Error('importTrace failed');
    }
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

/** A Policy with no accepted version whose draft version 1 is the candidate. */
async function createDraftVersionOne(): Promise<PolicyVersionId> {
  const created = await repository.createPolicy({
    name: idGenerator.next('policy'),
    template: 'empty',
  });
  if (!created.ok) {
    throw new Error('createPolicy failed');
  }
  const updated = await repository.updateDraftDocument(
    created.value.initialVersion.id,
    created.value.initialVersion.contentHash,
    INITIAL_POLICY,
  );
  if (!updated.ok) {
    throw new Error('updateDraftDocument failed');
  }
  return updated.value.id;
}

/** A legacy Policy whose version 1 was seeded as accepted without a review. */
async function seedLegacyAccepted(): Promise<{ policyId: PolicyId; acceptedId: PolicyVersionId }> {
  const seeded = await repository.seedAcceptedPolicy({
    name: idGenerator.next('policy'),
    document: EMPTY_POLICY_DOCUMENT,
  });
  if (!seeded.ok) {
    throw new Error('seedAcceptedPolicy failed');
  }
  return { policyId: seeded.value.policy.id, acceptedId: seeded.value.version.id };
}

async function createReview(candidateVersionId: PolicyVersionId): Promise<ChangeReviewView> {
  const created = await review.createChangeReview({ candidateVersionId, ...freshWindow() });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  return created.value;
}

async function waitReady(id: ChangeReviewId): Promise<ChangeReviewView> {
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

async function readyAdoptionReview(): Promise<{
  candidateId: PolicyVersionId;
  reviewId: ChangeReviewId;
  groups: { groupKey: string; effect: 'ask' | 'deny' }[];
}> {
  const candidateId = await createDraftVersionOne();
  const created = await createReview(candidateId);
  const reviewId = created.review.id;
  await waitReady(reviewId);
  const groups = await review.listAdoptionGroups(reviewId, { limit: 200 });
  if (!groups.ok) {
    throw new Error(groups.error.code);
  }
  return {
    candidateId,
    reviewId,
    groups: groups.value.items.map((group) => ({ groupKey: group.groupKey, effect: group.effect })),
  };
}

async function recordAll(
  reviewId: ChangeReviewId,
  groups: readonly { groupKey: string }[],
  verdict: 'expected' | 'investigate' | 'unexpected',
): Promise<void> {
  for (const group of groups) {
    const recorded = await review.recordVerdict({
      changeReviewId: reviewId,
      groupKey: group.groupKey,
      verdict,
      note: '',
    });
    if (!recorded.ok) {
      throw new Error(recorded.error.code);
    }
  }
}

test('a Policy with no accepted version gets an adoption review over an adoption run with no baseline', async () => {
  const candidateId = await createDraftVersionOne();

  const created = await createReview(candidateId);

  expect(created.review.kind).toBe('adoption');
  expect(created.review.baselineVersionId).toBeNull();
  const candidate = await repository.getVersion(candidateId);
  expect(candidate.ok && candidate.value.status).toBe('in_review');
  const ready = await waitReady(created.review.id);
  expect(ready.replaySummary.status).toBe('completed');
  expect(ready.traceSources).toEqual({ transcript: 4, hook: 0, synthetic: 0 });
  // The diff-group listing is empty for an adoption review; its groups are Adoption Groups.
  const diffGroups = await review.listDiffGroups(created.review.id, { limit: 200 });
  expect(diffGroups.ok && diffGroups.value.items).toEqual([]);
});

test("listChangeReviews finds the Policy's adoption review with its gate, newest first", async () => {
  const candidateId = await createDraftVersionOne();
  const created = await createReview(candidateId);
  await waitReady(created.review.id);

  const listed = await review.listChangeReviews({
    policyId: created.review.policyId,
    limit: 50,
  });

  expect(listed.ok && listed.value.nextCursor).toBeNull();
  expect(listed.ok && listed.value.items.map((view) => view.review.id)).toEqual([
    created.review.id,
  ]);
  expect(listed.ok && listed.value.items[0]?.review.status).toBe('ready');
  expect(listed.ok && listed.value.items[0]?.gate.blockers[0]?.code).toBe('adoption_unreviewed');
});

test('the adoption gate stays closed until every ask and deny group is expected, then accept makes the candidate accepted', async () => {
  const { candidateId, reviewId, groups } = await readyAdoptionReview();
  expect(groups.map((group) => group.effect)).toEqual(['deny', 'ask']);

  const unreviewed = await review.getChangeReview(reviewId);
  expect(unreviewed.ok && unreviewed.value.gate).toEqual({
    isOpen: false,
    blockers: [{ code: 'adoption_unreviewed', count: 2 }],
  });
  const blocked = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: '',
    reviewerName: 'tester',
  });
  expect(!blocked.ok && blocked.error.code).toBe('review.gate_blocked');

  await recordAll(reviewId, groups, 'expected');
  const open = await review.getChangeReview(reviewId);
  expect(open.ok && open.value.gate).toEqual({ isOpen: true, blockers: [] });

  const accepted = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: 'first policy',
    reviewerName: 'tester',
  });
  expect(accepted.ok && accepted.value.review.status).toBe('accepted');
  const candidate = await repository.getVersion(candidateId);
  expect(candidate.ok && [candidate.value.status, candidate.value.versionNumber]).toEqual([
    'accepted',
    1,
  ]);
});

test.each([
  ['investigate', 'adoption_investigate'],
  ['unexpected', 'adoption_unexpected'],
] as const)(
  'a deny group left %s keeps the adoption gate closed with %s',
  async (verdict, code) => {
    const { reviewId, groups } = await readyAdoptionReview();
    const [deny, ...rest] = groups;
    if (deny === undefined) {
      throw new Error('expected a deny group');
    }

    await recordAll(reviewId, rest, 'expected');
    await recordAll(reviewId, [deny], verdict);

    const view = await review.getChangeReview(reviewId);
    expect(view.ok && view.value.gate).toEqual({ isOpen: false, blockers: [{ code, count: 1 }] });
  },
);

test('an adoption decision records a null baselineContentHash and the audit chain still verifies', async () => {
  const { reviewId, groups } = await readyAdoptionReview();
  await recordAll(reviewId, groups, 'expected');
  const accepted = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: '',
    reviewerName: 'tester',
  });
  if (!accepted.ok) {
    throw new Error(accepted.error.code);
  }

  const decision = await review.getDecision(reviewId);
  const verification = await verifyAuditChain(database);

  expect(decision.ok && decision.value?.baselineContentHash).toBeNull();
  expect(decision.ok && decision.value?.verdictSnapshot.length).toBe(groups.length);
  expect(verification).toMatchObject({ isIntact: true, firstBrokenSequence: null });
});

test('the adoption report carries the counts, both group tables, the decision, and the adoption notice', async () => {
  const { reviewId, groups } = await readyAdoptionReview();
  await recordAll(reviewId, groups, 'expected');
  const accepted = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: '',
    reviewerName: 'tester',
  });
  if (!accepted.ok) {
    throw new Error(accepted.error.code);
  }
  const [row] = await database.db.execute<{ sequence: string; hash: string }>(
    `select sequence, hash from review_decisions where change_review_id = '${reviewId}'`,
  );
  if (row === undefined) {
    throw new Error('decision record missing');
  }

  const result = await review.getReport(reviewId);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  const report = result.value;

  expect(report).toContain('기록 출처: 실제 transcript 4건 / synthetic 0건');
  expect(report).toContain(
    '이 수치는 과거 행동에 정책을 적용한 결과이며 과거 runtime의 승인 여부를 복원한 것이 아닙니다.',
  );
  expect(report).toContain('| 허용 | 0 | 0.0% |\n| 확인 필요 | 3 | 75.0% |\n| 차단 | 1 | 25.0% |');
  expect(report).toContain('- 결정: 최초 정책 채택');
  expect(report).toContain(
    `- Decision Record sequence: ${row.sequence}\n- Decision Record hash: \`${row.hash}\``,
  );
  expect(report).not.toContain('deny_credentials_access');
  expect(report).not.toContain('cat ~/.synthetic-credentials/token');
  const askSection = report.slice(
    report.indexOf('## 확인 필요 Adoption Group과 Verdict'),
    report.indexOf('## 차단 Adoption Group과 Verdict'),
  );
  const denySection = report.slice(report.indexOf('## 차단 Adoption Group과 Verdict'));
  expect(askSection).toContain("'확인 필요' 대상이 됩니다. | 3 | 1 |");
  expect(denySection).toContain("'차단' 대상이 됩니다. | 1 | 1 |");
});

test('a Policy has one open review across kinds: a second create is refused until the first is decided', async () => {
  const { candidateId, reviewId, groups } = await readyAdoptionReview();

  const second = await review.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });

  expect(!second.ok && second.error.code).toBe('review.open_review_exists');
  expect(!second.ok && second.error.details?.['changeReviewId']).toBe(reviewId);

  await recordAll(reviewId, groups, 'expected');
  const accepted = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: '',
    reviewerName: 'tester',
  });
  expect(accepted.ok).toBe(true);
});

test('a legacy accepted version 1 cannot be adopted again: creating a review on it is refused', async () => {
  const { acceptedId } = await seedLegacyAccepted();

  const created = await review.createChangeReview({
    candidateVersionId: acceptedId,
    ...freshWindow(),
  });

  expect(!created.ok && created.error.code).toBe('policy.transition_not_allowed');
});

test('a Policy with an accepted version gets a change review, never an adoption review', async () => {
  const { policyId, acceptedId } = await seedLegacyAccepted();
  const draft = await repository.createDraftVersion(policyId, acceptedId);
  if (!draft.ok) {
    throw new Error('createDraftVersion failed');
  }

  const created = await createReview(draft.value.id);

  expect([created.review.kind, created.review.baselineVersionId]).toEqual(['change', acceptedId]);
  await waitReady(created.review.id);
  const adoptionGroups = await review.listAdoptionGroups(created.review.id, { limit: 200 });
  expect(adoptionGroups.ok && adoptionGroups.value.items).toEqual([]);
});

test('listAdoptionGroups keeps review order, carries verdicts, filters by effect and verdict, and pages by cursor', async () => {
  const { reviewId, groups } = await readyAdoptionReview();
  const [deny, ask] = groups;
  if (deny === undefined || ask === undefined) {
    throw new Error('expected a deny and an ask group');
  }
  await recordAll(reviewId, [ask], 'investigate');

  const all = await review.listAdoptionGroups(reviewId, { limit: 200 });
  const onlyAsk = await review.listAdoptionGroups(reviewId, { effect: 'ask', limit: 200 });
  const onlyUnreviewed = await review.listAdoptionGroups(reviewId, {
    verdict: 'expected',
    limit: 200,
  });
  const firstPage = await review.listAdoptionGroups(reviewId, { limit: 1 });
  const secondPage = await review.listAdoptionGroups(reviewId, { cursor: deny.groupKey, limit: 1 });
  const unknownCursor = await review.listAdoptionGroups(reviewId, {
    cursor: 'f'.repeat(64),
    limit: 1,
  });

  expect(all.ok && all.value.items.map((group) => [group.effect, group.verdict])).toEqual([
    ['deny', null],
    ['ask', 'investigate'],
  ]);
  expect(onlyAsk.ok && onlyAsk.value.items.map((group) => group.groupKey)).toEqual([ask.groupKey]);
  expect(onlyUnreviewed.ok && onlyUnreviewed.value.items).toEqual([]);
  expect(firstPage.ok && [firstPage.value.items[0]?.groupKey, firstPage.value.nextCursor]).toEqual([
    deny.groupKey,
    deny.groupKey,
  ]);
  expect(
    secondPage.ok && [secondPage.value.items[0]?.groupKey, secondPage.value.nextCursor],
  ).toEqual([ask.groupKey, null]);
  expect(unknownCursor.ok && unknownCursor.value).toEqual({ items: [], nextCursor: null });
});

test('a verdict on an adoption review is refused for a group its run does not have', async () => {
  const { reviewId } = await readyAdoptionReview();

  const recorded = await review.recordVerdict({
    changeReviewId: reviewId,
    groupKey: 'e'.repeat(64),
    verdict: 'expected',
    note: '',
  });

  expect(!recorded.ok && recorded.error.code).toBe('replay.group_not_found');
});

// A repeated actionKey is a defect the replay computation refuses, which ends the run failed.
function duplicateActionReader(): ActionReader {
  const [action] = ActionForReplaySchema.array().parse(actionFixture);
  if (action === undefined) {
    throw new Error('the action fixture is empty');
  }
  return {
    getActions: () => Promise.resolve([]),
    streamActions: async function* () {
      await Promise.resolve();
      yield [action, action];
    },
    countStaleClassifications: () => Promise.resolve(0),
    listObservationSessions: () => Promise.resolve([]),
    getObservations: () => Promise.resolve([]),
  };
}

test('a failed replay fails the review, returns the candidate to draft, and frees the Policy for a new review', async () => {
  const logger = createMemoryLogger();
  const failingReview = createReviewModule({
    database,
    replay: createReplayModule({
      database,
      reader: duplicateActionReader(),
      policy: makePolicyReader(repository),
      clock,
      idGenerator,
      logger,
      classifierVersion: 'synthetic-classifier',
    }),
    policy: makePolicyReviewRepository(repository),
    traceSources: trace,
    clock,
    idGenerator,
  });
  const candidateId = await createDraftVersionOne();
  const created = await failingReview.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }

  let failed: ChangeReviewView | null = null;
  for (let attempt = 0; attempt < 200 && failed === null; attempt++) {
    const view = await failingReview.getChangeReview(created.value.review.id);
    failed = view.ok && view.value.review.status === 'failed' ? view.value : null;
    await sleep(25);
  }

  expect(failed?.replaySummary.status).toBe('failed');
  const candidate = await repository.getVersion(candidateId);
  expect(candidate.ok && candidate.value.status).toBe('draft');
  expect(logger.records.map((record) => record.fields?.errorCode)).toEqual([
    'replay.execution_failed',
  ]);

  const retry = await createReview(candidateId);
  await waitReady(retry.review.id);
  expect(retry.review.status).not.toBe('failed');
});

function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

test('a stale repeated sync does not withdraw a candidate a new review has claimed', async () => {
  const failingReplay = createReplayModule({
    database,
    reader: duplicateActionReader(),
    policy: makePolicyReader(repository),
    clock,
    idGenerator,
    logger: createMemoryLogger(),
    classifierVersion: 'synthetic-classifier',
  });

  // Both concurrent syncs read the review as `computing`; the second sync's
  // failReview is held inside its getRun until a new review claims the candidate.
  let racedRunId: string | null = null;
  let armed = false;
  let failedGetRunCalls = 0;
  const bothReachedGetRun = gate();
  const secondSyncMayProceed = gate();

  const gatedReplay: ReplayModule = {
    ...failingReplay,
    async getRun(id) {
      const run = await failingReplay.getRun(id);
      if (armed && id === racedRunId && run?.status === 'failed') {
        failedGetRunCalls += 1;
        if (failedGetRunCalls === 1) {
          await bothReachedGetRun.promise;
        } else if (failedGetRunCalls === 2) {
          bothReachedGetRun.open();
          await secondSyncMayProceed.promise;
        }
      }
      return run;
    },
  };
  const gatedReview = createReviewModule({
    database,
    replay: gatedReplay,
    policy: makePolicyReviewRepository(repository),
    traceSources: trace,
    clock,
    idGenerator,
  });

  const candidateId = await createDraftVersionOne();
  const created = await gatedReview.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  const runId = created.value.replaySummary.replayRunId;
  if (runId === null) {
    throw new Error('expected a replay run');
  }
  racedRunId = runId;

  // Let the run fail without syncing the review, so it stays `computing`.
  let runFailed = false;
  for (let attempt = 0; attempt < 200 && !runFailed; attempt++) {
    const run = await failingReplay.getRun(runId);
    runFailed = run?.status === 'failed';
    if (!runFailed) {
      await sleep(25);
    }
  }
  if (!runFailed) {
    throw new Error('timed out waiting for the replay run to fail');
  }

  armed = true;
  const firstSync = gatedReview.listDiffGroups(created.value.review.id, { limit: 200 });
  const secondSync = gatedReview.listDiffGroups(created.value.review.id, { limit: 200 });

  const first = await Promise.race([firstSync, secondSync]);
  if (!first.ok) {
    throw new Error(first.error.code);
  }
  const withdrawn = await repository.getVersion(candidateId);
  expect(withdrawn.ok && withdrawn.value.status).toBe('draft');

  const claiming = await createReview(candidateId);
  const claimed = await repository.getVersion(candidateId);
  expect(claimed.ok && claimed.value.status).toBe('in_review');

  secondSyncMayProceed.open();
  await Promise.all([firstSync, secondSync]);

  const afterStaleSync = await repository.getVersion(candidateId);
  expect(afterStaleSync.ok && afterStaleSync.value.status).toBe('in_review');
  const claimingView = await review.getChangeReview(claiming.review.id);
  expect(claimingView.ok && claimingView.value.review.status).not.toBe('failed');
});
