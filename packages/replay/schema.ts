import { z } from 'zod';
import { EffectSchema, IsoTimestampSchema, Sha256Schema } from '@authority/kernel';
import { CapabilitySchema } from '@authority/action/schema';
import type { Target } from '@authority/action/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import { ZoneSchema } from '@authority/policy/schema';
import type { PolicyDocument } from '@authority/policy/schema';

const TransitionSchema = z.object({
  from: EffectSchema,
  to: EffectSchema,
  count: z.number().int().nonnegative(),
});

export const ReplayStatsSchema = z.object({
  totalActions: z.number().int().nonnegative(),
  evaluatedActions: z.number().int().nonnegative(),
  excludedActions: z.number().int().nonnegative(),
  changedActions: z.number().int().nonnegative(),
  transitions: z.array(TransitionSchema).length(9),
});
export type ReplayStats = z.infer<typeof ReplayStatsSchema>;

const TargetSummaryItemSchema = z.object({
  key: z.string(),
  count: z.number().int().positive(),
});

export const DiffGroupSchema = z.object({
  groupKey: Sha256Schema,
  direction: z.enum(['widening', 'narrowing']),
  fromEffect: EffectSchema,
  toEffect: EffectSchema,
  capability: CapabilitySchema,
  fromZone: ZoneSchema,
  toZone: ZoneSchema,
  program: z.string().nullable(),
  severity: z.enum(['critical', 'normal']),
  actionCount: z.number().int().positive(),
  sessionCount: z.number().int().positive(),
  analyzabilityNoneCount: z.number().int().nonnegative(),
  firstOccurredAt: IsoTimestampSchema,
  lastOccurredAt: IsoTimestampSchema,
  baselineRuleIds: z.array(z.string()),
  candidateRuleIds: z.array(z.string()),
  targetSummary: z.array(TargetSummaryItemSchema).max(5),
  headline: z.string(),
  sampleActionKeys: z.array(Sha256Schema).max(10),
});
export type DiffGroup = z.infer<typeof DiffGroupSchema>;

const ChangedActionSchema = z.object({
  actionKey: Sha256Schema,
  groupKey: Sha256Schema,
  fromEffect: EffectSchema,
  toEffect: EffectSchema,
});

export const DiffResultSchema = z.object({
  stats: ReplayStatsSchema,
  groups: z.array(DiffGroupSchema),
  changedActions: z.array(ChangedActionSchema),
  resultHash: Sha256Schema,
});
export type DiffResult = z.infer<typeof DiffResultSchema>;

/**
 * Derives the Target Summary key for a signature Operation.
 *
 * - workspace path: `workspace`
 * - other path: the first two normalized segments, or all available segments
 * - host: the classifier-normalized host unchanged
 * - VCS remote: remoteKey, otherwise remoteName, otherwise `unknown`
 * - package: `ecosystem:source`, or just `ecosystem` without a source
 * - MCP: `mcp:server`
 * - deploy target: label, or `unknown`
 * - unknown: `unknown`
 *
 * This mapping may be adjusted without an ACR until the diff review verdict.
 * Such a change must state the before/after group counts and reason in its PR.
 * After that verdict, the normal schema contract ACR rule applies.
 */
export type DeriveTargetKey = (target: Target) => string;

/**
 * Computes the deterministic diff between two Policy Documents.
 *
 * Duplicate actionKeys are an invariant failure; ComputeDiff never silently
 * merges them. An upstream multi-Session consumer must deduplicate first.
 *
 * ReplayStats.totalActions is the input length. excludedActions counts Actions
 * with no Operations, evaluatedActions equals totalActions minus
 * excludedActions, and changedActions counts evaluated Actions whose Effects
 * differ. The sum of all nine transition counts equals evaluatedActions.
 *
 * For each changed Action, the signature Operation is selected among
 * Operations whose baseline and candidate Effects differ. For widening,
 * choose the Operation with the most restrictive baseline Effect; for
 * narrowing, choose the most restrictive candidate Effect. Ties use the
 * smallest Operation index. Operations are ordered by index.
 *
 * The group signature is
 * `[fromEffect, toEffect, capability, fromZone, toZone, program]` from that
 * Operation. `groupKey = sha256Hex(canonicalJson(signature))`. Whether
 * `program` belongs in this signature may be adjusted without an ACR until
 * the diff review verdict, provided the PR records before/after group counts
 * and the reason; afterward the normal schema contract ACR rule applies.
 *
 * A widening group is critical when the signature Operation's baseline Zone
 * is credentials, agent_config, protected, public_remote, or unknown_remote;
 * its baseline Reversibility is irreversible; or its Analyzability is none.
 *
 * `baselineRuleIds` and `candidateRuleIds` contain the non-null
 * decidingRuleId from each Action's signature Operation on that side, with
 * duplicates removed and ascending UTF-16 code-unit order. When multiple
 * Rules produce the same Effect, decidingRuleId is the first ruleId in that
 * order; sample detail uses Decision.matchedRuleIds for all matches.
 *
 * Target Summary keys come from the signature Operation. Entries sort by
 * descending count, then ascending key, and are truncated to five.
 * sampleActionKeys sort Actions by occurredAt then actionKey, both ascending;
 * they contain the first five and last five Actions, or all when at most ten.
 * firstOccurredAt and lastOccurredAt are the string minimum and maximum.
 * sessionCount is the distinct sessionExternalId count.
 *
 * Transitions always contain all nine Effect pairs, including zero counts,
 * ordered by `allow`, `ask`, `deny` for `from` and then the same order for
 * `to`. Same-Effect cells count unchanged Actions. Groups sort by groupKey
 * and changedActions by actionKey, both ascending UTF-16 code-unit order.
 *
 * `resultHash = sha256Hex(canonicalJson({ stats, groups, changedActions }))`
 * over those sorted values, except each Group's headline is omitted from the
 * hashed projection. Target Summary remains in the hash.
 */
export type ComputeDiff = (input: {
  readonly actions: readonly ActionForReplay[];
  readonly baseline: PolicyDocument;
  readonly candidate: PolicyDocument;
}) => DiffResult;
