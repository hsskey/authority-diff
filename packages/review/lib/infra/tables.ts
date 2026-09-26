import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { ChangeReviewStatus, ReviewKind, Verdict, VerdictSnapshotEntry } from '#schema';

// Store IsoTimestamp as text: timestamptz rewrites the brand format; ISO-Z UTC sorts as time (docs/design.md chapter 25).
export const changeReviews = pgTable(
  'change_reviews',
  {
    id: text('id').primaryKey(),
    policyId: text('policy_id').notNull(),
    kind: text('kind').$type<ReviewKind>().notNull().default('change'),
    candidateVersionId: text('candidate_version_id').notNull(),
    candidateContentHash: text('candidate_content_hash').notNull(),
    baselineVersionId: text('baseline_version_id'),
    windowFrom: text('window_from').notNull(),
    windowTo: text('window_to').notNull(),
    replayRunId: text('replay_run_id'),
    status: text('status').$type<ChangeReviewStatus>().notNull(),
    decidedBy: text('decided_by'),
    decidedAt: text('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_change_reviews__policy_id_status').on(t.policyId, t.status),
    check('ck_change_reviews__kind', sql`${t.kind} in ('change', 'adoption')`),
    check(
      'ck_change_reviews__baseline_version_id',
      sql`(${t.kind} = 'adoption') = (${t.baselineVersionId} is null)`,
    ),
  ],
);

export const reviewVerdicts = pgTable(
  'review_verdicts',
  {
    changeReviewId: text('change_review_id').notNull(),
    groupKey: text('group_key').notNull(),
    verdict: text('verdict').$type<Verdict>().notNull(),
    note: text('note').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.changeReviewId, t.groupKey] })],
);

// Insert and select only; a trigger rejects UPDATE, DELETE, and TRUNCATE (docs/cutline.md
// section 6). Each row chains `hash = sha256(prev_hash + canonicalJson(record))` in
// `sequence` order, so the unique `prev_hash` forbids a fork. `baseline_content_hash`
// is null for an adoption decision.
export const reviewDecisions = pgTable(
  'review_decisions',
  {
    changeReviewId: text('change_review_id').primaryKey(),
    decision: text('decision').$type<'accept' | 'reject'>().notNull(),
    note: text('note').notNull(),
    reviewerName: text('reviewer_name').notNull(),
    decidedAt: text('decided_at').notNull(),
    baselineContentHash: text('baseline_content_hash'),
    candidateContentHash: text('candidate_content_hash').notNull(),
    replayInputsHash: text('replay_inputs_hash').notNull(),
    replayResultHash: text('replay_result_hash').notNull(),
    classifierVersion: text('classifier_version').notNull(),
    verdictSnapshot: jsonb('verdict_snapshot').$type<VerdictSnapshotEntry[]>().notNull(),
    sequence: bigserial('sequence', { mode: 'number' }).notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [
    uniqueIndex('uq_review_decisions__sequence').on(t.sequence),
    uniqueIndex('uq_review_decisions__prev_hash').on(t.prevHash),
  ],
);
