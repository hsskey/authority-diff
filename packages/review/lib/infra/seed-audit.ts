import { narrowTransaction, type Database } from '@authority/platform';
import type { ChangeReviewId } from '../../schema.ts';
import { appendReviewDecision } from './audit-chain.ts';

/** Recorded on review_decisions when demo seeding accepts version 1 without Change Review. */
export const SEED_ONLY_AUDIT_NOTE = 'seed-only: accepted version 1 without Change Review';

const ZERO_HASH = '0'.repeat(64);

export interface RecordSeedOnlyAcceptanceInput {
  readonly changeReviewId: ChangeReviewId;
  readonly contentHash: string;
  readonly decidedAt: string;
}

/** Appends one tamper-evident audit row for a seed-only accepted Policy Version. */
export async function recordSeedOnlyAcceptance(
  database: Database,
  input: RecordSeedOnlyAcceptanceInput,
): Promise<void> {
  await database.transactionRunner.run(async (transaction) => {
    const tx = narrowTransaction(transaction);
    await appendReviewDecision(tx, {
      changeReviewId: input.changeReviewId,
      decision: 'accept',
      note: SEED_ONLY_AUDIT_NOTE,
      reviewerName: 'seed-demo',
      decidedAt: input.decidedAt,
      baselineContentHash: input.contentHash,
      candidateContentHash: input.contentHash,
      replayInputsHash: ZERO_HASH,
      replayResultHash: ZERO_HASH,
      classifierVersion: 'seed',
      verdictSnapshot: [],
    });
  });
}
