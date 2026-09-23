import { asc, desc, sql } from 'drizzle-orm';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Database, narrowTransaction } from '@authority/platform';
import { reviewDecisions } from './tables.ts';

type DrizzleTransaction = ReturnType<typeof narrowTransaction>;
type DecisionRow = typeof reviewDecisions.$inferSelect;

/** The hashed body of a `review_decisions` row: every column except the chain columns. */
export type ReviewDecisionRecord = Omit<DecisionRow, 'sequence' | 'prevHash' | 'hash'>;

/** The result of recomputing the whole decision chain in `sequence` order. */
export interface AuditVerification {
  readonly isIntact: boolean;
  readonly checkedCount: number;
  readonly firstBrokenSequence: number | null;
}

const GENESIS_HASH = '0'.repeat(64);

function chainHash(prevHash: string, record: ReviewDecisionRecord): string {
  return sha256Hex(prevHash + canonicalJson(record));
}

function recordOf(row: DecisionRow): ReviewDecisionRecord {
  const { sequence: _sequence, prevHash: _prevHash, hash: _hash, ...record } = row;
  return record;
}

/**
 * Appends one decision to the chain inside the caller's transaction. The table
 * lock serializes appenders so each reads the tail its insert extends; it is held
 * until the transaction ends and still lets readers through.
 */
export async function appendReviewDecision(
  tx: DrizzleTransaction,
  record: ReviewDecisionRecord,
): Promise<void> {
  await tx.execute(sql`lock table ${reviewDecisions} in share row exclusive mode`);
  const [tail] = await tx
    .select({ hash: reviewDecisions.hash })
    .from(reviewDecisions)
    .orderBy(desc(reviewDecisions.sequence))
    .limit(1);
  const prevHash = tail?.hash ?? GENESIS_HASH;
  await tx
    .insert(reviewDecisions)
    .values({ ...record, prevHash, hash: chainHash(prevHash, record) });
}

/** Recomputes every decision's hash and stops at the first row that does not chain. */
export async function verifyAuditChain(database: Database): Promise<AuditVerification> {
  const rows = await database.db
    .select()
    .from(reviewDecisions)
    .orderBy(asc(reviewDecisions.sequence));
  let prevHash = GENESIS_HASH;
  for (const [index, row] of rows.entries()) {
    if (row.prevHash !== prevHash || row.hash !== chainHash(row.prevHash, recordOf(row))) {
      return { isIntact: false, checkedCount: index + 1, firstBrokenSequence: row.sequence };
    }
    prevHash = row.hash;
  }
  return { isIntact: true, checkedCount: rows.length, firstBrokenSequence: null };
}
