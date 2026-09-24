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
let replay: ReplayModule;
let trace: ReturnType<typeof createTraceModule>;
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
  const imported = await trace.importTrace(ParsedSessionSchema.parse(sessionFixture));
  if (!imported.ok) {
    throw new Error('importTrace failed');
  }
  replay = createReplayModule({
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

test('accept is refused while a widening group is unreviewed, then allowed once every group is expected (I7)', async () => {
  const candidateId = await seedCandidate();
  const created = await review.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  // createChangeReview transitions the draft candidate into review.
  const candidateAfterCreate = await repository.getVersion(candidateId);
  expect(candidateAfterCreate.ok && candidateAfterCreate.value.status).toBe('in_review');
  // A Policy with an accepted version gets a change review against that baseline.
  expect(created.value.review.kind).toBe('change');
  expect(created.value.review.baselineVersionId).not.toBeNull();

  const reviewId = created.value.review.id;
  const ready = await waitReady(reviewId);

  const wideningGroups = await review.listDiffGroups(reviewId, {
    direction: 'widening',
    limit: 200,
  });
  if (!wideningGroups.ok) {
    throw new Error(wideningGroups.error.code);
  }
  expect(wideningGroups.value.items.length).toBeGreaterThan(0);

  // Gate is closed on unreviewed widening groups.
  expect(ready.gate.isOpen).toBe(false);
  const blockedAccept = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: '',
    reviewerName: 'tester',
  });
  expect(blockedAccept.ok).toBe(false);
  if (!blockedAccept.ok) {
    expect(blockedAccept.error.code).toBe('review.gate_blocked');
  }

  // Record every widening group as expected.
  for (const group of wideningGroups.value.items) {
    const recorded = await review.recordVerdict({
      changeReviewId: reviewId,
      groupKey: group.groupKey,
      verdict: 'expected',
      note: '',
    });
    if (!recorded.ok) {
      throw new Error(recorded.error.code);
    }
  }

  const accepted = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: 'looks good',
    reviewerName: 'tester',
  });
  if (!accepted.ok) {
    throw new Error(accepted.error.code);
  }
  expect(accepted.value.review.status).toBe('accepted');

  // The candidate version is transitioned to accepted in the same operation.
  const candidateAfter = await repository.getVersion(candidateId);
  expect(candidateAfter.ok && candidateAfter.value.status).toBe('accepted');
});

test('the decision record carries the replay resultHash and the four pinning hashes', async () => {
  const candidateId = await seedCandidate();
  const created = await review.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  const reviewId = created.value.review.id;
  const ready = await waitReady(reviewId);
  const runResultHash = ready.replaySummary.resultHash;
  expect(runResultHash).not.toBeNull();
  expect(ready.replaySummary.replayRunId).not.toBeNull();

  const groups = await review.listDiffGroups(reviewId, { direction: 'widening', limit: 200 });
  if (!groups.ok) {
    throw new Error(groups.error.code);
  }
  for (const group of groups.value.items) {
    await review.recordVerdict({
      changeReviewId: reviewId,
      groupKey: group.groupKey,
      verdict: 'expected',
      note: '',
    });
  }
  const accepted = await review.decide({
    changeReviewId: reviewId,
    decision: 'accept',
    note: '',
    reviewerName: 'tester',
  });
  if (!accepted.ok) {
    throw new Error(accepted.error.code);
  }

  const decisionResult = await review.getDecision(reviewId);
  if (!decisionResult.ok || decisionResult.value === null) {
    throw new Error('decision record missing');
  }
  const decision = decisionResult.value;
  expect(decision.replayResultHash).toBe(runResultHash);
  expect(decision.decision).toBe('accept');
  expect(decision.replayInputsHash).toMatch(/^[0-9a-f]{64}$/);
  expect(decision.baselineContentHash).toMatch(/^[0-9a-f]{64}$/);
  expect(decision.candidateContentHash).toMatch(/^[0-9a-f]{64}$/);
  expect(decision.classifierVersion.length).toBeGreaterThan(0);
  expect(decision.verdictSnapshot.length).toBe(groups.value.items.length);
});

test('the report has the fixed notice and no raw command text, ruleId, or regex', async () => {
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

  const groups = await review.listDiffGroups(reviewId, { limit: 200 });
  if (!groups.ok) {
    throw new Error(groups.error.code);
  }

  const reportResult = await review.getReport(reviewId);
  if (!reportResult.ok) {
    throw new Error(reportResult.error.code);
  }
  const report = reportResult.value;

  expect(report).toContain(
    '이 기록은 정책 변경을 위 과거 기록에 비추어 검토했다는 사실을 남깁니다.',
  );
  expect(report).toContain(
    'Authority Diff는 정책을 배포하거나 강제하지 않았고, runtime이 이 정책대로 동작하는지는 측정하지 않았습니다.',
  );

  // The candidate's rule id (allow_everything) is in the diff data but must not surface.
  expect(report).not.toContain('allow_everything');
  for (const group of groups.value.items) {
    for (const ruleId of [...group.baselineRuleIds, ...group.candidateRuleIds]) {
      expect(report).not.toContain(ruleId);
    }
    if (group.program !== null) {
      expect(report).not.toContain(group.program);
    }
  }
});

test('reject is allowed even when the gate is closed, and transitions the candidate to rejected', async () => {
  const candidateId = await seedCandidate();
  const created = await review.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  const reviewId = created.value.review.id;
  const ready = await waitReady(reviewId);
  expect(ready.gate.isOpen).toBe(false);

  const rejected = await review.decide({
    changeReviewId: reviewId,
    decision: 'reject',
    note: 'not this time',
    reviewerName: 'tester',
  });
  if (!rejected.ok) {
    throw new Error(rejected.error.code);
  }
  expect(rejected.value.review.status).toBe('rejected');

  const candidateAfter = await repository.getVersion(candidateId);
  expect(candidateAfter.ok && candidateAfter.value.status).toBe('rejected');

  const decision = await review.getDecision(reviewId);
  expect(decision.ok && decision.value?.decision).toBe('reject');
});

test("a decided review's report carries its Decision Record sequence and hash", async () => {
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
  const rejected = await review.decide({
    changeReviewId: reviewId,
    decision: 'reject',
    note: '',
    reviewerName: 'tester',
  });
  if (!rejected.ok) {
    throw new Error(rejected.error.code);
  }
  const [row] = await database.db.execute<{ sequence: string; hash: string }>(
    `select sequence, hash from review_decisions where change_review_id = '${reviewId}'`,
  );
  if (row === undefined) {
    throw new Error('decision record missing');
  }

  const report = await review.getReport(reviewId);

  expect(report.ok && report.value).toContain(
    `- Decision Record sequence: ${row.sequence}\n- Decision Record hash: \`${row.hash}\``,
  );
});

test("a decided review's report carries the audit chain tail as of generation", async () => {
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
  const rejected = await review.decide({
    changeReviewId: reviewId,
    decision: 'reject',
    note: '',
    reviewerName: 'tester',
  });
  if (!rejected.ok) {
    throw new Error(rejected.error.code);
  }
  const [own] = await database.db.execute<{ sequence: string }>(
    `select sequence from review_decisions where change_review_id = '${reviewId}'`,
  );
  if (own === undefined) {
    throw new Error('decision record missing');
  }

  // A second decision advances the shared append-only chain past this review's own
  // decision, so the tail the report renders must be a later Decision Record.
  const other = await readyReviewOf(await seedCandidate());
  const otherDecided = await review.decide({
    changeReviewId: other.review.id,
    decision: 'reject',
    note: '',
    reviewerName: 'tester',
  });
  if (!otherDecided.ok) {
    throw new Error(otherDecided.error.code);
  }

  const report = await review.getReport(reviewId);
  if (!report.ok) {
    throw new Error(report.error.code);
  }

  // Integration test files share the one chain and run in parallel, so its tail is
  // a moving target. Read the pair back out of the report and confirm it names a
  // real chain row later than this review's own decision, rather than comparing
  // against a separate global tail query that would race the report's own read.
  const match = report.value.match(
    /audit chain sequence: (\d+)\n- 보고서 생성 시점의 audit chain hash: `([0-9a-f]{64})`/,
  );
  const tailSequence = match?.[1];
  const tailHash = match?.[2];
  if (tailSequence === undefined || tailHash === undefined) {
    throw new Error('report is missing the audit chain tail');
  }
  const [tailRow] = await database.db.execute<{ hash: string }>(
    `select hash from review_decisions where sequence = ${tailSequence}`,
  );
  expect(tailRow?.hash).toBe(tailHash);
  expect(Number(tailSequence)).toBeGreaterThan(Number(own.sequence));
});

async function readyReviewOf(candidateId: PolicyVersionId): Promise<ChangeReviewView> {
  const created = await review.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  return waitReady(created.value.review.id);
}

test('withdrawing a ready review marks it withdrawn and returns its candidate to draft', async () => {
  const candidateId = await seedCandidate();
  const ready = await readyReviewOf(candidateId);

  const withdrawn = await review.withdraw(ready.review.id);

  expect(withdrawn.ok && withdrawn.value.review.status).toBe('withdrawn');
  const candidate = await repository.getVersion(candidateId);
  expect(candidate.ok && candidate.value.status).toBe('draft');
});

test('a withdrawn review is not open, so the draft can start a new review', async () => {
  const candidateId = await seedCandidate();
  const ready = await readyReviewOf(candidateId);
  await review.withdraw(ready.review.id);

  const next = await review.createChangeReview({
    candidateVersionId: candidateId,
    ...freshWindow(),
  });

  expect(next.ok && next.value.review.candidateVersionId).toBe(candidateId);
});

test('a review withdrawn while computing stays withdrawn after its replay completes', async () => {
  // The review reads its run as running until released, so it is withdrawn while computing.
  let isHeld = true;
  const heldReview = createReviewModule({
    database,
    replay: {
      ...replay,
      async getRun(id) {
        const run = await replay.getRun(id);
        return isHeld && run !== null ? { ...run, status: 'running' } : run;
      },
    },
    policy: makePolicyReviewRepository(repository),
    traceSources: trace,
    clock,
    idGenerator,
  });
  const created = await heldReview.createChangeReview({
    candidateVersionId: await seedCandidate(),
    ...freshWindow(),
  });
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  const reviewId = created.value.review.id;
  const withdrawn = await heldReview.withdraw(reviewId);
  if (!withdrawn.ok) {
    throw new Error(withdrawn.error.code);
  }
  isHeld = false;

  const afterReplay = await waitReplayCompleted(reviewId);

  expect(afterReplay.review.status).toBe('withdrawn');
});

test('a decided review cannot be withdrawn and its candidate keeps its decision', async () => {
  const candidateId = await seedCandidate();
  const ready = await readyReviewOf(candidateId);
  await review.decide({
    changeReviewId: ready.review.id,
    decision: 'reject',
    note: 'not this time',
    reviewerName: 'tester',
  });

  const withdrawn = await review.withdraw(ready.review.id);

  expect(!withdrawn.ok && withdrawn.error.code).toBe('review.not_open');
  const candidate = await repository.getVersion(candidateId);
  expect(candidate.ok && candidate.value.status).toBe('rejected');
});

async function waitReplayCompleted(
  id: ReturnType<typeof ChangeReviewIdSchema.parse>,
): Promise<ChangeReviewView> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const view = await review.getChangeReview(id);
    if (!view.ok) {
      throw new Error(view.error.code);
    }
    if (view.value.replaySummary.status === 'completed') {
      return view.value;
    }
    await sleep(25);
  }
  throw new Error('timed out waiting for the replay to complete');
}
