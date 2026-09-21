import { z } from 'zod';
import { EffectSchema } from '@authority/kernel';
import { AnalyzabilitySchema, CapabilitySchema } from '@authority/action/schema';
import type { Capability, Operation, Target } from '@authority/action/schema';

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
 * Resolves the first matching Zone in this order: credentials, agent_config,
 * protected, workspace, host, public_remote, trusted_remote, unknown_remote.
 * Public remotes are checked before trusted remotes.
 */
export type ResolveZone = (
  target: Target,
  capability: Capability,
  environment: EnvironmentProfile,
) => Zone;

/**
 * Evaluates an Action independently of Rule order.
 *
 * Effects use `deny > ask > allow`; no matching Rule yields `ask`. An empty
 * Operation list is excluded and yields null. Within one Effect, the deciding
 * Rule is the first ruleId in ascending UTF-16 code-unit order.
 */
export type EvaluateAction = (
  operations: readonly Operation[],
  document: PolicyDocument,
) => Decision | null;

export type ValidatePolicyDocument = (document: PolicyDocument) => readonly PolicyIssue[];
