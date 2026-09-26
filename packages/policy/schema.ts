import { z } from 'zod';
import { EffectSchema, IsoTimestampSchema, Sha256Schema, prefixedId } from '@authority/kernel';
import { AnalyzabilitySchema, CapabilitySchema } from '@authority/action/schema';
import type { Operation } from '@authority/action/schema';

export const ZoneSchema = z.enum([
  'workspace',
  'host',
  'credentials',
  'agent_config',
  'trusted_remote',
  'public_remote',
  'unknown_remote',
  'protected',
]);
export type Zone = z.infer<typeof ZoneSchema>;

export const ReversibilitySchema = z.enum(['reversible', 'recoverable', 'irreversible']);
export type Reversibility = z.infer<typeof ReversibilitySchema>;

export const RuleMatchSchema = z.object({
  capabilities: z.union([z.literal('*'), z.array(CapabilitySchema).min(1)]),
  zones: z.union([z.literal('*'), z.array(ZoneSchema).min(1)]),
  reversibility: z.array(ReversibilitySchema).min(1).nullable(),
  analyzability: z.array(AnalyzabilitySchema).min(1).nullable(),
});
export type RuleMatch = z.infer<typeof RuleMatchSchema>;

export const PolicyRuleV1Schema = z.object({
  ruleId: z.string().regex(/^[a-z][a-z0-9_]{2,48}$/),
  match: RuleMatchSchema,
  effect: EffectSchema,
  rationale: z.string().min(10).max(500),
});
export type PolicyRuleV1 = z.infer<typeof PolicyRuleV1Schema>;

export const MandateExceptionSchema = z.object({
  clause: z.string().min(10).max(300),
});
export type MandateException = z.infer<typeof MandateExceptionSchema>;

export const PolicyRuleV2Schema = PolicyRuleV1Schema.extend({
  mandateException: MandateExceptionSchema.nullable(),
}).refine((rule) => rule.mandateException === null || rule.effect === 'ask', {
  message: 'mandateException is allowed only when effect is ask',
  path: ['mandateException'],
});
export type PolicyRuleV2 = z.infer<typeof PolicyRuleV2Schema>;

export type PolicyRule = PolicyRuleV1 | PolicyRuleV2;

export const EnvironmentProfileSchema = z.object({
  credentialPaths: z.array(z.string()),
  agentConfigPaths: z.array(z.string()),
  trustedRemotes: z.array(z.string()),
  publicRemotes: z.array(z.string()),
  protectedBranches: z.array(z.string()),
  productionMarkers: z.array(z.string()),
});
export type EnvironmentProfile = z.infer<typeof EnvironmentProfileSchema>;

/** A schemaVersion 1 document has no Mandate Exception; stored ones are never rewritten, only upgraded into a new draft. */
export const PolicyDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  environment: EnvironmentProfileSchema,
  rules: z.array(PolicyRuleV1Schema).max(200),
});
export type PolicyDocumentV1 = z.infer<typeof PolicyDocumentV1Schema>;

export const PolicyDocumentV2Schema = z.object({
  schemaVersion: z.literal(2),
  environment: EnvironmentProfileSchema,
  rules: z.array(PolicyRuleV2Schema).max(200),
});
export type PolicyDocumentV2 = z.infer<typeof PolicyDocumentV2Schema>;

export const PolicyDocumentSchema = z.discriminatedUnion('schemaVersion', [
  PolicyDocumentV1Schema,
  PolicyDocumentV2Schema,
]);
export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;

/**
 * `isMandateDependent` is recorded on the Decision only: it never enters
 * `resultHash`, a Diff Group, an Adoption Group, or the Gate.
 */
export const OperationDecisionSchema = z.object({
  operationIndex: z.number().int().nonnegative(),
  zone: ZoneSchema,
  reversibility: ReversibilitySchema,
  matchedRuleIds: z.array(z.string()),
  decidingRuleId: z.string().nullable(),
  effect: EffectSchema,
  isMandateDependent: z.boolean(),
});
export type OperationDecision = z.infer<typeof OperationDecisionSchema>;

export const DecisionSchema = z.object({
  effect: EffectSchema,
  decidingOperationIndex: z.number().int().nonnegative(),
  isMandateDependent: z.boolean(),
  operations: z.array(OperationDecisionSchema).min(1),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const PolicyIssueSchema = z.object({
  ruleId: z.string().nullable(),
  code: z.string(),
  message: z.string(),
});
export type PolicyIssue = z.infer<typeof PolicyIssueSchema>;

/**
 * Resolves the first matching Zone for an Operation.
 *
 * credentialPaths, agentConfigPaths, trustedRemotes, publicRemotes, and
 * protectedBranches use this whole-value glob syntax: `**` matches any string
 * including `/`; `*` matches any string except `/`; `?` matches one character
 * except `/`; every other character is literal. Path matching is
 * case-sensitive. Remote patterns and values are lowercased before matching.
 * No glob library defines or implements this syntax.
 *
 * productionMarkers are flagless RegExp source strings and are tested only
 * against the fragment of an Operation whose capability is deploy. An invalid
 * RegExp is reported by ValidatePolicyDocument.
 *
 * trustedRemotes and publicRemotes match these values: a vcs_remote remoteKey,
 * host host, package source, `mcp:<server>` for mcp, or deploy_target label. A
 * null value never matches.
 *
 * The first matching condition wins:
 *
 * 1. credentials: a path matches credentialPaths.
 * 2. agent_config: a path matches agentConfigPaths.
 * 3. protected: a vcs_remote branch matches protectedBranches, or a deploy
 *    Operation fragment matches productionMarkers.
 * 4. workspace: the target is a path inside the workspace.
 * 5. host: any other path, or an unknown target with capability read, write,
 *    delete, execute, or commit.
 * 6. public_remote: the remote comparison value matches publicRemotes.
 * 7. trusted_remote: that value matches trustedRemotes.
 * 8. unknown_remote: every remaining target, including an unknown target with
 *    capability fetch, send, push, install, deploy, or rewrite.
 */
export type ResolveZone = (operation: Operation, environment: EnvironmentProfile) => Zone;

/**
 * Evaluates an Action independently of Rule order.
 *
 * Effects use `deny > ask > allow`; no matching Rule yields `ask`. An empty
 * Operation list is excluded and yields null. A Mandate Exception is not
 * evaluated: an Operation is Mandate-dependent when its Effect is `ask` and
 * every matched `ask` Rule has one, and an Action when every `ask` Operation is.
 *
 * A Rule matches only when its capabilities, zones, reversibility, and
 * analyzability conditions all match. `*` and null mean no condition.
 * Reversibility is derived from capability and resolved Zone using the table
 * in docs/design.md section 13.4. matchedRuleIds are in ascending UTF-16
 * code-unit order. Within one Effect, decidingRuleId is the first matched
 * ruleId. decidingOperationIndex is the smallest index among Operations with
 * the Action's most restrictive Effect.
 */
export type EvaluateAction = (
  operations: readonly Operation[],
  document: PolicyDocument,
) => Decision | null;

export type ValidatePolicyDocument = (document: PolicyDocument) => readonly PolicyIssue[];

export const PolicyIdSchema = prefixedId('pol', 'PolicyId');
export type PolicyId = z.infer<typeof PolicyIdSchema>;

export const PolicySchema = z.object({
  id: PolicyIdSchema,
  name: z.string().min(1),
  createdAt: IsoTimestampSchema,
});
export type Policy = z.infer<typeof PolicySchema>;

export const PolicyVersionIdSchema = prefixedId('pver', 'PolicyVersionId');
export type PolicyVersionId = z.infer<typeof PolicyVersionIdSchema>;

export const PolicyVersionStatusSchema = z.enum(['draft', 'in_review', 'accepted', 'rejected']);
export type PolicyVersionStatus = z.infer<typeof PolicyVersionStatusSchema>;

/**
 * A stored Policy Version. `document` is mutable only while `status` is
 * `draft`; the repository guards updates with `content_hash` (docs/design.md
 * section 25). `contentHash` is the sha256 of the canonical document.
 */
export const PolicyVersionSchema = z.object({
  id: PolicyVersionIdSchema,
  policyId: PolicyIdSchema,
  versionNumber: z.number().int().positive(),
  status: PolicyVersionStatusSchema,
  document: PolicyDocumentSchema,
  contentHash: Sha256Schema,
  baseVersionId: PolicyVersionIdSchema.nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

export const PolicyActivationIdSchema = prefixedId('pact', 'PolicyActivationId');
export type PolicyActivationId = z.infer<typeof PolicyActivationIdSchema>;

/**
 * A recorded declaration that an operator applied an accepted Policy Version
 * outside Authority Diff. It is append-only and changes nothing else: the
 * version's status, replay, conformance, and evaluation ignore it, and nothing
 * reads it as the active or enforced version.
 */
export const PolicyActivationSchema = z.object({
  id: PolicyActivationIdSchema,
  policyVersionId: PolicyVersionIdSchema,
  reason: z.string().min(1),
  actorName: z.string().min(1),
  createdAt: IsoTimestampSchema,
});
export type PolicyActivation = z.infer<typeof PolicyActivationSchema>;

export const UnmappedRuleReasonSchema = z.enum([
  'mandate_exception',
  'zone_not_expressible',
  'capability_not_expressible',
  'reversibility_condition',
  'analyzability_condition',
  'vendor_semantics_differ',
]);
export type UnmappedRuleReason = z.infer<typeof UnmappedRuleReasonSchema>;

/**
 * A Claude Code settings fragment for reference: Authority Diff does not deploy
 * or enforce it. The permission lists are always empty and every Rule is in
 * `unmappedRules`, because no Claude Code form has the same meaning (ACR-0018).
 */
export const ClaudeCodeSettingsExportSchema = z.object({
  notice: z.string(),
  settings: z.object({
    permissions: z.object({
      allow: z.array(z.string()),
      ask: z.array(z.string()),
      deny: z.array(z.string()),
    }),
  }),
  unmappedRules: z.array(z.object({ ruleId: z.string(), reason: UnmappedRuleReasonSchema })),
});
export type ClaudeCodeSettingsExport = z.infer<typeof ClaudeCodeSettingsExportSchema>;
