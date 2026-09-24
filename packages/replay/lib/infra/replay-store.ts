import { and, asc, desc, eq, getTableColumns, gt, inArray, lt, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { IsoTimestamp } from '@authority/kernel';
import { narrowTransaction } from '@authority/platform';
import type { Database } from '@authority/platform';
import {
  ConformanceFindingSchema,
  ReplayRunSchema,
  StoredAdoptionGroupSchema,
  StoredDiffGroupSchema,
  type ConformanceFinding,
  type ReplayRun,
  type ReplayRunId,
  type StoredAdoptionAssignment,
  type StoredAdoptionGroup,
  type StoredConformanceFinding,
  type StoredDiffGroup,
} from '../../schema.ts';
import type {
  AdoptionGroupsPage,
  AuthorityMapRunView,
  ConformanceRunView,
  DiffGroupsPage,
  FailStaleRunsInput,
  ListAdoptionGroupsQuery,
  ListDiffGroupsQuery,
  RecordCompletionInput,
  ReplayStore,
  StoredReplayStats,
  StoredRunStats,
} from '../app/ports.ts';
import {
  conformanceFindings,
  replayAdoptionAssignments,
  replayAdoptionGroups,
  replayChangedActions,
  replayDiffGroups,
  replayRuns,
} from './tables.ts';

type RunRow = typeof replayRuns.$inferSelect;
type GroupRow = typeof replayDiffGroups.$inferSelect;
type FindingRow = typeof conformanceFindings.$inferSelect;
type AdoptionGroupRow = typeof replayAdoptionGroups.$inferSelect;
type AdoptionAssignmentRow = typeof replayAdoptionAssignments.$inferSelect;

function toRun(row: RunRow): ReplayRun {
  return ReplayRunSchema.parse(row);
}

function toGroup(row: GroupRow): StoredDiffGroup {
  return StoredDiffGroupSchema.parse(row);
}

function toAdoptionGroup(row: AdoptionGroupRow): StoredAdoptionGroup {
  return StoredAdoptionGroupSchema.parse(row);
}

/** The matrix and analyzability live only in a version_diff or conformance run's stats. */
function diffStatsOf(stats: StoredRunStats | null): StoredReplayStats | null {
  return stats !== null && 'matrix' in stats ? stats : null;
}

/** An adoption run stores its authority-map counts as `cells`, a version_diff run as `matrix`. */
function authorityMapOf(
  stats: StoredRunStats | null,
): Pick<AuthorityMapRunView, 'matrix' | 'analyzability'> {
  if (stats === null) {
    return { matrix: [], analyzability: { full: 0, partial: 0, none: 0 } };
  }
  return {
    matrix: 'cells' in stats ? stats.cells : stats.matrix,
    analyzability: stats.analyzability,
  };
}

function statsInsertValue(run: ReplayRun): StoredRunStats | null {
  if (run.kind === 'adoption') {
    return run.stats;
  }
  return run.stats === null
    ? null
    : { ...run.stats, matrix: [], analyzability: { full: 0, partial: 0, none: 0 } };
}

function runInsertValues(run: ReplayRun): RunRow {
  return {
    id: run.id,
    kind: run.kind,
    baselineVersionId: run.baselineVersionId,
    candidateVersionId: run.candidateVersionId,
    windowFrom: run.windowFrom,
    windowTo: run.windowTo,
    status: run.status,
    classifierVersion: run.classifierVersion,
    inputsHash: run.inputsHash,
    resultHash: run.resultHash,
    stats: statsInsertValue(run),
    errorCode: run.errorCode,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

function groupInsertValues(group: StoredDiffGroup): GroupRow {
  return {
    replayRunId: group.replayRunId,
    groupKey: group.groupKey,
    direction: group.direction,
    fromEffect: group.fromEffect,
    toEffect: group.toEffect,
    capability: group.capability,
    fromZone: group.fromZone,
    toZone: group.toZone,
    program: group.program,
    severity: group.severity,
    actionCount: group.actionCount,
    sessionCount: group.sessionCount,
    analyzabilityNoneCount: group.analyzabilityNoneCount,
    firstOccurredAt: group.firstOccurredAt,
    lastOccurredAt: group.lastOccurredAt,
    baselineRuleIds: [...group.baselineRuleIds],
    candidateRuleIds: [...group.candidateRuleIds],
    targetSummary: group.targetSummary.map((entry) => ({ key: entry.key, count: entry.count })),
    headline: group.headline,
    sampleActionKeys: [...group.sampleActionKeys],
  };
}

function adoptionGroupInsertValues(group: StoredAdoptionGroup): AdoptionGroupRow {
  return {
    replayRunId: group.replayRunId,
    groupKey: group.groupKey,
    position: group.position,
    effect: group.effect,
    capability: group.capability,
    zone: group.zone,
    program: group.program,
    programSummary: group.programSummary.map((entry) => ({
      program: entry.program,
      count: entry.count,
    })),
    distinctProgramCount: group.distinctProgramCount,
    actionCount: group.actionCount,
    sessionCount: group.sessionCount,
    analyzabilityNoneCount: group.analyzabilityNoneCount,
    firstOccurredAt: group.firstOccurredAt,
    lastOccurredAt: group.lastOccurredAt,
    decidingRuleIds: [...group.decidingRuleIds],
    targetSummary: group.targetSummary.map((entry) => ({ key: entry.key, count: entry.count })),
    headline: group.headline,
    sampleActionKeys: [...group.sampleActionKeys],
  };
}

function adoptionAssignmentInsertValues(
  assignment: StoredAdoptionAssignment,
): AdoptionAssignmentRow {
  return {
    replayRunId: assignment.replayRunId,
    actionKey: assignment.actionKey,
    groupKey: assignment.groupKey,
    effect: assignment.effect,
  };
}

function findingInsertValues(finding: StoredConformanceFinding): FindingRow {
  return {
    replayRunId: finding.replayRunId,
    findingKey: finding.findingKey,
    kind: finding.kind,
    capability: finding.capability,
    zone: finding.zone,
    program: finding.program,
    actionCount: finding.actionCount,
    sessionCount: finding.sessionCount,
    firstOccurredAt: finding.firstOccurredAt,
    lastOccurredAt: finding.lastOccurredAt,
    sampleActionKeys: [...finding.sampleActionKeys],
  };
}

// Postgres accepts at most 65,534 bind parameters per statement, so a table
// with many columns needs fewer rows per statement than a narrow one.
const MAX_BIND_PARAMETERS = 65_534;
const MAX_ROWS_PER_INSERT = 5_000;

type DrizzleTransaction = ReturnType<typeof narrowTransaction>;

/** Inserts sequentially in chunks that keep every statement under the bind parameter limit. */
async function insertInChunks<Table extends PgTable>(
  tx: DrizzleTransaction,
  table: Table,
  rows: readonly Table['$inferInsert'][],
): Promise<void> {
  const rowsPerInsert = Math.min(
    MAX_ROWS_PER_INSERT,
    Math.floor(MAX_BIND_PARAMETERS / Object.keys(getTableColumns(table)).length),
  );
  for (let start = 0; start < rows.length; start += rowsPerInsert) {
    await tx.insert(table).values(rows.slice(start, start + rowsPerInsert));
  }
}

/** The drizzle-backed {@link ReplayStore}. */
export function createReplayStore(database: Database): ReplayStore {
  const db = database.db;

  const setRunStatus = async (
    id: ReplayRunId,
    fields: Partial<Pick<RunRow, 'status' | 'startedAt' | 'completedAt' | 'errorCode'>>,
  ): Promise<void> => {
    await db.update(replayRuns).set(fields).where(eq(replayRuns.id, id));
  };

  return {
    async findCompletedByInputsHash(inputsHash: string): Promise<ReplayRun | null> {
      const [row] = await db
        .select()
        .from(replayRuns)
        .where(and(eq(replayRuns.inputsHash, inputsHash), eq(replayRuns.status, 'completed')))
        .orderBy(desc(replayRuns.completedAt))
        .limit(1);
      return row === undefined ? null : toRun(row);
    },

    async insertQueuedRun(run: ReplayRun): Promise<void> {
      await db.insert(replayRuns).values(runInsertValues(run));
    },

    async markRunning(id: ReplayRunId, startedAt: IsoTimestamp): Promise<void> {
      await setRunStatus(id, { status: 'running', startedAt });
    },

    async recordCompletion(input: RecordCompletionInput): Promise<void> {
      await database.transactionRunner.run(async (transaction) => {
        const tx = narrowTransaction(transaction);
        await insertInChunks(tx, replayDiffGroups, input.groups.map(groupInsertValues));
        await insertInChunks(
          tx,
          replayChangedActions,
          input.changedActions.map((changed) => ({
            replayRunId: changed.replayRunId,
            actionKey: changed.actionKey,
            groupKey: changed.groupKey,
            fromEffect: changed.fromEffect,
            toEffect: changed.toEffect,
          })),
        );
        await insertInChunks(tx, conformanceFindings, input.findings.map(findingInsertValues));
        await insertInChunks(
          tx,
          replayAdoptionGroups,
          input.adoptionGroups.map(adoptionGroupInsertValues),
        );
        await insertInChunks(
          tx,
          replayAdoptionAssignments,
          input.adoptionAssignments.map(adoptionAssignmentInsertValues),
        );
        await tx
          .update(replayRuns)
          .set({
            status: 'completed',
            resultHash: input.resultHash,
            stats: input.stats,
            completedAt: input.completedAt,
          })
          .where(eq(replayRuns.id, input.replayRunId));
      });
    },

    async markFailed(id: ReplayRunId, errorCode: string, completedAt: IsoTimestamp): Promise<void> {
      await setRunStatus(id, { status: 'failed', errorCode, completedAt });
    },

    async getRun(id: ReplayRunId): Promise<ReplayRun | null> {
      const [row] = await db.select().from(replayRuns).where(eq(replayRuns.id, id)).limit(1);
      return row === undefined ? null : toRun(row);
    },

    async listDiffGroups(query: ListDiffGroupsQuery): Promise<DiffGroupsPage> {
      const conditions = [eq(replayDiffGroups.replayRunId, query.replayRunId)];
      if (query.direction !== undefined) {
        conditions.push(eq(replayDiffGroups.direction, query.direction));
      }
      if (query.severity !== undefined) {
        conditions.push(eq(replayDiffGroups.severity, query.severity));
      }
      if (query.cursor !== undefined) {
        conditions.push(gt(replayDiffGroups.groupKey, query.cursor));
      }
      const rows = await db
        .select()
        .from(replayDiffGroups)
        .where(and(...conditions))
        .orderBy(asc(replayDiffGroups.groupKey))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit).map(toGroup);
      const nextCursor =
        rows.length > query.limit ? (page[page.length - 1]?.groupKey ?? null) : null;
      return { items: page, nextCursor };
    },

    async getDiffGroup(id: ReplayRunId, groupKey: string): Promise<StoredDiffGroup | null> {
      const [row] = await db
        .select()
        .from(replayDiffGroups)
        .where(and(eq(replayDiffGroups.replayRunId, id), eq(replayDiffGroups.groupKey, groupKey)))
        .limit(1);
      return row === undefined ? null : toGroup(row);
    },

    async listAdoptionGroups(query: ListAdoptionGroupsQuery): Promise<AdoptionGroupsPage> {
      const conditions = [eq(replayAdoptionGroups.replayRunId, query.replayRunId)];
      if (query.effect !== undefined) {
        conditions.push(eq(replayAdoptionGroups.effect, query.effect));
      }
      if (query.cursor !== undefined) {
        // A cursor that names no group of this run compares against NULL and yields no rows.
        conditions.push(
          gt(
            replayAdoptionGroups.position,
            sql`(select ${replayAdoptionGroups.position} from ${replayAdoptionGroups} where ${replayAdoptionGroups.replayRunId} = ${query.replayRunId} and ${replayAdoptionGroups.groupKey} = ${query.cursor})`,
          ),
        );
      }
      const rows = await db
        .select()
        .from(replayAdoptionGroups)
        .where(and(...conditions))
        .orderBy(asc(replayAdoptionGroups.position))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit).map(toAdoptionGroup);
      const nextCursor =
        rows.length > query.limit ? (page[page.length - 1]?.groupKey ?? null) : null;
      return { items: page, nextCursor };
    },

    async getAdoptionGroup(id: ReplayRunId, groupKey: string): Promise<StoredAdoptionGroup | null> {
      const [row] = await db
        .select()
        .from(replayAdoptionGroups)
        .where(
          and(
            eq(replayAdoptionGroups.replayRunId, id),
            eq(replayAdoptionGroups.groupKey, groupKey),
          ),
        )
        .limit(1);
      return row === undefined ? null : toAdoptionGroup(row);
    },

    async failStaleRunningRuns(input: FailStaleRunsInput): Promise<number> {
      const olderThan = new Date(Date.parse(input.now) - input.staleMs).toISOString();
      const returned = await db
        .update(replayRuns)
        .set({ status: 'failed', errorCode: input.errorCode, completedAt: input.now })
        .where(and(eq(replayRuns.status, 'running'), lt(replayRuns.startedAt, olderThan)))
        .returning({ id: replayRuns.id });
      return returned.length;
    },

    async listCompletedRunsNewestFirst(): Promise<readonly AuthorityMapRunView[]> {
      const rows = await db
        .select()
        .from(replayRuns)
        .where(
          and(
            eq(replayRuns.status, 'completed'),
            inArray(replayRuns.kind, ['version_diff', 'adoption']),
          ),
        )
        .orderBy(desc(replayRuns.completedAt));
      return rows.map((row) => {
        const run = toRun(row);
        return {
          replayRunId: run.id,
          candidateVersionId: run.candidateVersionId,
          windowFrom: run.windowFrom,
          windowTo: run.windowTo,
          ...authorityMapOf(row.stats),
        };
      });
    },

    async findLatestConformanceRun(): Promise<ConformanceRunView | null> {
      const [row] = await db
        .select()
        .from(replayRuns)
        .where(and(eq(replayRuns.status, 'completed'), eq(replayRuns.kind, 'conformance')))
        .orderBy(desc(replayRuns.completedAt), desc(replayRuns.id))
        .limit(1);
      if (row === undefined) {
        return null;
      }
      const run = toRun(row);
      return {
        replayRunId: run.id,
        candidateVersionId: run.candidateVersionId,
        windowFrom: run.windowFrom,
        windowTo: run.windowTo,
        unpairedPermissionRequests: diffStatsOf(row.stats)?.unpairedPermissionRequests ?? 0,
        byPermissionMode: diffStatsOf(row.stats)?.byPermissionMode ?? [],
      };
    },

    async listConformanceFindings(id: ReplayRunId): Promise<readonly ConformanceFinding[]> {
      const rows = await db
        .select()
        .from(conformanceFindings)
        .where(eq(conformanceFindings.replayRunId, id))
        .orderBy(asc(conformanceFindings.findingKey));
      return rows.map(({ replayRunId: _replayRunId, ...finding }) =>
        ConformanceFindingSchema.parse(finding),
      );
    },
  };
}
