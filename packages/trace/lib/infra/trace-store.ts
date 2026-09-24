import { and, asc, count, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { narrowTransaction } from '@authority/platform';
import type { Database } from '@authority/platform';
import {
  ActionForReplaySchema,
  ObservationForReplaySchema,
  StoredAgentActionSchema,
  TraceSourceSchema,
} from '../../schema.ts';
import type {
  ActionForReplay,
  ObservationForReplay,
  RuntimeObservation,
  StoredAgentAction,
  TraceSourceCounts,
} from '../../schema.ts';
import type {
  ClassificationUpdate,
  StreamActionsQuery,
  TraceStore,
  WindowQuery,
  WriteCounts,
  WriteImportInput,
} from '../app/ports.ts';
import { agentActions, agentSessions, runtimeObservations, traceImports } from './tables.ts';

type ActionRow = typeof agentActions.$inferSelect;

function toStoredAction(row: ActionRow): StoredAgentAction {
  return StoredAgentActionSchema.parse(row);
}

function toActionForReplay(row: ActionRow): ActionForReplay {
  return ActionForReplaySchema.parse(row);
}

function actionInsertValues(action: StoredAgentAction): ActionRow {
  return {
    actionKey: action.actionKey,
    sessionExternalId: action.sessionExternalId,
    operations: [...action.operations],
    observedOutcome: action.observedOutcome,
    occurredAt: action.occurredAt,
    toolName: action.toolName,
    toolInputRedacted: action.toolInputRedacted,
    isInputTruncated: action.isInputTruncated,
    isSidechain: action.isSidechain,
    classifierVersion: action.classifierVersion,
    recordedAt: action.recordedAt,
  };
}

/**
 * The drizzle-backed {@link TraceStore}. Idempotency is enforced by
 * `ON CONFLICT DO NOTHING` on the natural keys; an import counts the Actions it
 * actually inserted against the number it attempted.
 */
export function createTraceStore(database: Database): TraceStore {
  const db = database.db;

  return {
    async writeImport(input: WriteImportInput): Promise<WriteCounts> {
      return database.transactionRunner.run(async (transaction) => {
        const tx = narrowTransaction(transaction);
        await tx
          .insert(agentSessions)
          .values({
            id: input.session.id,
            runtime: input.session.runtime,
            runtimeVersion: input.session.runtimeVersion,
            sessionExternalId: input.session.sessionExternalId,
            workspaceRoot: input.session.workspaceRoot,
            gitBranch: input.session.gitBranch,
            hasHookCoverage: input.session.hasHookCoverage,
            startedAt: input.session.startedAt,
            endedAt: input.session.endedAt,
          })
          .onConflictDoNothing({
            target: [agentSessions.runtime, agentSessions.sessionExternalId],
          });

        let inserted = 0;
        if (input.actions.length > 0) {
          const returned = await tx
            .insert(agentActions)
            .values(input.actions.map(actionInsertValues))
            .onConflictDoNothing({ target: agentActions.actionKey })
            .returning({ actionKey: agentActions.actionKey });
          inserted = returned.length;
        }
        const duplicateCount = input.attemptedCount - inserted;

        await tx.insert(traceImports).values({
          id: input.traceImport.id,
          runtime: input.traceImport.runtime,
          source: input.traceImport.source,
          sessionExternalId: input.traceImport.sessionExternalId,
          acceptedCount: inserted,
          duplicateCount,
          rejectedCount: 0,
          redactionCount: input.traceImport.redactionCount,
          classifierVersion: input.traceImport.classifierVersion,
          createdAt: input.traceImport.createdAt,
        });

        return { acceptedCount: inserted, duplicateCount };
      });
    },

    async writeObservations(batch: readonly RuntimeObservation[]): Promise<WriteCounts> {
      if (batch.length === 0) {
        return { acceptedCount: 0, duplicateCount: 0 };
      }
      const returned = await db
        .insert(runtimeObservations)
        .values(
          batch.map((observation) => ({
            observationKey: observation.observationKey,
            actionKey: observation.actionKey,
            event: observation.event,
            sessionExternalId: observation.sessionExternalId,
            toolUseId: observation.toolUseId,
            toolName: observation.toolName,
            toolInputHash: observation.toolInputHash,
            hookDecision: observation.hookDecision,
            permissionMode: observation.permissionMode,
            cwd: observation.cwd,
            runtimeVersion: observation.runtimeVersion,
            occurredAt: observation.occurredAt,
          })),
        )
        .onConflictDoNothing({ target: runtimeObservations.observationKey })
        .returning({ observationKey: runtimeObservations.observationKey });
      return { acceptedCount: returned.length, duplicateCount: batch.length - returned.length };
    },

    async listObservationSessions(query: WindowQuery): Promise<readonly string[]> {
      const rows = await db
        .selectDistinct({ sessionExternalId: runtimeObservations.sessionExternalId })
        .from(runtimeObservations)
        .where(
          and(
            gte(runtimeObservations.occurredAt, query.from),
            lte(runtimeObservations.occurredAt, query.to),
          ),
        );
      return rows.map((row) => row.sessionExternalId);
    },

    async getObservations(
      sessionExternalIds: readonly string[],
    ): Promise<readonly ObservationForReplay[]> {
      if (sessionExternalIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({
          actionKey: runtimeObservations.actionKey,
          event: runtimeObservations.event,
          sessionExternalId: runtimeObservations.sessionExternalId,
          toolName: runtimeObservations.toolName,
          toolInputHash: runtimeObservations.toolInputHash,
          hookDecision: runtimeObservations.hookDecision,
          permissionMode: runtimeObservations.permissionMode,
          occurredAt: runtimeObservations.occurredAt,
        })
        .from(runtimeObservations)
        .where(inArray(runtimeObservations.sessionExternalId, [...sessionExternalIds]));
      return rows.map((row) => ObservationForReplaySchema.parse(row));
    },

    async getActions(actionKeys: readonly string[]): Promise<readonly StoredAgentAction[]> {
      if (actionKeys.length === 0) {
        return [];
      }
      const rows = await db
        .select()
        .from(agentActions)
        .where(inArray(agentActions.actionKey, [...actionKeys]));
      return rows.map(toStoredAction);
    },

    async *streamActions(query: StreamActionsQuery): AsyncIterable<readonly ActionForReplay[]> {
      let cursor: { occurredAt: string; actionKey: string } | undefined;
      for (;;) {
        const conditions = [
          gte(agentActions.occurredAt, query.from),
          lte(agentActions.occurredAt, query.to),
        ];
        if (cursor !== undefined) {
          conditions.push(
            sql`(${agentActions.occurredAt}, ${agentActions.actionKey}) > (${cursor.occurredAt}, ${cursor.actionKey})`,
          );
        }
        const rows = await db
          .select()
          .from(agentActions)
          .where(and(...conditions))
          .orderBy(asc(agentActions.occurredAt), asc(agentActions.actionKey))
          .limit(query.batchSize);
        if (rows.length === 0) {
          return;
        }
        yield rows.map(toActionForReplay);
        if (rows.length < query.batchSize) {
          return;
        }
        const last = rows[rows.length - 1];
        if (last === undefined) {
          return;
        }
        cursor = { occurredAt: last.occurredAt, actionKey: last.actionKey };
      }
    },

    async countStaleClassifications(
      query: WindowQuery & { classifierVersion: string },
    ): Promise<number> {
      const rows = await db
        .select({ value: count() })
        .from(agentActions)
        .where(
          and(
            gte(agentActions.occurredAt, query.from),
            lte(agentActions.occurredAt, query.to),
            ne(agentActions.classifierVersion, query.classifierVersion),
          ),
        );
      return Number(rows[0]?.value ?? 0);
    },

    async listStaleActions(
      query: WindowQuery & { classifierVersion: string },
    ): Promise<readonly StoredAgentAction[]> {
      const rows = await db
        .select()
        .from(agentActions)
        .where(
          and(
            gte(agentActions.occurredAt, query.from),
            lte(agentActions.occurredAt, query.to),
            ne(agentActions.classifierVersion, query.classifierVersion),
          ),
        )
        .orderBy(asc(agentActions.occurredAt), asc(agentActions.actionKey));
      return rows.map(toStoredAction);
    },

    async countActionsBySource(query: WindowQuery): Promise<TraceSourceCounts> {
      // A Session re-imported later keeps the source of the import that first stored it.
      const firstImport = db
        .selectDistinctOn([traceImports.sessionExternalId], {
          sessionExternalId: traceImports.sessionExternalId,
          source: traceImports.source,
        })
        .from(traceImports)
        .orderBy(traceImports.sessionExternalId, asc(traceImports.createdAt), asc(traceImports.id))
        .as('first_import');
      const rows = await db
        .select({ source: firstImport.source, value: count() })
        .from(agentActions)
        .innerJoin(firstImport, eq(agentActions.sessionExternalId, firstImport.sessionExternalId))
        .where(
          and(gte(agentActions.occurredAt, query.from), lte(agentActions.occurredAt, query.to)),
        )
        .groupBy(firstImport.source);
      const counts = { transcript: 0, hook: 0, synthetic: 0 };
      for (const row of rows) {
        counts[TraceSourceSchema.parse(row.source)] = Number(row.value);
      }
      return counts;
    },

    async updateClassifications(updates: readonly ClassificationUpdate[]): Promise<number> {
      if (updates.length === 0) {
        return 0;
      }
      return database.transactionRunner.run(async (transaction) => {
        const tx = narrowTransaction(transaction);
        let updated = 0;
        for (const update of updates) {
          const returned = await tx
            .update(agentActions)
            .set({
              operations: [...update.operations],
              classifierVersion: update.classifierVersion,
              recordedAt: update.recordedAt,
            })
            .where(eq(agentActions.actionKey, update.actionKey))
            .returning({ actionKey: agentActions.actionKey });
          updated += returned.length;
        }
        return updated;
      });
    },
  };
}
