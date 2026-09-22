import { z } from 'zod';
import { IsoTimestampSchema, Sha256Schema, prefixedId } from '@authority/kernel';
import { PolicyIdSchema, PolicyVersionIdSchema } from '@authority/policy/schema';
import { ReplayRunIdSchema } from '@authority/replay/schema';

export const ChangeReviewIdSchema = prefixedId('rev', 'ChangeReviewId');
export type ChangeReviewId = z.infer<typeof ChangeReviewIdSchema>;

export const ChangeReviewStatusSchema = z.enum([
  'computing',
  'ready',
  'accepted',
  'rejected',
  'failed',
]);
export type ChangeReviewStatus = z.infer<typeof ChangeReviewStatusSchema>;

/**
 * A Change Review replays one candidate Policy Version against the active
 * baseline over a window and gates its acceptance on the resulting Diff Groups.
 * `replayRunId` is null until the run is linked; `decidedBy`, `decidedAt`, and
 * `decisionNote` are set only once a decision is recorded.
 */
export const ChangeReviewSchema = z.object({
  id: ChangeReviewIdSchema,
  policyId: PolicyIdSchema,
  candidateVersionId: PolicyVersionIdSchema,
  candidateContentHash: Sha256Schema,
  baselineVersionId: PolicyVersionIdSchema,
  windowFrom: IsoTimestampSchema,
  windowTo: IsoTimestampSchema,
  replayRunId: ReplayRunIdSchema.nullable(),
  status: ChangeReviewStatusSchema,
  decidedBy: z.string().nullable(),
  decidedAt: IsoTimestampSchema.nullable(),
  decisionNote: z.string().nullable(),
  createdAt: IsoTimestampSchema,
});
export type ChangeReview = z.infer<typeof ChangeReviewSchema>;

export const VerdictSchema = z.enum(['expected', 'investigate', 'unexpected']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const GateBlockerCodeSchema = z.enum([
  'replay_incomplete',
  'replay_failed',
  'widening_unreviewed',
  'widening_investigate',
  'widening_unexpected',
]);
export type GateBlockerCode = z.infer<typeof GateBlockerCodeSchema>;

export const GateBlockerSchema = z.object({
  code: GateBlockerCodeSchema,
  count: z.number().int().positive(),
});
export type GateBlocker = z.infer<typeof GateBlockerSchema>;

/**
 * The acceptance gate. `isOpen` is true only when `blockers` is empty. Each
 * blocker names one of the five codes and how many groups or runs raise it.
 */
export const GateSchema = z.object({
  isOpen: z.boolean(),
  blockers: z.array(GateBlockerSchema),
});
export type Gate = z.infer<typeof GateSchema>;

/** One group's recorded Verdict, captured in a decision's snapshot. */
export const VerdictSnapshotEntrySchema = z.object({
  groupKey: Sha256Schema,
  verdict: VerdictSchema,
});
export type VerdictSnapshotEntry = z.infer<typeof VerdictSnapshotEntrySchema>;

/**
 * The immutable evidence a decision is recorded with (insert and select only).
 * The hashes and `classifierVersion` pin the exact replay inputs and result a
 * reviewer saw, and `verdictSnapshot` freezes the per-group Verdicts at
 * decision time (docs/cutline.md section 6).
 */
export const ReviewDecisionSchema = z.object({
  changeReviewId: ChangeReviewIdSchema,
  decision: z.enum(['accept', 'reject']),
  note: z.string(),
  reviewerName: z.string().min(1),
  decidedAt: IsoTimestampSchema,
  baselineContentHash: Sha256Schema,
  candidateContentHash: Sha256Schema,
  replayInputsHash: Sha256Schema,
  replayResultHash: Sha256Schema,
  classifierVersion: z.string(),
  verdictSnapshot: z.array(VerdictSnapshotEntrySchema),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
