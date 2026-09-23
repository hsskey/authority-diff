import { z } from 'zod';
import { EffectSchema, IsoTimestampSchema, Sha256Schema } from '@authority/kernel';
import { AnalyzabilitySchema, CapabilitySchema, RuntimeSchema } from '@authority/action/schema';
import {
  ParsedSessionSchema,
  RuntimeObservationSchema,
  StoredAgentActionSchema,
  TraceImportIdSchema,
} from '@authority/trace/schema';
import {
  DecisionSchema,
  PolicyDocumentSchema,
  PolicyIssueSchema,
  PolicySchema,
  PolicyVersionIdSchema,
  PolicyVersionSchema,
  ZoneSchema,
} from '@authority/policy/schema';
import {
  DiffGroupSchema,
  ReplayRunIdSchema,
  ReplayRunSchema,
  ReplayRunStatusSchema,
  ReplayStatsSchema,
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

// POST /trace-imports
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

// POST /runtime-observations
export const RuntimeObservationInputSchema = RuntimeObservationSchema.omit({
  observationKey: true,
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

// GET /actions, GET /actions/{actionKey}
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

// POST /actions/reclassify
// Added in the trace-storage change: `authority reclassify` is a CLI that calls
// this endpoint, not a server-side job. It re-runs the current classifier over
// the Actions in the window whose stored classifier version is stale.
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

// GET /policies, POST /policies
export const PolicyResponseSchema = PolicySchema;
export type PolicyResponse = z.infer<typeof PolicyResponseSchema>;

export const ListPoliciesResponseSchema = pageOf(PolicyResponseSchema);
export type ListPoliciesResponse = z.infer<typeof ListPoliciesResponseSchema>;

export const CreatePolicyRequestSchema = z.object({
  name: z.string().min(1),
  template: z.enum(['default', 'empty']),
});
export type CreatePolicyRequest = z.infer<typeof CreatePolicyRequestSchema>;

// POST /policies/{id}/versions, GET/PUT /policy-versions/{id}
export const CreatePolicyVersionRequestSchema = z.object({
  baseVersionId: PolicyVersionIdSchema,
});
export type CreatePolicyVersionRequest = z.infer<typeof CreatePolicyVersionRequestSchema>;

export const PolicyVersionResponseSchema = PolicyVersionSchema;
export type PolicyVersionResponse = z.infer<typeof PolicyVersionResponseSchema>;

export const ListPolicyVersionsResponseSchema = pageOf(PolicyVersionResponseSchema);
export type ListPolicyVersionsResponse = z.infer<typeof ListPolicyVersionsResponseSchema>;

export const UpdatePolicyVersionRequestSchema = z.object({
  document: PolicyDocumentSchema,
});
export type UpdatePolicyVersionRequest = z.infer<typeof UpdatePolicyVersionRequestSchema>;

// POST /policy-versions/{id}/validations
export const ValidatePolicyVersionResponseSchema = z.object({
  isValid: z.boolean(),
  issues: z.array(PolicyIssueSchema),
});
export type ValidatePolicyVersionResponse = z.infer<typeof ValidatePolicyVersionResponseSchema>;

// POST /replay-runs, GET /replay-runs/{id}
export const CreateReplayRunRequestSchema = z.object({
  baselineVersionId: PolicyVersionIdSchema,
  candidateVersionId: PolicyVersionIdSchema,
  windowFrom: IsoTimestampSchema,
  windowTo: IsoTimestampSchema,
});
export type CreateReplayRunRequest = z.infer<typeof CreateReplayRunRequestSchema>;

export const ReplayRunResponseSchema = ReplayRunSchema;
export type ReplayRunResponse = z.infer<typeof ReplayRunResponseSchema>;

// GET /replay-runs/{id}/diff-groups
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

// GET /diff-groups/{runId}/{groupKey}/samples
export const DiffGroupSampleSchema = z.object({
  action: StoredAgentActionSchema,
  baselineDecision: DecisionSchema,
  candidateDecision: DecisionSchema,
});
export type DiffGroupSample = z.infer<typeof DiffGroupSampleSchema>;

export const DiffGroupSamplesResponseSchema = z.object({
  items: z.array(DiffGroupSampleSchema),
});
export type DiffGroupSamplesResponse = z.infer<typeof DiffGroupSamplesResponseSchema>;

// GET /authority-map
// The map is the most recent completed run for the accepted baseline; its
// period is carried by the run's windowFrom/windowTo, so the request takes no
// query parameters.
export const AuthorityMapCellSchema = z.object({
  capability: CapabilitySchema,
  zone: ZoneSchema,
  effect: EffectSchema,
  count: z.number().int().nonnegative(),
});
export type AuthorityMapCell = z.infer<typeof AuthorityMapCellSchema>;

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
});
export type AuthorityMapResponse = z.infer<typeof AuthorityMapResponseSchema>;

// POST /change-reviews, GET /change-reviews/{id}
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

export const ChangeReviewResponseSchema = ChangeReviewSchema.extend({
  replaySummary: ReplaySummarySchema,
  gate: GateSchema,
});
export type ChangeReviewResponse = z.infer<typeof ChangeReviewResponseSchema>;

// GET /change-reviews/{id}/diff-groups
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

// PUT /change-reviews/{id}/verdicts/{groupKey}
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

// POST /change-reviews/{id}/decisions
export const CreateDecisionRequestSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  note: z.string(),
  reviewerName: z.string().min(1),
});
export type CreateDecisionRequest = z.infer<typeof CreateDecisionRequestSchema>;
