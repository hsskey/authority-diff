import { and, desc, eq, inArray } from 'drizzle-orm';
import { err, invariant, ok } from '@authority/kernel';
import type { AppError, Clock, IdGenerator, Result } from '@authority/kernel';
import type { PolicyId } from '@authority/policy/schema';
import { narrowTransaction } from '@authority/platform';
import type { Database } from '@authority/platform';
import { createPolicyRepository } from '@authority/policy';
import {
  ChangeReviewSchema,
  ReviewDecisionSchema,
  type ChangeReview,
  type ChangeReviewId,
  type ChangeReviewStatus,
  type ReviewDecision,
} from '../../schema.ts';
import type {
  ChainedDecision,
  DecideStoreInput,
  FailReviewInput,
  ReviewStore,
  StoredVerdict,
  UpsertVerdictInput,
  WithdrawReviewInput,
} from '../app/ports.ts';
import type { AuditTail } from '../domain/report.ts';
import { appendReviewDecision, type ReviewDecisionRecord } from './audit-chain.ts';
import { changeReviews, reviewDecisions, reviewVerdicts } from './tables.ts';

export interface ReviewStoreDeps {
  readonly database: Database;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

type ReviewRow = typeof changeReviews.$inferSelect;
type VerdictRow = typeof reviewVerdicts.$inferSelect;

function toReview(row: ReviewRow): ChangeReview {
  return ChangeReviewSchema.parse(row);
}

function toStoredVerdict(row: VerdictRow): StoredVerdict {
  return { groupKey: row.groupKey, verdict: row.verdict, note: row.note };
}

function reviewInsertValues(review: ChangeReview): ReviewRow {
  return {
    id: review.id,
    policyId: review.policyId,
    kind: review.kind,
    candidateVersionId: review.candidateVersionId,
    candidateContentHash: review.candidateContentHash,
    baselineVersionId: review.baselineVersionId,
    windowFrom: review.windowFrom,
    windowTo: review.windowTo,
    replayRunId: review.replayRunId,
    status: review.status,
    decidedBy: review.decidedBy,
    decidedAt: review.decidedAt,
    decisionNote: review.decisionNote,
    createdAt: review.createdAt,
  };
}

function decisionRecord(decision: ReviewDecision): ReviewDecisionRecord {
  return {
    changeReviewId: decision.changeReviewId,
    decision: decision.decision,
    note: decision.note,
    reviewerName: decision.reviewerName,
    decidedAt: decision.decidedAt,
    baselineContentHash: decision.baselineContentHash,
    candidateContentHash: decision.candidateContentHash,
    replayInputsHash: decision.replayInputsHash,
    replayResultHash: decision.replayResultHash,
    classifierVersion: decision.classifierVersion,
    verdictSnapshot: decision.verdictSnapshot.map((entry) => ({
      groupKey: entry.groupKey,
      verdict: entry.verdict,
    })),
  };
}

function internal(cause: unknown): AppError {
  return {
    code: 'internal.unexpected',
    message: 'the review store failed',
    isRetryable: false,
    details: null,
    cause,
  };
}

/** The drizzle-backed {@link ReviewStore}. */
export function createReviewStore(deps: ReviewStoreDeps): ReviewStore {
  const { database, clock, idGenerator } = deps;
  const db = database.db;

  return {
    async insertChangeReview(review: ChangeReview): Promise<void> {
      await db.insert(changeReviews).values(reviewInsertValues(review));
    },

    async getChangeReview(id: ChangeReviewId): Promise<ChangeReview | null> {
      const [row] = await db.select().from(changeReviews).where(eq(changeReviews.id, id)).limit(1);
      return row === undefined ? null : toReview(row);
    },

    async findOpenChangeReview(policyId: PolicyId): Promise<ChangeReview | null> {
      const [row] = await db
        .select()
        .from(changeReviews)
        .where(
          and(
            eq(changeReviews.policyId, policyId),
            inArray(changeReviews.status, ['computing', 'ready']),
          ),
        )
        .limit(1);
      return row === undefined ? null : toReview(row);
    },

    async listChangeReviews(policyId: PolicyId): Promise<readonly ChangeReview[]> {
      const rows = await db
        .select()
        .from(changeReviews)
        .where(eq(changeReviews.policyId, policyId))
        .orderBy(desc(changeReviews.createdAt), desc(changeReviews.id));
      return rows.map(toReview);
    },

    async updateStatus(id: ChangeReviewId, status: ChangeReviewStatus): Promise<void> {
      await db.update(changeReviews).set({ status }).where(eq(changeReviews.id, id));
    },

    async failReview(input: FailReviewInput): Promise<void> {
      await database.transactionRunner.run(async (transaction) => {
        const tx = narrowTransaction(transaction);
        const [failed] = await tx
          .update(changeReviews)
          .set({ status: 'failed' })
          .where(
            and(eq(changeReviews.id, input.changeReviewId), eq(changeReviews.status, 'computing')),
          )
          .returning();
        if (failed === undefined) {
          return;
        }
        const policy = createPolicyRepository({ db: tx, clock, idGenerator });
        const withdrawn = await policy.transitionVersion(input.candidateVersionId, 'withdraw');
        invariant(
          withdrawn.ok || withdrawn.error.code === 'policy.transition_not_allowed',
          `failReview: candidate ${input.candidateVersionId} could not be withdrawn`,
        );
      });
    },

    async withdrawReview(input: WithdrawReviewInput): Promise<boolean> {
      return database.transactionRunner.run(async (transaction) => {
        const tx = narrowTransaction(transaction);
        const [withdrawn] = await tx
          .update(changeReviews)
          .set({ status: 'withdrawn' })
          .where(
            and(
              eq(changeReviews.id, input.changeReviewId),
              inArray(changeReviews.status, ['computing', 'ready']),
            ),
          )
          .returning();
        if (withdrawn === undefined) {
          return false;
        }
        const policy = createPolicyRepository({ db: tx, clock, idGenerator });
        const candidate = await policy.transitionVersion(input.candidateVersionId, 'withdraw');
        invariant(
          candidate.ok,
          `withdrawReview: candidate ${input.candidateVersionId} could not be withdrawn`,
        );
        return true;
      });
    },

    async upsertVerdict(input: UpsertVerdictInput): Promise<void> {
      await db
        .insert(reviewVerdicts)
        .values({
          changeReviewId: input.changeReviewId,
          groupKey: input.groupKey,
          verdict: input.verdict,
          note: input.note,
          updatedAt: input.updatedAt,
        })
        .onConflictDoUpdate({
          target: [reviewVerdicts.changeReviewId, reviewVerdicts.groupKey],
          set: { verdict: input.verdict, note: input.note, updatedAt: input.updatedAt },
        });
    },

    async getVerdict(
      changeReviewId: ChangeReviewId,
      groupKey: string,
    ): Promise<StoredVerdict | null> {
      const [row] = await db
        .select()
        .from(reviewVerdicts)
        .where(
          and(
            eq(reviewVerdicts.changeReviewId, changeReviewId),
            eq(reviewVerdicts.groupKey, groupKey),
          ),
        )
        .limit(1);
      return row === undefined ? null : toStoredVerdict(row);
    },

    async listVerdicts(changeReviewId: ChangeReviewId): Promise<readonly StoredVerdict[]> {
      const rows = await db
        .select()
        .from(reviewVerdicts)
        .where(eq(reviewVerdicts.changeReviewId, changeReviewId));
      return rows.map(toStoredVerdict);
    },

    async getDecision(changeReviewId: ChangeReviewId): Promise<ReviewDecision | null> {
      const [row] = await db
        .select()
        .from(reviewDecisions)
        .where(eq(reviewDecisions.changeReviewId, changeReviewId))
        .limit(1);
      return row === undefined ? null : ReviewDecisionSchema.parse(row);
    },

    async getChainedDecision(changeReviewId: ChangeReviewId): Promise<ChainedDecision | null> {
      const [row] = await db
        .select()
        .from(reviewDecisions)
        .where(eq(reviewDecisions.changeReviewId, changeReviewId))
        .limit(1);
      return row === undefined
        ? null
        : { decision: ReviewDecisionSchema.parse(row), sequence: row.sequence, hash: row.hash };
    },

    async getAuditTail(): Promise<AuditTail | null> {
      const [row] = await db
        .select({ sequence: reviewDecisions.sequence, hash: reviewDecisions.hash })
        .from(reviewDecisions)
        .orderBy(desc(reviewDecisions.sequence))
        .limit(1);
      return row ?? null;
    },

    // Inserts the decision and transitions the candidate version in one
    // transaction (docs/cutline.md section 6). The candidate is pre-validated as
    // in_review by the caller, so a failed transition here is a defect.
    async decide(input: DecideStoreInput): Promise<Result<void, AppError>> {
      try {
        await database.transactionRunner.run(async (transaction) => {
          const tx = narrowTransaction(transaction);
          const policy = createPolicyRepository({ db: tx, clock, idGenerator });
          const transitioned = await policy.transitionVersion(
            input.candidateVersionId,
            input.decision.decision,
          );
          invariant(
            transitioned.ok,
            `decide: candidate ${input.candidateVersionId} could not transition to ${input.decision.decision}`,
          );
          await appendReviewDecision(tx, decisionRecord(input.decision));
          await tx
            .update(changeReviews)
            .set({
              status: input.decision.decision === 'accept' ? 'accepted' : 'rejected',
              decidedBy: input.decision.reviewerName,
              decidedAt: input.decision.decidedAt,
              decisionNote: input.decision.note,
            })
            .where(eq(changeReviews.id, input.decision.changeReviewId));
        });
        return ok(undefined);
      } catch (cause) {
        return err(internal(cause));
      }
    },
  };
}
