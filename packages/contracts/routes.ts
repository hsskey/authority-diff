import type { z } from 'zod';
import {
  AcknowledgeConformanceFindingRequestSchema,
  ActionResponseSchema,
  ActivityOverviewResponseSchema,
  AdoptionGroupSamplesResponseSchema,
  AuthorityMapResponseSchema,
  ChangeReviewReportResponseSchema,
  ChangeReviewResponseSchema,
  ConformanceFindingResponseSchema,
  CreateChangeReviewRequestSchema,
  CreateDecisionRequestSchema,
  CreatePolicyActivationRequestSchema,
  CreatePolicyDraftFromFindingRequestSchema,
  CreatePolicyRequestSchema,
  CreatePolicyResponseSchema,
  CreatePolicyVersionRequestSchema,
  CreateReplayRunRequestSchema,
  CreateRuntimeObservationsRequestSchema,
  CreateRuntimeObservationsResponseSchema,
  DiffGroupSamplesResponseSchema,
  ImportTraceRequestSchema,
  ImportTraceResponseSchema,
  ListAdoptionGroupsResponseSchema,
  ListChangeReviewsResponseSchema,
  ListConformanceFindingsResponseSchema,
  ListDiffGroupsResponseSchema,
  ListPoliciesResponseSchema,
  ListPolicyVersionsResponseSchema,
  ListReviewAdoptionGroupsResponseSchema,
  ListReviewDiffGroupsResponseSchema,
  PolicyActivationResponseSchema,
  PolicyVersionResponseSchema,
  ReclassifyActionsRequestSchema,
  ReclassifyActionsResponseSchema,
  RecordVerdictRequestSchema,
  ReplayRunResponseSchema,
  UpdatePolicyVersionRequestSchema,
  ValidatePolicyVersionResponseSchema,
  VerdictResponseSchema,
} from './schema.ts';

/**
 * The single source for the V1 HTTP surface: every route's method, path, and
 * request/response DTO in one table so `apps/web` never restates a path or a
 * schema. Each `path` is a template whose `:param` segments the caller fills.
 *
 * Every route here except the change-review routes is registered by
 * `apps/server` today; the change-review routes carry the frozen contract DTOs
 * and gain their server wiring when the change-review endpoints are added.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT';

export interface RouteDef<Res, Req> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly request: z.ZodType<Req> | null;
  readonly response: z.ZodType<Res>;
}

export type ResponseOf<R> = R extends RouteDef<infer Res, unknown> ? Res : never;
export type RequestOf<R> = R extends RouteDef<unknown, infer Req> ? Req : never;

function get<Res>(path: string, response: z.ZodType<Res>): RouteDef<Res, never> {
  return { method: 'GET', path, request: null, response };
}

function post<Req, Res>(
  path: string,
  request: z.ZodType<Req>,
  response: z.ZodType<Res>,
): RouteDef<Res, Req> {
  return { method: 'POST', path, request, response };
}

function postNoBody<Res>(path: string, response: z.ZodType<Res>): RouteDef<Res, never> {
  return { method: 'POST', path, request: null, response };
}

function put<Req, Res>(
  path: string,
  request: z.ZodType<Req>,
  response: z.ZodType<Res>,
): RouteDef<Res, Req> {
  return { method: 'PUT', path, request, response };
}

const API = '/api/v1';

export const routes = {
  importTrace: post(`${API}/trace-imports`, ImportTraceRequestSchema, ImportTraceResponseSchema),
  createRuntimeObservations: post(
    `${API}/runtime-observations`,
    CreateRuntimeObservationsRequestSchema,
    CreateRuntimeObservationsResponseSchema,
  ),
  reclassifyActions: post(
    `${API}/actions/reclassify`,
    ReclassifyActionsRequestSchema,
    ReclassifyActionsResponseSchema,
  ),
  getAction: get(`${API}/actions/:actionKey`, ActionResponseSchema),
  getActivityOverview: get(`${API}/activity-overview`, ActivityOverviewResponseSchema),

  listPolicies: get(`${API}/policies`, ListPoliciesResponseSchema),
  createPolicy: post(`${API}/policies`, CreatePolicyRequestSchema, CreatePolicyResponseSchema),
  listPolicyVersions: get(`${API}/policies/:policyId/versions`, ListPolicyVersionsResponseSchema),
  createPolicyVersion: post(
    `${API}/policies/:policyId/versions`,
    CreatePolicyVersionRequestSchema,
    PolicyVersionResponseSchema,
  ),
  getPolicyVersion: get(`${API}/policy-versions/:id`, PolicyVersionResponseSchema),
  updatePolicyVersion: put(
    `${API}/policy-versions/:id`,
    UpdatePolicyVersionRequestSchema,
    PolicyVersionResponseSchema,
  ),
  validatePolicyVersion: postNoBody(
    `${API}/policy-versions/:id/validations`,
    ValidatePolicyVersionResponseSchema,
  ),
  createPolicyActivation: post(
    `${API}/policy-versions/:id/activations`,
    CreatePolicyActivationRequestSchema,
    PolicyActivationResponseSchema,
  ),

  createReplayRun: post(
    `${API}/replay-runs`,
    CreateReplayRunRequestSchema,
    ReplayRunResponseSchema,
  ),
  getReplayRun: get(`${API}/replay-runs/:id`, ReplayRunResponseSchema),
  listReplayDiffGroups: get(`${API}/replay-runs/:id/diff-groups`, ListDiffGroupsResponseSchema),
  getDiffGroupSamples: get(
    `${API}/diff-groups/:runId/:groupKey/samples`,
    DiffGroupSamplesResponseSchema,
  ),
  listReplayAdoptionGroups: get(
    `${API}/replay-runs/:id/adoption-groups`,
    ListAdoptionGroupsResponseSchema,
  ),
  getAdoptionGroupSamples: get(
    `${API}/adoption-groups/:runId/:groupKey/samples`,
    AdoptionGroupSamplesResponseSchema,
  ),
  getAuthorityMap: get(`${API}/authority-map`, AuthorityMapResponseSchema),
  listConformanceFindings: get(
    `${API}/conformance-findings`,
    ListConformanceFindingsResponseSchema,
  ),
  acknowledgeConformanceFinding: put(
    `${API}/conformance-findings/:id`,
    AcknowledgeConformanceFindingRequestSchema,
    ConformanceFindingResponseSchema,
  ),
  createPolicyDraftFromFinding: post(
    `${API}/conformance-findings/:id/policy-drafts`,
    CreatePolicyDraftFromFindingRequestSchema,
    PolicyVersionResponseSchema,
  ),

  createChangeReview: post(
    `${API}/change-reviews`,
    CreateChangeReviewRequestSchema,
    ChangeReviewResponseSchema,
  ),
  listChangeReviews: get(`${API}/change-reviews`, ListChangeReviewsResponseSchema),
  getChangeReview: get(`${API}/change-reviews/:id`, ChangeReviewResponseSchema),
  listReviewDiffGroups: get(
    `${API}/change-reviews/:id/diff-groups`,
    ListReviewDiffGroupsResponseSchema,
  ),
  listReviewAdoptionGroups: get(
    `${API}/change-reviews/:id/adoption-groups`,
    ListReviewAdoptionGroupsResponseSchema,
  ),
  recordVerdict: put(
    `${API}/change-reviews/:id/verdicts/:groupKey`,
    RecordVerdictRequestSchema,
    VerdictResponseSchema,
  ),
  decideChangeReview: post(
    `${API}/change-reviews/:id/decisions`,
    CreateDecisionRequestSchema,
    ChangeReviewResponseSchema,
  ),
  withdrawChangeReview: postNoBody(
    `${API}/change-reviews/:id/withdrawals`,
    ChangeReviewResponseSchema,
  ),
  getChangeReviewReport: get(`${API}/change-reviews/:id/report`, ChangeReviewReportResponseSchema),
} as const;

export type Routes = typeof routes;
export type RouteName = keyof Routes;
