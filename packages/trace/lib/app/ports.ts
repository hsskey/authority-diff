import type { IsoTimestamp } from '@authority/kernel';
import type {
  ActionForReplay,
  AgentSession,
  ObservationForReplay,
  RuntimeObservation,
  StoredAgentAction,
  TraceImport,
  TraceSourceCounts,
} from '../../schema.ts';

export interface WindowQuery {
  readonly from: IsoTimestamp;
  readonly to: IsoTimestamp;
}

export interface StreamActionsQuery extends WindowQuery {
  readonly batchSize: number;
}

export interface WriteCounts {
  readonly acceptedCount: number;
  readonly duplicateCount: number;
}

export type TraceImportDraft = Omit<
  TraceImport,
  'acceptedCount' | 'duplicateCount' | 'rejectedCount'
>;

export interface WriteImportInput {
  readonly traceImport: TraceImportDraft;
  readonly session: AgentSession;
  readonly actions: readonly StoredAgentAction[];
  readonly attemptedCount: number;
}

export interface ClassificationUpdate {
  readonly actionKey: string;
  readonly operations: StoredAgentAction['operations'];
  readonly classifierVersion: string;
  readonly recordedAt: IsoTimestamp;
}

/**
 * The persistence port owned by trace. `lib/infra` implements it against
 * drizzle; tests implement it in memory. Idempotency is the natural keys:
 * `actionKey` for Actions, `observationKey` for observations. Re-importing an
 * Action refreshes only its `observedOutcome`.
 */
export interface TraceStore {
  writeImport(input: WriteImportInput): Promise<WriteCounts>;
  writeObservations(observations: readonly RuntimeObservation[]): Promise<WriteCounts>;
  listObservationSessions(query: WindowQuery): Promise<readonly string[]>;
  listObservationTimes(query: WindowQuery): Promise<readonly IsoTimestamp[]>;
  getObservations(sessionExternalIds: readonly string[]): Promise<readonly ObservationForReplay[]>;
  getActions(actionKeys: readonly string[]): Promise<readonly StoredAgentAction[]>;
  streamActions(query: StreamActionsQuery): AsyncIterable<readonly ActionForReplay[]>;
  countStaleClassifications(query: WindowQuery & { classifierVersion: string }): Promise<number>;
  listStaleActions(
    query: WindowQuery & { classifierVersion: string },
  ): Promise<readonly StoredAgentAction[]>;
  updateClassifications(updates: readonly ClassificationUpdate[]): Promise<number>;
  countActionsBySource(query: WindowQuery): Promise<TraceSourceCounts>;
}

/**
 * The read-only view other modules consume through trace's entry point. The
 * current classifier version is bound by the module, so callers need only the
 * window.
 */
export interface ActionReader {
  getActions(actionKeys: readonly string[]): Promise<readonly StoredAgentAction[]>;
  streamActions(query: StreamActionsQuery): AsyncIterable<readonly ActionForReplay[]>;
  countStaleClassifications(query: WindowQuery): Promise<number>;
  /** Distinct Sessions that have at least one observation in the window. */
  listObservationSessions(query: WindowQuery): Promise<readonly string[]>;
  /** The distinct times of the observations in the window, ascending. */
  listObservationTimes(query: WindowQuery): Promise<readonly IsoTimestamp[]>;
  /** Every observation of the given Sessions, in no particular order. */
  getObservations(sessionExternalIds: readonly string[]): Promise<readonly ObservationForReplay[]>;
}
