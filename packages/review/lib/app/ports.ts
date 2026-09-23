import type { AppError, IsoTimestamp, Result } from '@authority/kernel';
import type { PolicyVersionId } from '@authority/policy/schema';
import type {
  ChangeReview,
  ChangeReviewId,
  ChangeReviewStatus,
  ReviewDecision,
  Verdict,
} from '../../schema.ts';

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

/** The review module's persistence port; the drizzle adapter lives in lib/infra. */
export interface ReviewStore {
  insertChangeReview(review: ChangeReview): Promise<void>;
  getChangeReview(id: ChangeReviewId): Promise<ChangeReview | null>;
  updateStatus(id: ChangeReviewId, status: ChangeReviewStatus): Promise<void>;
  upsertVerdict(input: UpsertVerdictInput): Promise<void>;
  getVerdict(changeReviewId: ChangeReviewId, groupKey: string): Promise<StoredVerdict | null>;
  listVerdicts(changeReviewId: ChangeReviewId): Promise<readonly StoredVerdict[]>;
  decide(input: DecideStoreInput): Promise<Result<void, AppError>>;
  getDecision(changeReviewId: ChangeReviewId): Promise<ReviewDecision | null>;
}
