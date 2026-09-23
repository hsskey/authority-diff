import type { AppError, Clock, IdGenerator, Result } from '@authority/kernel';
import type { ClassifyToolCall } from '@authority/action/schema';
import type { ParsedSession } from '../../schema.ts';
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
  readonly reader: ActionReader;
  readonly classifierVersion: string;
}

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
    reader: {
      getActions: (actionKeys) => store.getActions(actionKeys),
      streamActions: (query) => store.streamActions(query),
      countStaleClassifications: (query) =>
        store.countStaleClassifications({ ...query, classifierVersion }),
      listObservationSessions: (query) => store.listObservationSessions(query),
      getObservations: (sessionExternalIds) => store.getObservations(sessionExternalIds),
    },
    classifierVersion,
  };
}
