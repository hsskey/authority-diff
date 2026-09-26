import type { AppError, Clock, IdGenerator, Result } from '@authority/kernel';
import type { ClassifyToolCall } from '@authority/action/schema';
import type { ActionForReplay, ActivityOverview, ParsedSession, TraceSourceCounts } from '#schema';
import { buildActivityOverview } from '../domain/activity-overview.ts';
import { importTrace } from './import-trace.ts';
import type { ImportTraceResult } from './import-trace.ts';
import { ingestObservations } from './ingest-observations.ts';
import type { IngestObservationsInput } from './ingest-observations.ts';
import { reclassifyActions } from './reclassify-actions.ts';
import type { ReclassifyActionsResult } from './reclassify-actions.ts';
import type { ActionReader, TraceStore, WindowQuery, WriteCounts } from './ports.ts';

export interface AssembleTraceModuleDeps {
  readonly store: TraceStore;
  /** Resolves the classifier on first use; the caller memoizes it. */
  readonly getClassify: () => Promise<ClassifyToolCall>;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly classifierVersion: string;
}

export interface TraceModule {
  importTrace(session: ParsedSession): Promise<Result<ImportTraceResult, AppError>>;
  ingestObservations(input: IngestObservationsInput): Promise<WriteCounts>;
  reclassifyActions(window: WindowQuery): Promise<ReclassifyActionsResult>;
  /** The Activity Overview of the window's stored Actions; no Effect or Zone. */
  getActivityOverview(window: WindowQuery): Promise<ActivityOverview>;
  /** The window's Actions counted by the source of their Session's first Trace Import. */
  countActionsBySource(window: WindowQuery): Promise<TraceSourceCounts>;
  readonly reader: ActionReader;
  readonly classifierVersion: string;
}

const OVERVIEW_BATCH_SIZE = 5_000;

export function assembleTraceModule(deps: AssembleTraceModuleDeps): TraceModule {
  const { store, getClassify, clock, idGenerator, classifierVersion } = deps;
  return {
    importTrace: async (session) => {
      const classify = await getClassify();
      return importTrace({ store, classify, clock, idGenerator, classifierVersion }, session);
    },
    ingestObservations: (input) => ingestObservations({ store }, input),
    reclassifyActions: async (window) => {
      const classify = await getClassify();
      return reclassifyActions({ store, classify, clock, classifierVersion }, window);
    },
    getActivityOverview: async (window) => {
      const actions: ActionForReplay[] = [];
      for await (const batch of store.streamActions({
        ...window,
        batchSize: OVERVIEW_BATCH_SIZE,
      })) {
        actions.push(...batch);
      }
      return buildActivityOverview(actions);
    },
    countActionsBySource: (window) => store.countActionsBySource(window),
    reader: {
      getActions: (actionKeys) => store.getActions(actionKeys),
      streamActions: (query) => store.streamActions(query),
      countStaleClassifications: (query) =>
        store.countStaleClassifications({ ...query, classifierVersion }),
      listObservationSessions: (query) => store.listObservationSessions(query),
      listObservationTimes: (query) => store.listObservationTimes(query),
      getObservations: (sessionExternalIds) => store.getObservations(sessionExternalIds),
    },
    classifierVersion,
  };
}
