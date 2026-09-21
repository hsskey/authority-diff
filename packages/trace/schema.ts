import { z } from 'zod';
import { IsoTimestampSchema, Sha256Schema } from '@authority/kernel';
import { OperationSchema, RuntimeSchema, ToolCallSchema } from '@authority/action/schema';
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
 * Empty optional text becomes null. `runtimeVersion`, `workspaceRoot`, and
 * `gitBranch` use the first observed non-empty value; each ToolCall keeps the
 * workspaceRoot and gitBranch from its own line. Home path prefixes become
 * `~`. Timestamps are normalized to three millisecond digits. `startedAt` and
 * `endedAt` are the minimum and maximum parsed timestamps, or null when no
 * line has a timestamp. `endedAt` is the last observed line time, not a
 * session-end event. Redactions are sorted by kind and zero counts omitted.
 */
export type ParseTranscript = (lines: readonly string[]) => ParsedSession;

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
