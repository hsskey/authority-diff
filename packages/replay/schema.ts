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

const OperationWideningSchema = z.object({
  capability: CapabilitySchema,
  fromZone: ZoneSchema,
  toZone: ZoneSchema,
  count: z.number().int().positive(),
});

/**
 * One capability x zone x effect cell of a candidate Policy Version's authority
 * map: each evaluated Action counted once under its deciding Operation.
 */
export const AuthorityMapCellSchema = z.object({
  capability: CapabilitySchema,
  zone: ZoneSchema,
  effect: EffectSchema,
  count: z.number().int().nonnegative(),
});
export type AuthorityMapCell = z.infer<typeof AuthorityMapCellSchema>;

/**
 * Evaluated Action counts by analyzability (cutline.md 11: full / partial /
 * none; an Action's analyzability is the worst of its Operations').
 */
export const AnalyzabilityCountsSchema = z.object({
  full: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  none: z.number().int().nonnegative(),
});
export type AnalyzabilityCounts = z.infer<typeof AnalyzabilityCountsSchema>;

/**
 * A conformance run's Actions counted by the runtime permission mode their
 * observations carried: `actionCount` is every Action of the run in that
 * mode, and `findingCount` those of them inside a Conformance Finding. An
 * Action whose observations carry no mode, or that has no observation, counts
 * under `unknown`.
 */
export const PermissionModeCountSchema = z.object({
  permissionMode: z.string().min(1),
  actionCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
});
export type PermissionModeCount = z.infer<typeof PermissionModeCountSchema>;

export const UNKNOWN_PERMISSION_MODE = 'unknown';

/**
 * The permission modes in which the runtime runs an Action without asking, so
 * Actions observed in them are workload that could run without a guard.
 */
export const UNGUARDED_PERMISSION_MODES: readonly string[] = ['bypassPermissions', 'auto'];

/**
 * `byPermissionMode` is set by conformance runs only, sorted by permissionMode
 * ascending UTF-16; a version_diff run has no observations and omits it.
 */
export const ReplayStatsSchema = z.object({
  totalActions: z.number().int().nonnegative(),
  evaluatedActions: z.number().int().nonnegative(),
  excludedActions: z.number().int().nonnegative(),
  changedActions: z.number().int().nonnegative(),
  transitions: z.array(TransitionSchema).length(9),
  operationWidening: z.array(OperationWideningSchema).default([]),
  byPermissionMode: z.array(PermissionModeCountSchema).optional(),
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

/** Only `ask` and `deny` Actions form Adoption Groups; `allow` is stats only. */
export const AdoptionEffectSchema = z.enum(['ask', 'deny']);
export type AdoptionEffect = z.infer<typeof AdoptionEffectSchema>;

export const AdoptionStatsSchema = z.object({
  totalActions: z.number().int().nonnegative(),
  evaluatedActions: z.number().int().nonnegative(),
  excludedActions: z.number().int().nonnegative(),
  effectCounts: z.object({
    allow: z.number().int().nonnegative(),
    ask: z.number().int().nonnegative(),
    deny: z.number().int().nonnegative(),
  }),
  analyzability: AnalyzabilityCountsSchema,
  cells: z.array(AuthorityMapCellSchema),
});
export type AdoptionStats = z.infer<typeof AdoptionStatsSchema>;

const ProgramSummaryItemSchema = z.object({
  program: z.string().nullable(),
  count: z.number().int().positive(),
});

/**
 * An Adoption Group: the `ask` or `deny` Actions a candidate Policy Version
 * gives the same Effect for the same Capability and Zone. `program` is always
 * null: the signature carries no program (ADR-0010), and the program mix is
 * reported inside the group by `programSummary` and `distinctProgramCount`.
 */
export const AdoptionGroupSchema = z.object({
  groupKey: Sha256Schema,
  effect: AdoptionEffectSchema,
  capability: CapabilitySchema,
  zone: ZoneSchema,
  program: z.null(),
  programSummary: z.array(ProgramSummaryItemSchema).max(10),
  distinctProgramCount: z.number().int().positive(),
  actionCount: z.number().int().positive(),
  sessionCount: z.number().int().positive(),
  analyzabilityNoneCount: z.number().int().nonnegative(),
  firstOccurredAt: IsoTimestampSchema,
  lastOccurredAt: IsoTimestampSchema,
  decidingRuleIds: z.array(z.string()),
  targetSummary: z.array(TargetSummaryItemSchema).max(5),
  headline: z.string(),
  sampleActionKeys: z.array(Sha256Schema).max(10),
});
export type AdoptionGroup = z.infer<typeof AdoptionGroupSchema>;

/** One `ask` or `deny` Action's membership in its Adoption Group. */
export const AdoptionAssignmentSchema = z.object({
  actionKey: Sha256Schema,
  groupKey: Sha256Schema,
  effect: AdoptionEffectSchema,
});
export type AdoptionAssignment = z.infer<typeof AdoptionAssignmentSchema>;

export const AdoptionResultSchema = z.object({
  stats: AdoptionStatsSchema,
  groups: z.array(AdoptionGroupSchema),
  assignments: z.array(AdoptionAssignmentSchema),
  resultHash: Sha256Schema,
});
export type AdoptionResult = z.infer<typeof AdoptionResultSchema>;

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
 * operationWidening counts Operations whose Effect widened while their Action's
 * Effect stayed the same. Each row is `{capability, fromZone, toZone, count}`.
 * Rows sort by capability, fromZone, then toZone, all ascending UTF-16.
 * Diff Groups and Verdicts stay Action-level.
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

/**
 * Applies one candidate Policy Document to past Actions with no baseline: the
 * Initial Adoption preview. It never reads observedOutcome and restores no past
 * approval; each Action's Effect is the candidate Decision alone.
 *
 * Duplicate actionKeys are an invariant failure, as in ComputeDiff.
 *
 * AdoptionStats.totalActions is the input length; excludedActions counts
 * Actions with no Operations, and evaluatedActions the rest. effectCounts
 * tallies evaluated Actions by their Action Effect and sums to
 * evaluatedActions. analyzability and cells reuse the authority-map counts
 * (buildAnalyzabilityCounts, buildMatrix) over the same evaluated Actions.
 *
 * Only `ask` and `deny` Actions are grouped. The signature Operation is the
 * Decision's decidingOperationIndex: the lowest-index Operation carrying the
 * Action's Effect. The group signature is `[effect, capability, zone]` of that
 * Operation and `groupKey = sha256Hex(canonicalJson(signature))`; program is
 * not part of it (ADR-0010). programSummary holds the top ten programs of the
 * signature Operations by descending count then ascending program, a null
 * program first; distinctProgramCount counts distinct program values, null
 * included. decidingRuleIds, targetSummary, sampleActionKeys, sessionCount,
 * firstOccurredAt, and lastOccurredAt follow the ComputeDiff rules. There is
 * no severity.
 *
 * The Headline is `<zone>에서의 <capability> N건이 이 정책에서 '<effect>'
 * 대상이 됩니다.` in plain Korean, with no command text, ruleId, or regular
 * expression.
 *
 * `groups` are in review order: deny before ask, then actionCount descending,
 * sessionCount descending, and groupKey ascending. `assignments` hold every
 * grouped Action's (actionKey, groupKey, effect) sorted by actionKey.
 *
 * `resultHash = sha256Hex(canonicalJson({ stats, groups, assignments }))` with
 * groups projected without headline and sorted by groupKey; programSummary and
 * distinctProgramCount stay in the hash.
 */
export type ComputeAdoption = (input: {
  readonly actions: readonly ActionForReplay[];
  readonly candidate: PolicyDocument;
}) => AdoptionResult;

export const ReplayRunIdSchema = prefixedId('rpl', 'ReplayRunId');
export type ReplayRunId = z.infer<typeof ReplayRunIdSchema>;

export const ReplayRunStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type ReplayRunStatus = z.infer<typeof ReplayRunStatusSchema>;

/**
 * `version_diff` compares two Policy Versions. `conformance` compares the
 * `observed_runtime` Decision Source, the Disposition the runtime showed, as
 * the baseline against a candidate Policy Version. `adoption` applies one
 * candidate Policy Version with no baseline: the Initial Adoption preview.
 */
export const ReplayRunKindSchema = z.enum(['version_diff', 'conformance', 'adoption']);
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

const replayRunShape = {
  candidateVersionId: PolicyVersionIdSchema,
  windowFrom: IsoTimestampSchema,
  windowTo: IsoTimestampSchema,
  status: ReplayRunStatusSchema,
  classifierVersion: z.string(),
  inputsHash: Sha256Schema,
  resultHash: Sha256Schema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  startedAt: IsoTimestampSchema.nullable(),
  completedAt: IsoTimestampSchema.nullable(),
};

/**
 * A stored replay run. `inputsHash` is the natural idempotency key over
 * (baseline, candidate, window, classifierVersion); a second request with the
 * same hash returns the completed run instead of starting another. `resultHash`
 * and `stats` are null until the run completes; `errorCode` is set on failure.
 * `baselineVersionId` is null exactly when `kind` is `conformance` or
 * `adoption`. `stats` is ReplayStats for `version_diff` and `conformance` and
 * AdoptionStats for `adoption`; rows stored before `adoption` existed parse
 * unchanged.
 */
export const ReplayRunSchema = z.discriminatedUnion('kind', [
  z.object({
    id: ReplayRunIdSchema,
    kind: z.literal('version_diff'),
    baselineVersionId: PolicyVersionIdSchema,
    ...replayRunShape,
    stats: ReplayStatsSchema.nullable(),
  }),
  z.object({
    id: ReplayRunIdSchema,
    kind: z.literal('conformance'),
    baselineVersionId: z.null(),
    ...replayRunShape,
    stats: ReplayStatsSchema.nullable(),
  }),
  z.object({
    id: ReplayRunIdSchema,
    kind: z.literal('adoption'),
    baselineVersionId: z.null(),
    ...replayRunShape,
    stats: AdoptionStatsSchema.nullable(),
  }),
]);
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

/**
 * The stored Adoption Group is the computed group tied to its run. `position`
 * is the group's index in the run's review order, the order the listing
 * returns.
 */
export const StoredAdoptionGroupSchema = AdoptionGroupSchema.extend({
  replayRunId: ReplayRunIdSchema,
  position: z.number().int().nonnegative(),
});
export type StoredAdoptionGroup = z.infer<typeof StoredAdoptionGroupSchema>;

/** One grouped Action's assignment within a stored adoption run. */
export const StoredAdoptionAssignmentSchema = AdoptionAssignmentSchema.extend({
  replayRunId: ReplayRunIdSchema,
});
export type StoredAdoptionAssignment = z.infer<typeof StoredAdoptionAssignmentSchema>;
