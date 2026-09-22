import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import type { IsoTimestamp } from '@authority/kernel';
import { narrowTransaction } from '@authority/platform';
import type { Database } from '@authority/platform';
import {
  ReplayRunSchema,
  StoredDiffGroupSchema,
  type ReplayRun,
  type ReplayRunId,
  type StoredDiffGroup,
} from '../../schema.ts';
import type {
  AuthorityMapRunView,
  DiffGroupsPage,
  FailStaleRunsInput,
  ListDiffGroupsQuery,
  RecordCompletionInput,
  ReplayStore,
} from '../app/ports.ts';
import { replayChangedActions, replayDiffGroups, replayRuns } from './tables.ts';

type RunRow = typeof replayRuns.$inferSelect;
type GroupRow = typeof replayDiffGroups.$inferSelect;

function toRun(row: RunRow): ReplayRun {
  return ReplayRunSchema.parse(row);
}

function toGroup(row: GroupRow): StoredDiffGroup {
  return StoredDiffGroupSchema.parse(row);
}

function runInsertValues(run: ReplayRun): RunRow {
  return {
    id: run.id,
    baselineVersionId: run.baselineVersionId,
    candidateVersionId: run.candidateVersionId,
    windowFrom: run.windowFrom,
    windowTo: run.windowTo,
    status: run.status,
    classifierVersion: run.classifierVersion,
    inputsHash: run.inputsHash,
    resultHash: run.resultHash,
    stats: run.stats === null ? null : { ...run.stats, matrix: [] },
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
        if (input.groups.length > 0) {
          await tx.insert(replayDiffGroups).values(input.groups.map(groupInsertValues));
        }
        if (input.changedActions.length > 0) {
          await tx.insert(replayChangedActions).values(
            input.changedActions.map((changed) => ({
              replayRunId: changed.replayRunId,
              actionKey: changed.actionKey,
              groupKey: changed.groupKey,
              fromEffect: changed.fromEffect,
              toEffect: changed.toEffect,
            })),
          );
        }
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
        .where(eq(replayRuns.status, 'completed'))
        .orderBy(desc(replayRuns.completedAt));
      return rows.map((row) => {
        const run = toRun(row);
        return {
          replayRunId: run.id,
          candidateVersionId: run.candidateVersionId,
          windowFrom: run.windowFrom,
          windowTo: run.windowTo,
          matrix: row.stats?.matrix ?? [],
        };
      });
    },
  };
}
