import { z } from 'zod';
import { EffectSchema, IsoTimestampSchema, Sha256Schema, prefixedId } from '@authority/kernel';
import { CapabilitySchema } from '@authority/action/schema';
import type { Target } from '@authority/action/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import { PolicyVersionIdSchema, ZoneSchema } from '@authority/policy/schema';
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

export const ReplayRunIdSchema = prefixedId('rpl', 'ReplayRunId');
export type ReplayRunId = z.infer<typeof ReplayRunIdSchema>;

export const ReplayRunStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type ReplayRunStatus = z.infer<typeof ReplayRunStatusSchema>;

/**
 * `version_diff` compares two Policy Versions. `conformance` compares the
 * `observed_runtime` Decision Source, the Disposition the runtime showed, as
 * the baseline against a candidate Policy Version.
 */
export const ReplayRunKindSchema = z.enum(['version_diff', 'conformance']);
export type ReplayRunKind = z.infer<typeof ReplayRunKindSchema>;

export const DispositionSchema = z.enum([
  'auto_executed',
  'prompted',
  'hook_approved',
  'blocked',
  'executed_prompt_unknown',
]);
export type Disposition = z.infer<typeof DispositionSchema>;

export const ConformanceFindingKindSchema = z.enum(['violation', 'under_asked', 'over_asked']);
export type ConformanceFindingKind = z.infer<typeof ConformanceFindingKindSchema>;

/**
 * A stored replay run. `inputsHash` is the natural idempotency key over
 * (baseline, candidate, window, classifierVersion); a second request with the
 * same hash returns the completed run instead of starting another. `resultHash`
 * and `stats` are null until the run completes; `errorCode` is set on failure.
 * `baselineVersionId` is null exactly when `kind` is `conformance`.
 */
export const ReplayRunSchema = z.object({
  id: ReplayRunIdSchema,
  kind: ReplayRunKindSchema,
  baselineVersionId: PolicyVersionIdSchema.nullable(),
  candidateVersionId: PolicyVersionIdSchema,
  windowFrom: IsoTimestampSchema,
  windowTo: IsoTimestampSchema,
  status: ReplayRunStatusSchema,
  classifierVersion: z.string(),
  inputsHash: Sha256Schema,
  resultHash: Sha256Schema.nullable(),
  stats: ReplayStatsSchema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  startedAt: IsoTimestampSchema.nullable(),
  completedAt: IsoTimestampSchema.nullable(),
});
export type ReplayRun = z.infer<typeof ReplayRunSchema>;

/** The stored Diff Group is the computed group tied to its run. */
export const StoredDiffGroupSchema = DiffGroupSchema.extend({
  replayRunId: ReplayRunIdSchema,
});
export type StoredDiffGroup = z.infer<typeof StoredDiffGroupSchema>;

/** One changed Action's transition within a stored run and group. */
export const StoredChangedActionSchema = z.object({
  replayRunId: ReplayRunIdSchema,
  actionKey: Sha256Schema,
  groupKey: Sha256Schema,
  fromEffect: EffectSchema,
  toEffect: EffectSchema,
});
export type StoredChangedAction = z.infer<typeof StoredChangedActionSchema>;

/**
 * Actions of a conformance run whose Disposition and candidate Effect disagree,
 * grouped by `[kind, capability, zone, program]` of the signature Operation.
 * `findingKey = sha256Hex(canonicalJson(signature))`.
 */
export const ConformanceFindingSchema = z.object({
  findingKey: Sha256Schema,
  kind: ConformanceFindingKindSchema,
  capability: CapabilitySchema,
  zone: ZoneSchema,
  program: z.string().nullable(),
  actionCount: z.number().int().positive(),
  sessionCount: z.number().int().positive(),
  firstOccurredAt: IsoTimestampSchema,
  lastOccurredAt: IsoTimestampSchema,
  sampleActionKeys: z.array(Sha256Schema).max(10),
});
export type ConformanceFinding = z.infer<typeof ConformanceFindingSchema>;

/** The stored Conformance Finding is the computed finding tied to its run. */
export const StoredConformanceFindingSchema = ConformanceFindingSchema.extend({
  replayRunId: ReplayRunIdSchema,
});
export type StoredConformanceFinding = z.infer<typeof StoredConformanceFindingSchema>;
