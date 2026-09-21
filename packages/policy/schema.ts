import { z } from 'zod';
import { EffectSchema } from '@authority/kernel';
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

export const PolicyRuleSchema = z.object({
  ruleId: z.string().regex(/^[a-z][a-z0-9_]{2,48}$/),
  match: RuleMatchSchema,
  effect: EffectSchema,
  rationale: z.string().min(10).max(500),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const EnvironmentProfileSchema = z.object({
  credentialPaths: z.array(z.string()),
  agentConfigPaths: z.array(z.string()),
  trustedRemotes: z.array(z.string()),
  publicRemotes: z.array(z.string()),
  protectedBranches: z.array(z.string()),
  productionMarkers: z.array(z.string()),
});
export type EnvironmentProfile = z.infer<typeof EnvironmentProfileSchema>;

export const PolicyDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  environment: EnvironmentProfileSchema,
  rules: z.array(PolicyRuleSchema).max(200),
});
export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;

export const OperationDecisionSchema = z.object({
  operationIndex: z.number().int().nonnegative(),
  zone: ZoneSchema,
  reversibility: ReversibilitySchema,
  matchedRuleIds: z.array(z.string()),
  decidingRuleId: z.string().nullable(),
  effect: EffectSchema,
});
export type OperationDecision = z.infer<typeof OperationDecisionSchema>;

export const DecisionSchema = z.object({
  effect: EffectSchema,
  decidingOperationIndex: z.number().int().nonnegative(),
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
 * Operation list is excluded and yields null.
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
