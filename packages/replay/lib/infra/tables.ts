import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import type { Effect } from '@authority/kernel';
import type { Capability } from '@authority/action/schema';
import type { Zone } from '@authority/policy/schema';
import type { ConformanceFindingKind, ReplayRunKind, ReplayRunStatus } from '../../schema.ts';
import type { StoredReplayStats } from '../app/ports.ts';

// docs/design.md 25장. IsoTimestamp 문자열을 그대로 보존하려고 시각은 text로 저장한다.
// ISO-Z UTC 문자열은 사전순 정렬이 시간순과 같다.
export const replayRuns = pgTable(
  'replay_runs',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<ReplayRunKind>().notNull().default('version_diff'),
    baselineVersionId: text('baseline_version_id'),
    candidateVersionId: text('candidate_version_id').notNull(),
    windowFrom: text('window_from').notNull(),
    windowTo: text('window_to').notNull(),
    status: text('status').$type<ReplayRunStatus>().notNull(),
    classifierVersion: text('classifier_version').notNull(),
    inputsHash: text('inputs_hash').notNull(),
    resultHash: text('result_hash'),
    stats: jsonb('stats').$type<StoredReplayStats>(),
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (t) => [
    index('idx_replay_runs__inputs_hash').on(t.inputsHash),
    index('idx_replay_runs__status').on(t.status),
    check('ck_replay_runs__kind', sql`${t.kind} in ('version_diff', 'conformance')`),
    check(
      'ck_replay_runs__baseline_version_id',
      sql`(${t.kind} = 'conformance') = (${t.baselineVersionId} is null)`,
    ),
  ],
);

export const replayDiffGroups = pgTable(
  'replay_diff_groups',
  {
    replayRunId: text('replay_run_id').notNull(),
    groupKey: text('group_key').notNull(),
    direction: text('direction').$type<'widening' | 'narrowing'>().notNull(),
    fromEffect: text('from_effect').$type<Effect>().notNull(),
    toEffect: text('to_effect').$type<Effect>().notNull(),
    capability: text('capability').$type<Capability>().notNull(),
    fromZone: text('from_zone').$type<Zone>().notNull(),
    toZone: text('to_zone').$type<Zone>().notNull(),
    program: text('program'),
    severity: text('severity').$type<'critical' | 'normal'>().notNull(),
    actionCount: integer('action_count').notNull(),
    sessionCount: integer('session_count').notNull(),
    analyzabilityNoneCount: integer('analyzability_none_count').notNull(),
    firstOccurredAt: text('first_occurred_at').notNull(),
    lastOccurredAt: text('last_occurred_at').notNull(),
    baselineRuleIds: jsonb('baseline_rule_ids').$type<string[]>().notNull(),
    candidateRuleIds: jsonb('candidate_rule_ids').$type<string[]>().notNull(),
    targetSummary: jsonb('target_summary').$type<{ key: string; count: number }[]>().notNull(),
    headline: text('headline').notNull(),
    sampleActionKeys: jsonb('sample_action_keys').$type<string[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.replayRunId, t.groupKey] }),
    index('idx_replay_diff_groups__replay_run_id_direction_severity').on(
      t.replayRunId,
      t.direction,
      t.severity,
    ),
  ],
);

export const replayChangedActions = pgTable(
  'replay_changed_actions',
  {
    replayRunId: text('replay_run_id').notNull(),
    actionKey: text('action_key').notNull(),
    groupKey: text('group_key').notNull(),
    fromEffect: text('from_effect').$type<Effect>().notNull(),
    toEffect: text('to_effect').$type<Effect>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.replayRunId, t.actionKey] })],
);

export const conformanceFindings = pgTable(
  'conformance_findings',
  {
    replayRunId: text('replay_run_id').notNull(),
    findingKey: text('finding_key').notNull(),
    kind: text('kind').$type<ConformanceFindingKind>().notNull(),
    capability: text('capability').$type<Capability>().notNull(),
    zone: text('zone').$type<Zone>().notNull(),
    program: text('program'),
    actionCount: integer('action_count').notNull(),
    sessionCount: integer('session_count').notNull(),
    firstOccurredAt: text('first_occurred_at').notNull(),
    lastOccurredAt: text('last_occurred_at').notNull(),
    sampleActionKeys: jsonb('sample_action_keys').$type<string[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.replayRunId, t.findingKey] })],
);
