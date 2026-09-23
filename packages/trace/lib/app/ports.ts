import type { IsoTimestamp } from '@authority/kernel';
import type {
  ActionForReplay,
  AgentSession,
  ObservationForReplay,
  RuntimeObservation,
  StoredAgentAction,
  TraceImport,
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
 * `actionKey` for Actions, `observationKey` for observations.
 */
export interface TraceStore {
  writeImport(input: WriteImportInput): Promise<WriteCounts>;
  writeObservations(observations: readonly RuntimeObservation[]): Promise<WriteCounts>;
  getObservations(actionKeys: readonly string[]): Promise<readonly ObservationForReplay[]>;
  getActions(actionKeys: readonly string[]): Promise<readonly StoredAgentAction[]>;
  streamActions(query: StreamActionsQuery): AsyncIterable<readonly ActionForReplay[]>;
  countStaleClassifications(query: WindowQuery & { classifierVersion: string }): Promise<number>;
  listStaleActions(
    query: WindowQuery & { classifierVersion: string },
  ): Promise<readonly StoredAgentAction[]>;
  updateClassifications(updates: readonly ClassificationUpdate[]): Promise<number>;
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
  /** The observations joined to the given Actions by actionKey, in no particular order. */
  getObservations(actionKeys: readonly string[]): Promise<readonly ObservationForReplay[]>;
}
