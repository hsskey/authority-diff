import { z } from 'zod';
import { IsoTimestampSchema, Sha256Schema, prefixedId } from '@authority/kernel';
import {
  AnalyzabilitySchema,
  CapabilitySchema,
  OperationSchema,
  RuntimeSchema,
  ToolCallSchema,
} from '@authority/action/schema';
import type { Runtime } from '@authority/action/schema';

export const ObservedOutcomeSchema = z.enum([
  'executed',
  'rejected_by_human',
  'blocked_by_runtime',
  'unknown',
]);
export type ObservedOutcome = z.infer<typeof ObservedOutcomeSchema>;

export const ParsedToolCallSchema = ToolCallSchema.extend({
  sequence: z.number().int().nonnegative(),
  isSidechain: z.boolean(),
  observedOutcome: ObservedOutcomeSchema,
  occurredAt: IsoTimestampSchema,
});
export type ParsedToolCall = z.infer<typeof ParsedToolCallSchema>;

const RedactionCountSchema = z.object({
  kind: z.string(),
  count: z.number().int().positive(),
});

export const ParsedSessionSchema = z.object({
  runtime: RuntimeSchema,
  runtimeVersion: z.string().nullable(),
  sessionExternalId: z.string(),
  workspaceRoot: z.string().nullable(),
  gitBranch: z.string().nullable(),
  startedAt: IsoTimestampSchema.nullable(),
  endedAt: IsoTimestampSchema.nullable(),
  toolCalls: z.array(ParsedToolCallSchema),
  totalLineCount: z.number().int().nonnegative(),
  unparsedLineCount: z.number().int().nonnegative(),
  redactions: z.array(RedactionCountSchema),
});
export type ParsedSession = z.infer<typeof ParsedSessionSchema>;

export const ActionForReplaySchema = z.object({
  actionKey: Sha256Schema,
  sessionExternalId: z.string(),
  operations: z.array(OperationSchema),
  observedOutcome: ObservedOutcomeSchema,
  occurredAt: IsoTimestampSchema,
});
export type ActionForReplay = z.infer<typeof ActionForReplaySchema>;

/**
 * Parses in-memory transcript lines without reading a file.
 *
 * Unparseable lines increment `unparsedLineCount` rather than causing
 * failure. A tool_use line without a parseable timestamp is unparseable.
 * `sequence` is the zero-based appearance order of tool_use blocks.
 * `toolInputRedacted` is already redacted.
 *
 * The caller supplies sessionExternalId as the transcript file name stem.
 * Session identifiers inside transcript lines are ignored.
 *
 * Empty optional text becomes null. `runtimeVersion`, `workspaceRoot`, and
 * `gitBranch` use the first observed non-empty value; each ToolCall keeps the
 * workspaceRoot and gitBranch from its own line. repoRemotes is always null
 * because the parser performs no I/O; an I/O-capable caller enriches it before
 * classification. Home path prefixes become `~`. Timestamps are normalized to
 * three millisecond digits. `startedAt` and `endedAt` are the minimum and
 * maximum parsed timestamps, or null when no line has a timestamp. `endedAt`
 * is the last observed line time, not a session-end event. Redactions are
 * sorted by kind and zero counts omitted.
 */
export type ParseTranscript = (input: {
  readonly sessionExternalId: string;
  readonly lines: readonly string[];
}) => ParsedSession;

/**
 * Replaces only literal text; it never removes a line or Action.
 */
export type RedactText = (text: string) => {
  readonly text: string;
  readonly redactions: readonly { readonly kind: string; readonly count: number }[];
};

/**
 * Derives a stable Action Key.
 *
 * With a toolUseId:
 * `sha256Hex(canonicalJson([runtime, toolUseId]))`.
 *
 * Without one:
 * `sha256Hex(canonicalJson([runtime, sessionExternalId, "seq", sequence]))`.
 *
 * ParseTranscript handles one file and does not deduplicate. A consumer
 * combining Sessions keeps the earliest occurredAt for duplicate actionKeys;
 * ties keep the lexicographically first sessionExternalId using ascending
 * UTF-16 code-unit order.
 */
export type DeriveActionKey = (input: {
  readonly runtime: Runtime;
  readonly sessionExternalId: string;
  readonly toolUseId: string | null;
  readonly sequence: number;
}) => z.infer<typeof Sha256Schema>;

const CountSchema = z.number().int().nonnegative();

const CountedProgramSchema = z.object({
  program: z.string(),
  count: z.number().int().positive(),
});

const CountedRemoteKeySchema = z.object({
  remoteKey: z.string(),
  count: z.number().int().positive(),
});

/** A Target's kind as the Activity Overview counts it; a path splits by workspace membership. */
export const TargetKindSchema = z.enum([
  'workspace_path',
  'other_path',
  'vcs_remote',
  'host',
  'package',
  'mcp',
  'deploy_target',
  'unknown',
]);
export type TargetKind = z.infer<typeof TargetKindSchema>;

/**
 * The Activity Overview of a window of imported activity, computed from stored
 * Actions alone. It carries no Effect or Zone: those need a Policy Version and
 * an Environment Profile, which the overview does not assume.
 *
 * `sessionCount` counts distinct Sessions with an Action in the window.
 * `actionCount` counts stored Actions, so duplicates are already collapsed by
 * Action Key. `evaluableActionCount` counts Actions with at least one Operation.
 * `capabilityCounts` and `targetKindCounts` count Operations and carry every
 * key, zero included. `analyzability` counts evaluable Actions by the worst
 * analyzability of their Operations. `topPrograms` holds the twenty most
 * frequent non-null Operation programs and `topRemoteKeys` the twenty most
 * frequent VCS Remote Keys, each by descending count then ascending key.
 */
export const ActivityOverviewSchema = z.object({
  sessionCount: z.number().int().nonnegative(),
  actionCount: z.number().int().nonnegative(),
  evaluableActionCount: z.number().int().nonnegative(),
  capabilityCounts: z.record(CapabilitySchema, CountSchema),
  targetKindCounts: z.record(TargetKindSchema, CountSchema),
  analyzability: z.record(AnalyzabilitySchema, CountSchema),
  topPrograms: z.array(CountedProgramSchema).max(20),
  topRemoteKeys: z.array(CountedRemoteKeySchema).max(20),
});
export type ActivityOverview = z.infer<typeof ActivityOverviewSchema>;

/**
 * Folds the Actions of a window into an Activity Overview. Pure and
 * deterministic: the same Actions in any order give the same overview.
 */
export type BuildActivityOverview = (actions: readonly ActionForReplay[]) => ActivityOverview;

export const TraceImportIdSchema = prefixedId('imp', 'TraceImportId');
export type TraceImportId = z.infer<typeof TraceImportIdSchema>;

export const TraceSourceSchema = z.enum(['transcript', 'hook', 'synthetic']);
export type TraceSource = z.infer<typeof TraceSourceSchema>;

/**
 * A window's Actions counted by the source of their Session's first Trace
 * Import, so a screen or Evidence Report can say whether the records it rests
 * on are real transcripts or synthetic fixtures.
 */
export const TraceSourceCountsSchema = z.object({
  transcript: z.number().int().nonnegative(),
  hook: z.number().int().nonnegative(),
  synthetic: z.number().int().nonnegative(),
});
export type TraceSourceCounts = z.infer<typeof TraceSourceCountsSchema>;

export const TraceImportSchema = z.object({
  id: TraceImportIdSchema,
  runtime: RuntimeSchema,
  source: TraceSourceSchema,
  sessionExternalId: z.string(),
  acceptedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  redactionCount: z.number().int().nonnegative(),
  classifierVersion: z.string(),
  createdAt: IsoTimestampSchema,
});
export type TraceImport = z.infer<typeof TraceImportSchema>;

export const AgentSessionIdSchema = prefixedId('ses', 'AgentSessionId');
export type AgentSessionId = z.infer<typeof AgentSessionIdSchema>;

export const AgentSessionSchema = z.object({
  id: AgentSessionIdSchema,
  runtime: RuntimeSchema,
  runtimeVersion: z.string().nullable(),
  sessionExternalId: z.string(),
  workspaceRoot: z.string().nullable(),
  gitBranch: z.string().nullable(),
  hasHookCoverage: z.boolean(),
  startedAt: IsoTimestampSchema.nullable(),
  endedAt: IsoTimestampSchema.nullable(),
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

/**
 * The stored form of an Action. It extends the pure replay projection with the
 * display and provenance fields the wire and database keep. `actionKey` from
 * ActionForReplay is the primary key; the database drops `toolInputRedacted`
 * after its retention window while the operations remain.
 */
export const StoredAgentActionSchema = ActionForReplaySchema.extend({
  toolName: z.string(),
  toolInputRedacted: z.string().max(16000),
  isInputTruncated: z.boolean(),
  isSidechain: z.boolean(),
  classifierVersion: z.string(),
  recordedAt: IsoTimestampSchema,
});
export type StoredAgentAction = z.infer<typeof StoredAgentActionSchema>;

export const RuntimeObservationEventSchema = z.enum([
  'pre_tool_use',
  'permission_request',
  'session_end',
]);
export type RuntimeObservationEvent = z.infer<typeof RuntimeObservationEventSchema>;

/** The permission decision a hook input carried, when another hook already decided. */
export const HookDecisionSchema = z.enum(['allow', 'deny']);
export type HookDecision = z.infer<typeof HookDecisionSchema>;

/**
 * A runtime hook observation. `observationKey` is the server-derived sha256
 * natural key and makes ingestion idempotent. `actionKey` is server-derived
 * from `toolUseId` with DeriveActionKey, so an observation joins its Action by
 * the same runtime tool use identifier; it is null without a `toolUseId`.
 * `permissionMode` is the runtime permission mode the hook input carried, kept
 * as the runtime reports it.
 * `toolUseId`, `hookDecision`, and `permissionMode` default to null for hook
 * clients that predate them.
 */
export const RuntimeObservationSchema = z.object({
  observationKey: Sha256Schema,
  actionKey: Sha256Schema.nullable(),
  event: RuntimeObservationEventSchema,
  sessionExternalId: z.string(),
  toolUseId: z.string().min(1).nullable().default(null),
  toolName: z.string().nullable(),
  toolInputHash: Sha256Schema.nullable(),
  hookDecision: HookDecisionSchema.nullable().default(null),
  permissionMode: z.string().min(1).nullable().default(null),
  cwd: z.string().nullable(),
  runtimeVersion: z.string().nullable(),
  occurredAt: IsoTimestampSchema,
});
export type RuntimeObservation = z.infer<typeof RuntimeObservationSchema>;

/**
 * The observation fields replay needs to derive a Disposition for an Action.
 * `actionKey` is null for a permission_request, whose hook input carries no
 * `tool_use_id`; replay pairs it with a pre_tool_use by the remaining fields.
 * `permissionMode` is the runtime permission mode the hook input carried, or
 * null when the client predates it.
 */
export const ObservationForReplaySchema = z.object({
  actionKey: Sha256Schema.nullable(),
  event: RuntimeObservationEventSchema,
  sessionExternalId: z.string(),
  toolName: z.string().nullable(),
  toolInputHash: Sha256Schema.nullable(),
  hookDecision: HookDecisionSchema.nullable(),
  permissionMode: z.string().min(1).nullable(),
  occurredAt: IsoTimestampSchema,
});
export type ObservationForReplay = z.infer<typeof ObservationForReplaySchema>;
