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
  'withdrawn',
]);
export type ChangeReviewStatus = z.infer<typeof ChangeReviewStatusSchema>;

/**
 * `change` replays the candidate against the accepted baseline (a version_diff
 * run); `adoption` applies the candidate alone as the Initial Adoption preview
 * (an adoption run). The server derives the kind: a Policy with an accepted
 * version gets a change review, a Policy without one gets an adoption review.
 */
export const ReviewKindSchema = z.enum(['change', 'adoption']);
export type ReviewKind = z.infer<typeof ReviewKindSchema>;

/**
 * A Change Review replays one candidate Policy Version over a window and gates
 * its acceptance on the Verdicts over the resulting groups. `baselineVersionId`
 * is null exactly when `kind` is `adoption`. `replayRunId` is null until the
 * run is linked; `decidedBy`, `decidedAt`, and `decisionNote` are set only once
 * a decision is recorded.
 */
export const ChangeReviewSchema = z.object({
  id: ChangeReviewIdSchema,
  policyId: PolicyIdSchema,
  kind: ReviewKindSchema,
  candidateVersionId: PolicyVersionIdSchema,
  candidateContentHash: Sha256Schema,
  baselineVersionId: PolicyVersionIdSchema.nullable(),
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

/**
 * `replay_*` blockers apply to every kind. The `widening_*` blockers count a
 * change review's Widening groups; the `adoption_*` blockers count an adoption
 * review's ask and deny groups.
 */
export const GateBlockerCodeSchema = z.enum([
  'replay_incomplete',
  'replay_failed',
  'widening_unreviewed',
  'widening_investigate',
  'widening_unexpected',
  'adoption_unreviewed',
  'adoption_investigate',
  'adoption_unexpected',
]);
export type GateBlockerCode = z.infer<typeof GateBlockerCodeSchema>;

export const GateBlockerSchema = z.object({
  code: GateBlockerCodeSchema,
  count: z.number().int().positive(),
});
export type GateBlocker = z.infer<typeof GateBlockerSchema>;

/**
 * The acceptance gate. `isOpen` is true only when `blockers` is empty. Each
 * blocker names one code and how many groups or runs raise it.
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
 * decision time (docs/cutline.md section 6). `baselineContentHash` is null for
 * an adoption decision, which has no baseline; the audit hash chain serializes
 * that null as is.
 */
export const ReviewDecisionSchema = z.object({
  changeReviewId: ChangeReviewIdSchema,
  decision: z.enum(['accept', 'reject']),
  note: z.string(),
  reviewerName: z.string().min(1),
  decidedAt: IsoTimestampSchema,
  baselineContentHash: Sha256Schema.nullable(),
  candidateContentHash: Sha256Schema,
  replayInputsHash: Sha256Schema,
  replayResultHash: Sha256Schema,
  classifierVersion: z.string(),
  verdictSnapshot: z.array(VerdictSnapshotEntrySchema),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
