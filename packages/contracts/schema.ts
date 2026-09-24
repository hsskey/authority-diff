import { z } from 'zod';
import { EffectSchema, IsoTimestampSchema, Sha256Schema } from '@authority/kernel';
import { AnalyzabilitySchema, CapabilitySchema, RuntimeSchema } from '@authority/action/schema';
import {
  ActivityOverviewSchema,
  ParsedSessionSchema,
  RuntimeObservationSchema,
  StoredAgentActionSchema,
  TraceImportIdSchema,
  TraceSourceCountsSchema,
} from '@authority/trace/schema';
import {
  DecisionSchema,
  PolicyActivationSchema,
  PolicyDocumentSchema,
  PolicyIdSchema,
  PolicyIssueSchema,
  PolicySchema,
  PolicyVersionIdSchema,
  PolicyVersionSchema,
} from '@authority/policy/schema';
import {
  AdoptionEffectSchema,
  AdoptionGroupSchema,
  AnalyzabilityCountsSchema,
  AuthorityMapCellSchema,
  ConformanceFindingStatusSchema,
  ConformanceFindingViewSchema,
  DiffGroupSchema,
  PermissionModeCountSchema,
  ReplayRunIdSchema,
  ReplayRunSchema,
  ReplayRunStatusSchema,
  ReplayStatsSchema,
  UNGUARDED_PERMISSION_MODES,
} from '@authority/replay/schema';
import {
  ChangeReviewIdSchema,
  ChangeReviewSchema,
  GateSchema,
  VerdictSchema,
} from '@authority/review/schema';

/**
 * The wire contract for the V1 HTTP API. Every request body, query, and
 * response is a Zod schema built from the owning package's `schema.ts`. There
 * is one bearer token and no roles; idempotency is the natural keys
 * (`actionKey`, `observationKey`, `inputsHash`), so there is no Idempotency-Key.
 */

const LimitSchema = z.coerce.number().int().min(1).max(200).default(50);
const CursorSchema = z.string().min(1);

function pageOf<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

/** docs/design.md section 28.3. `details` mirrors an AppError's details. */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    isRetryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).nullable(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const HealthzResponseSchema = z.object({
  status: z.literal('ok'),
});
export type HealthzResponse = z.infer<typeof HealthzResponseSchema>;

export const ImportTraceRequestSchema = ParsedSessionSchema.extend({
  toolCalls: ParsedSessionSchema.shape.toolCalls.max(1000),
});
export type ImportTraceRequest = z.infer<typeof ImportTraceRequestSchema>;

export const ImportTraceResponseSchema = z.object({
  importId: TraceImportIdSchema,
  acceptedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
});
export type ImportTraceResponse = z.infer<typeof ImportTraceResponseSchema>;

export const RuntimeObservationInputSchema = RuntimeObservationSchema.omit({
  observationKey: true,
  actionKey: true,
});
export type RuntimeObservationInput = z.infer<typeof RuntimeObservationInputSchema>;

export const CreateRuntimeObservationsRequestSchema = z.object({
  runtime: RuntimeSchema,
  observations: z.array(RuntimeObservationInputSchema).max(500),
});
export type CreateRuntimeObservationsRequest = z.infer<
  typeof CreateRuntimeObservationsRequestSchema
>;

export const CreateRuntimeObservationsResponseSchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
});
export type CreateRuntimeObservationsResponse = z.infer<
  typeof CreateRuntimeObservationsResponseSchema
>;

export const ListActionsQuerySchema = z.object({
  windowFrom: IsoTimestampSchema.optional(),
  windowTo: IsoTimestampSchema.optional(),
  capability: CapabilitySchema.optional(),
  analyzability: AnalyzabilitySchema.optional(),
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type ListActionsQuery = z.infer<typeof ListActionsQuerySchema>;

export const GetActionQuerySchema = z.object({
  policyVersionId: PolicyVersionIdSchema.optional(),
});
export type GetActionQuery = z.infer<typeof GetActionQuerySchema>;

/** `decision` is present only when the request supplies a `policyVersionId`. */
export const ActionResponseSchema = StoredAgentActionSchema.extend({
  decision: DecisionSchema.nullable(),
});
export type ActionResponse = z.infer<typeof ActionResponseSchema>;

export const ListActionsResponseSchema = pageOf(ActionResponseSchema);
export type ListActionsResponse = z.infer<typeof ListActionsResponseSchema>;

/** Re-runs the current classifier over Actions in the window whose stored classifier version is stale. The CLI calls this endpoint; it is not a server-side job. */
export const ReclassifyActionsRequestSchema = z.object({
  windowFrom: IsoTimestampSchema,
  windowTo: IsoTimestampSchema,
});
export type ReclassifyActionsRequest = z.infer<typeof ReclassifyActionsRequestSchema>;

export const ReclassifyActionsResponseSchema = z.object({
  reclassifiedCount: z.number().int().nonnegative(),
  classifierVersion: z.string(),
});
export type ReclassifyActionsResponse = z.infer<typeof ReclassifyActionsResponseSchema>;

/** Actions imported in the last `windowDays` days, from stored activity alone: no Policy Version, so no Effect or Zone. */
export const ActivityOverviewQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).default(30),
});
export type ActivityOverviewQuery = z.infer<typeof ActivityOverviewQuerySchema>;

export const ActivityOverviewResponseSchema = ActivityOverviewSchema.extend({
  windowDays: z.number().int().positive(),
  windowFrom: IsoTimestampSchema,
  windowTo: IsoTimestampSchema,
});
export type ActivityOverviewResponse = z.infer<typeof ActivityOverviewResponseSchema>;

export const PolicyResponseSchema = PolicySchema;
export type PolicyResponse = z.infer<typeof PolicyResponseSchema>;

export const ListPoliciesResponseSchema = pageOf(PolicyResponseSchema);
export type ListPoliciesResponse = z.infer<typeof ListPoliciesResponseSchema>;

export const CreatePolicyRequestSchema = z.object({
  name: z.string().min(1),
  template: z.enum(['default', 'empty']),
});
export type CreatePolicyRequest = z.infer<typeof CreatePolicyRequestSchema>;

export const CreatePolicyVersionRequestSchema = z.object({
  baseVersionId: PolicyVersionIdSchema,
});
export type CreatePolicyVersionRequest = z.infer<typeof CreatePolicyVersionRequestSchema>;

export const PolicyVersionResponseSchema = PolicyVersionSchema;
export type PolicyVersionResponse = z.infer<typeof PolicyVersionResponseSchema>;

/** POST /policies returns the Policy with draft version 1 so the client can open the editor without a second fetch. */
export const CreatePolicyResponseSchema = z.object({
  policy: PolicyResponseSchema,
  initialVersion: PolicyVersionResponseSchema,
});
export type CreatePolicyResponse = z.infer<typeof CreatePolicyResponseSchema>;

/** Every version of the Policy, oldest first. The cursor is the last returned versionNumber as a decimal string. */
export const ListPolicyVersionsQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type ListPolicyVersionsQuery = z.infer<typeof ListPolicyVersionsQuerySchema>;

export const ListPolicyVersionsResponseSchema = pageOf(PolicyVersionResponseSchema);
export type ListPolicyVersionsResponse = z.infer<typeof ListPolicyVersionsResponseSchema>;

export const UpdatePolicyVersionRequestSchema = z.object({
  document: PolicyDocumentSchema,
});
export type UpdatePolicyVersionRequest = z.infer<typeof UpdatePolicyVersionRequestSchema>;

export const ValidatePolicyVersionResponseSchema = z.object({
  isValid: z.boolean(),
  issues: z.array(PolicyIssueSchema),
});
export type ValidatePolicyVersionResponse = z.infer<typeof ValidatePolicyVersionResponseSchema>;

/** Strict so a rollback or review-linked request is refused instead of recorded as a plain activation declaration. */
export const CreatePolicyActivationRequestSchema = z.strictObject({
  reason: z.string().min(1),
  actorName: z.string().min(1),
});
export type CreatePolicyActivationRequest = z.infer<typeof CreatePolicyActivationRequestSchema>;

export const PolicyActivationResponseSchema = PolicyActivationSchema;
export type PolicyActivationResponse = z.infer<typeof PolicyActivationResponseSchema>;

/** Omit `kind` for `version_diff`. `conformance` baselines on observed_runtime; `adoption` applies the candidate with no baseline. */
export const CreateReplayRunRequestSchema = z.union([
  z.object({
    kind: z.literal('version_diff').default('version_diff'),
    baselineVersionId: PolicyVersionIdSchema,
    candidateVersionId: PolicyVersionIdSchema,
    windowFrom: IsoTimestampSchema,
    windowTo: IsoTimestampSchema,
  }),
  z.object({
    kind: z.literal('conformance'),
    candidateVersionId: PolicyVersionIdSchema,
    windowFrom: IsoTimestampSchema,
    windowTo: IsoTimestampSchema,
  }),
  z.object({
    kind: z.literal('adoption'),
    candidateVersionId: PolicyVersionIdSchema,
    windowFrom: IsoTimestampSchema,
    windowTo: IsoTimestampSchema,
  }),
]);
export type CreateReplayRunRequest = z.infer<typeof CreateReplayRunRequestSchema>;

export const ReplayRunResponseSchema = ReplayRunSchema;
export type ReplayRunResponse = z.infer<typeof ReplayRunResponseSchema>;

export const ListDiffGroupsQuerySchema = z.object({
  direction: DiffGroupSchema.shape.direction.optional(),
  severity: DiffGroupSchema.shape.severity.optional(),
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type ListDiffGroupsQuery = z.infer<typeof ListDiffGroupsQuerySchema>;

export const DiffGroupResponseSchema = DiffGroupSchema;
export type DiffGroupResponse = z.infer<typeof DiffGroupResponseSchema>;

export const ListDiffGroupsResponseSchema = pageOf(DiffGroupResponseSchema);
export type ListDiffGroupsResponse = z.infer<typeof ListDiffGroupsResponseSchema>;

/** `targetKeys[i]` matches `action.operations[i]`. Rationale maps are keyed by the ruleId that decided an Operation. */
export const DiffGroupSampleSchema = z.object({
  action: StoredAgentActionSchema,
  targetKeys: z.array(z.string()),
  baselineDecision: DecisionSchema,
  candidateDecision: DecisionSchema,
  baselineRuleRationales: z.record(z.string(), z.string()),
  candidateRuleRationales: z.record(z.string(), z.string()),
});
export type DiffGroupSample = z.infer<typeof DiffGroupSampleSchema>;

export const DiffGroupSamplesResponseSchema = z.object({
  items: z.array(DiffGroupSampleSchema),
});
export type DiffGroupSamplesResponse = z.infer<typeof DiffGroupSamplesResponseSchema>;

/** Adoption Groups in review order: deny before ask, then actionCount descending. */
export const ListAdoptionGroupsQuerySchema = z.object({
  effect: AdoptionEffectSchema.optional(),
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type ListAdoptionGroupsQuery = z.infer<typeof ListAdoptionGroupsQuerySchema>;

export const AdoptionGroupResponseSchema = AdoptionGroupSchema;
export type AdoptionGroupResponse = z.infer<typeof AdoptionGroupResponseSchema>;

export const ListAdoptionGroupsResponseSchema = pageOf(AdoptionGroupResponseSchema);
export type ListAdoptionGroupsResponse = z.infer<typeof ListAdoptionGroupsResponseSchema>;

/** Diff sample shape with the candidate side only: an adoption run has no baseline Decision. */
export const AdoptionGroupSampleSchema = z.object({
  action: StoredAgentActionSchema,
  targetKeys: z.array(z.string()),
  candidateDecision: DecisionSchema,
  candidateRuleRationales: z.record(z.string(), z.string()),
});
export type AdoptionGroupSample = z.infer<typeof AdoptionGroupSampleSchema>;

export const AdoptionGroupSamplesResponseSchema = z.object({
  items: z.array(AdoptionGroupSampleSchema),
});
export type AdoptionGroupSamplesResponse = z.infer<typeof AdoptionGroupSamplesResponseSchema>;

/** Most recent completed run for the accepted baseline; the run's window is the period, so the request has no query parameters. */
export { AnalyzabilityCountsSchema, AuthorityMapCellSchema };
export type { AnalyzabilityCounts, AuthorityMapCell } from '@authority/replay/schema';

export const AuthorityMapResponseSchema = z.object({
  run: z
    .object({
      replayRunId: ReplayRunIdSchema,
      policyVersionId: PolicyVersionIdSchema,
      windowFrom: IsoTimestampSchema,
      windowTo: IsoTimestampSchema,
    })
    .nullable(),
  cells: z.array(AuthorityMapCellSchema),
  analyzability: AnalyzabilityCountsSchema,
});
export type AuthorityMapResponse = z.infer<typeof AuthorityMapResponseSchema>;

/** Findings of the latest completed conformance run (the run carries version and window). unpairedPermissionRequests could not join a Disposition; UNGUARDED_PERMISSION_MODES never prompt. */
export { PermissionModeCountSchema, UNGUARDED_PERMISSION_MODES };
export type { PermissionModeCount } from '@authority/replay/schema';

/** `status` and `note` default so a listing payload from before acknowledgement still parses. */
export const ConformanceFindingResponseSchema = ConformanceFindingViewSchema.extend({
  status: ConformanceFindingStatusSchema.default('open'),
  note: z.string().default(''),
});
export type ConformanceFindingResponse = z.infer<typeof ConformanceFindingResponseSchema>;

export const AcknowledgeConformanceFindingRequestSchema = z.object({
  status: z.literal('acknowledged'),
  note: z.string(),
});
export type AcknowledgeConformanceFindingRequest = z.infer<
  typeof AcknowledgeConformanceFindingRequestSchema
>;

/** `effect` is required: the finding kind does not imply an Effect. */
export const CreatePolicyDraftFromFindingRequestSchema = z.object({
  effect: EffectSchema,
});
export type CreatePolicyDraftFromFindingRequest = z.infer<
  typeof CreatePolicyDraftFromFindingRequestSchema
>;

export const ListConformanceFindingsResponseSchema = z.object({
  run: z
    .object({
      replayRunId: ReplayRunIdSchema,
      policyVersionId: PolicyVersionIdSchema,
      windowFrom: IsoTimestampSchema,
      windowTo: IsoTimestampSchema,
      unpairedPermissionRequests: z.number().int().nonnegative(),
      byPermissionMode: z.array(PermissionModeCountSchema),
    })
    .nullable(),
  items: z.array(ConformanceFindingResponseSchema),
});
export type ListConformanceFindingsResponse = z.infer<typeof ListConformanceFindingsResponseSchema>;

/** The request carries no review kind: the server derives `change` vs `adoption` from whether the Policy already has an accepted version. */
export const CreateChangeReviewRequestSchema = z.object({
  candidateVersionId: PolicyVersionIdSchema,
  windowFrom: IsoTimestampSchema,
  windowTo: IsoTimestampSchema,
});
export type CreateChangeReviewRequest = z.infer<typeof CreateChangeReviewRequestSchema>;

export const ReplaySummarySchema = z.object({
  replayRunId: ReplayRunIdSchema.nullable(),
  status: ReplayRunStatusSchema,
  stats: ReplayStatsSchema.nullable(),
  resultHash: Sha256Schema.nullable(),
});
export type ReplaySummary = z.infer<typeof ReplaySummarySchema>;

/** `traceSources` counts the window's Actions by Trace Import source so the screen can say whether it rests on real or synthetic records. */
export const ChangeReviewResponseSchema = ChangeReviewSchema.extend({
  replaySummary: ReplaySummarySchema,
  gate: GateSchema,
  traceSources: TraceSourceCountsSchema,
});
export type ChangeReviewResponse = z.infer<typeof ChangeReviewResponseSchema>;

/** The Policy's reviews of either kind, newest first, so the web can find an open adoption review when no version is accepted yet. */
export const ListChangeReviewsQuerySchema = z.object({
  policyId: PolicyIdSchema,
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type ListChangeReviewsQuery = z.infer<typeof ListChangeReviewsQuerySchema>;

export const ListChangeReviewsResponseSchema = pageOf(ChangeReviewResponseSchema);
export type ListChangeReviewsResponse = z.infer<typeof ListChangeReviewsResponseSchema>;

export const ReviewDiffGroupResponseSchema = DiffGroupSchema.extend({
  verdict: VerdictSchema.nullable(),
});
export type ReviewDiffGroupResponse = z.infer<typeof ReviewDiffGroupResponseSchema>;

export const ListReviewDiffGroupsQuerySchema = z.object({
  direction: DiffGroupSchema.shape.direction.optional(),
  severity: DiffGroupSchema.shape.severity.optional(),
  verdict: VerdictSchema.optional(),
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type ListReviewDiffGroupsQuery = z.infer<typeof ListReviewDiffGroupsQuerySchema>;

export const ListReviewDiffGroupsResponseSchema = pageOf(ReviewDiffGroupResponseSchema);
export type ListReviewDiffGroupsResponse = z.infer<typeof ListReviewDiffGroupsResponseSchema>;

/** An adoption review's Adoption Groups in the run's review order, each with the review's Verdict; empty for a change review. */
export const ReviewAdoptionGroupResponseSchema = AdoptionGroupSchema.extend({
  verdict: VerdictSchema.nullable(),
});
export type ReviewAdoptionGroupResponse = z.infer<typeof ReviewAdoptionGroupResponseSchema>;

export const ListReviewAdoptionGroupsQuerySchema = z.object({
  effect: AdoptionEffectSchema.optional(),
  verdict: VerdictSchema.optional(),
  cursor: CursorSchema.optional(),
  limit: LimitSchema,
});
export type ListReviewAdoptionGroupsQuery = z.infer<typeof ListReviewAdoptionGroupsQuerySchema>;

export const ListReviewAdoptionGroupsResponseSchema = pageOf(ReviewAdoptionGroupResponseSchema);
export type ListReviewAdoptionGroupsResponse = z.infer<
  typeof ListReviewAdoptionGroupsResponseSchema
>;

export const RecordVerdictRequestSchema = z.object({
  verdict: VerdictSchema,
  note: z.string(),
});
export type RecordVerdictRequest = z.infer<typeof RecordVerdictRequestSchema>;

export const VerdictResponseSchema = z.object({
  changeReviewId: ChangeReviewIdSchema,
  groupKey: Sha256Schema,
  verdict: VerdictSchema,
  note: z.string(),
});
export type VerdictResponse = z.infer<typeof VerdictResponseSchema>;

export const CreateDecisionRequestSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  note: z.string(),
  reviewerName: z.string().min(1),
});
export type CreateDecisionRequest = z.infer<typeof CreateDecisionRequestSchema>;

export const ChangeReviewReportResponseSchema = z.string();
