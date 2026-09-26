import type { AppError, IsoTimestamp, Result } from '@authority/kernel';
import type { PolicyId, PolicyVersionId } from '@authority/policy/schema';
import type {
  ChangeReview,
  ChangeReviewId,
  ChangeReviewStatus,
  ReviewDecision,
  Verdict,
} from '#schema';
import type { AuditTail, TraceSourceCounts } from '../domain/report.ts';

export interface StoredVerdict {
  readonly groupKey: string;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface UpsertVerdictInput {
  readonly changeReviewId: ChangeReviewId;
  readonly groupKey: string;
  readonly verdict: Verdict;
  readonly note: string;
  readonly updatedAt: IsoTimestamp;
}

/** A Decision Record with its position and hash in the audit hash chain. */
export interface ChainedDecision {
  readonly decision: ReviewDecision;
  readonly sequence: number;
  readonly hash: string;
}

/**
 * The atomic decision write: inserts the immutable {@link ReviewDecision} and
 * transitions the candidate Policy Version in one transaction (docs/cutline.md
 * section 6). `decision.decision` is `accept` or `reject`, matching the policy
 * transition of the same name and the resulting review status.
 */
export interface DecideStoreInput {
  readonly decision: ReviewDecision;
  readonly candidateVersionId: PolicyVersionId;
}

/**
 * The review's replay failed: marks the review `failed` and returns its
 * candidate Policy Version from `in_review` to `draft` in one transaction, so a
 * new review can be created from that draft.
 */
export interface FailReviewInput {
  readonly changeReviewId: ChangeReviewId;
  readonly candidateVersionId: PolicyVersionId;
}

/**
 * A person withdrew the open review: marks it `withdrawn` and returns its
 * candidate Policy Version from `in_review` to `draft` in one transaction.
 */
export interface WithdrawReviewInput {
  readonly changeReviewId: ChangeReviewId;
  readonly candidateVersionId: PolicyVersionId;
}

/** The review module's persistence port; the drizzle adapter lives in lib/infra. */
export interface ReviewStore {
  insertChangeReview(review: ChangeReview): Promise<void>;
  getChangeReview(id: ChangeReviewId): Promise<ChangeReview | null>;
  /** The Policy's review in `computing` or `ready`, of either kind; there is at most one. */
  findOpenChangeReview(policyId: PolicyId): Promise<ChangeReview | null>;
  /** Every review of the Policy, newest first. */
  listChangeReviews(policyId: PolicyId): Promise<readonly ChangeReview[]>;
  updateStatus(id: ChangeReviewId, status: ChangeReviewStatus): Promise<void>;
  failReview(input: FailReviewInput): Promise<void>;
  /** False when the review is no longer `computing` or `ready`; nothing changes then. */
  withdrawReview(input: WithdrawReviewInput): Promise<boolean>;
  upsertVerdict(input: UpsertVerdictInput): Promise<void>;
  getVerdict(changeReviewId: ChangeReviewId, groupKey: string): Promise<StoredVerdict | null>;
  listVerdicts(changeReviewId: ChangeReviewId): Promise<readonly StoredVerdict[]>;
  decide(input: DecideStoreInput): Promise<Result<void, AppError>>;
  getDecision(changeReviewId: ChangeReviewId): Promise<ReviewDecision | null>;
  getChainedDecision(changeReviewId: ChangeReviewId): Promise<ChainedDecision | null>;
  /** The latest Decision Record in the audit chain across all reviews, or null while the chain is empty. */
  getAuditTail(): Promise<AuditTail | null>;
}

/**
 * The trace surface the review module reads: the window's Actions counted by
 * the source of their Trace Import. The server wires it to the trace module.
 */
export interface TraceSourceReader {
  countActionsBySource(window: {
    readonly from: IsoTimestamp;
    readonly to: IsoTimestamp;
  }): Promise<TraceSourceCounts>;
}
