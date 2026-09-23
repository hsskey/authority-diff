import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { Operation } from '@authority/action/schema';

export const traceImports = pgTable(
  'trace_imports',
  {
    id: text('id').primaryKey(),
    runtime: text('runtime').notNull(),
    source: text('source').notNull(),
    sessionExternalId: text('session_external_id').notNull(),
    acceptedCount: integer('accepted_count').notNull(),
    duplicateCount: integer('duplicate_count').notNull(),
    rejectedCount: integer('rejected_count').notNull(),
    redactionCount: integer('redaction_count').notNull(),
    classifierVersion: text('classifier_version').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_trace_imports__created_at').on(t.createdAt),
    check('ck_trace_imports__source', sql`${t.source} in ('transcript', 'hook', 'synthetic')`),
  ],
);

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: text('id').primaryKey(),
    runtime: text('runtime').notNull(),
    runtimeVersion: text('runtime_version'),
    sessionExternalId: text('session_external_id').notNull(),
    workspaceRoot: text('workspace_root'),
    gitBranch: text('git_branch'),
    hasHookCoverage: boolean('has_hook_coverage').notNull(),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
  },
  (t) => [
    uniqueIndex('uq_agent_sessions__runtime_session_external_id').on(
      t.runtime,
      t.sessionExternalId,
    ),
  ],
);

export const agentActions = pgTable(
  'agent_actions',
  {
    actionKey: text('action_key').primaryKey(),
    sessionExternalId: text('session_external_id').notNull(),
    operations: jsonb('operations').notNull().$type<Operation[]>(),
    observedOutcome: text('observed_outcome').notNull(),
    occurredAt: text('occurred_at').notNull(),
    toolName: text('tool_name').notNull(),
    toolInputRedacted: text('tool_input_redacted').notNull(),
    isInputTruncated: boolean('is_input_truncated').notNull(),
    isSidechain: boolean('is_sidechain').notNull(),
    classifierVersion: text('classifier_version').notNull(),
    recordedAt: text('recorded_at').notNull(),
  },
  (t) => [
    index('idx_agent_actions__occurred_at_action_key').on(t.occurredAt, t.actionKey),
    index('idx_agent_actions__session_external_id').on(t.sessionExternalId),
    index('idx_agent_actions__classifier_version').on(t.classifierVersion),
  ],
);

export const runtimeObservations = pgTable(
  'runtime_observations',
  {
    observationKey: text('observation_key').primaryKey(),
    actionKey: text('action_key'),
    event: text('event').notNull(),
    sessionExternalId: text('session_external_id').notNull(),
    toolUseId: text('tool_use_id'),
    toolName: text('tool_name'),
    toolInputHash: text('tool_input_hash'),
    hookDecision: text('hook_decision'),
    cwd: text('cwd'),
    runtimeVersion: text('runtime_version'),
    occurredAt: text('occurred_at').notNull(),
  },
  (t) => [
    index('idx_runtime_observations__session_external_id_tool_input_hash').on(
      t.sessionExternalId,
      t.toolInputHash,
    ),
    index('idx_runtime_observations__action_key').on(t.actionKey),
    check(
      'ck_runtime_observations__event',
      sql`${t.event} in ('pre_tool_use', 'permission_request', 'session_end')`,
    ),
    check(
      'ck_runtime_observations__hook_decision',
      sql`${t.hookDecision} is null or ${t.hookDecision} in ('allow', 'deny')`,
    ),
  ],
);
