import type {
  ActionForReplay,
  ObservationForReplay,
  RuntimeObservation,
  StoredAgentAction,
  TraceImport,
  TraceSource,
  TraceSourceCounts,
} from '../../schema.ts';
import type {
  ClassificationUpdate,
  StreamActionsQuery,
  TraceStore,
  WindowQuery,
  WriteCounts,
  WriteImportInput,
} from './ports.ts';

interface SessionRow {
  readonly runtime: string;
  readonly sessionExternalId: string;
}

function toActionForReplay(action: StoredAgentAction): ActionForReplay {
  return {
    actionKey: action.actionKey,
    sessionExternalId: action.sessionExternalId,
    operations: action.operations,
    observedOutcome: action.observedOutcome,
    occurredAt: action.occurredAt,
  };
}

function inWindow(action: StoredAgentAction, query: WindowQuery): boolean {
  return action.occurredAt >= query.from && action.occurredAt <= query.to;
}

/**
 * A pure, in-memory {@link TraceStore} for tests. It mirrors the drizzle
 * store's idempotency: an existing actionKey or observationKey is a duplicate,
 * never a second row, and a duplicate Action only refreshes `observedOutcome`.
 * `dump()` returns every stored value so a test can assert no secret survived
 * storage.
 */
export interface InMemoryTraceStore extends TraceStore {
  dump(): {
    readonly imports: readonly TraceImport[];
    readonly sessions: readonly SessionRow[];
    readonly actions: readonly StoredAgentAction[];
    readonly observations: readonly RuntimeObservation[];
  };
}

export function createInMemoryTraceStore(): InMemoryTraceStore {
  const imports: TraceImport[] = [];
  const sessions = new Map<string, SessionRow>();
  const actions = new Map<string, StoredAgentAction>();
  const observations = new Map<string, RuntimeObservation>();

  const orderedActions = (): StoredAgentAction[] =>
    [...actions.values()].sort((a, b) =>
      a.occurredAt !== b.occurredAt
        ? a.occurredAt < b.occurredAt
          ? -1
          : 1
        : a.actionKey < b.actionKey
          ? -1
          : a.actionKey > b.actionKey
            ? 1
            : 0,
    );

  return {
    writeImport(input: WriteImportInput): Promise<WriteCounts> {
      const sessionKey = `${input.session.runtime}\u0000${input.session.sessionExternalId}`;
      if (!sessions.has(sessionKey)) {
        sessions.set(sessionKey, {
          runtime: input.session.runtime,
          sessionExternalId: input.session.sessionExternalId,
        });
      }
      let inserted = 0;
      for (const action of input.actions) {
        const existing = actions.get(action.actionKey);
        if (existing === undefined) {
          actions.set(action.actionKey, action);
          inserted++;
        } else if (existing.observedOutcome !== action.observedOutcome) {
          actions.set(action.actionKey, { ...existing, observedOutcome: action.observedOutcome });
        }
      }
      const duplicateCount = input.attemptedCount - inserted;
      imports.push({
        ...input.traceImport,
        acceptedCount: inserted,
        duplicateCount,
        rejectedCount: 0,
      });
      return Promise.resolve({ acceptedCount: inserted, duplicateCount });
    },

    writeObservations(batch: readonly RuntimeObservation[]): Promise<WriteCounts> {
      let inserted = 0;
      for (const observation of batch) {
        if (!observations.has(observation.observationKey)) {
          observations.set(observation.observationKey, observation);
          inserted++;
        }
      }
      return Promise.resolve({ acceptedCount: inserted, duplicateCount: batch.length - inserted });
    },

    listObservationSessions(query: WindowQuery): Promise<readonly string[]> {
      const sessions = new Set<string>();
      for (const observation of observations.values()) {
        if (observation.occurredAt >= query.from && observation.occurredAt <= query.to) {
          sessions.add(observation.sessionExternalId);
        }
      }
      return Promise.resolve([...sessions]);
    },

    getObservations(
      sessionExternalIds: readonly string[],
    ): Promise<readonly ObservationForReplay[]> {
      const wanted = new Set(sessionExternalIds);
      return Promise.resolve(
        [...observations.values()]
          .filter((observation) => wanted.has(observation.sessionExternalId))
          .map(
            ({
              actionKey,
              event,
              sessionExternalId,
              toolName,
              toolInputHash,
              hookDecision,
              permissionMode,
              occurredAt,
            }) => ({
              actionKey,
              event,
              sessionExternalId,
              toolName,
              toolInputHash,
              hookDecision,
              permissionMode,
              occurredAt,
            }),
          ),
      );
    },

    getActions(actionKeys: readonly string[]): Promise<readonly StoredAgentAction[]> {
      return Promise.resolve(
        actionKeys
          .map((key) => actions.get(key))
          .filter((action): action is StoredAgentAction => action !== undefined),
      );
    },

    streamActions(query: StreamActionsQuery): AsyncIterable<readonly ActionForReplay[]> {
      const matched = orderedActions().filter((action) => inWindow(action, query));
      const batches: ActionForReplay[][] = [];
      for (let i = 0; i < matched.length; i += query.batchSize) {
        batches.push(matched.slice(i, i + query.batchSize).map(toActionForReplay));
      }
      return {
        [Symbol.asyncIterator]() {
          const iterator = batches[Symbol.iterator]();
          return { next: () => Promise.resolve(iterator.next()) };
        },
      };
    },

    countStaleClassifications(query: WindowQuery & { classifierVersion: string }): Promise<number> {
      return Promise.resolve(
        orderedActions().filter(
          (action) =>
            inWindow(action, query) && action.classifierVersion !== query.classifierVersion,
        ).length,
      );
    },

    listStaleActions(
      query: WindowQuery & { classifierVersion: string },
    ): Promise<readonly StoredAgentAction[]> {
      return Promise.resolve(
        orderedActions().filter(
          (action) =>
            inWindow(action, query) && action.classifierVersion !== query.classifierVersion,
        ),
      );
    },

    updateClassifications(updates: readonly ClassificationUpdate[]): Promise<number> {
      let updated = 0;
      for (const update of updates) {
        const existing = actions.get(update.actionKey);
        if (existing !== undefined) {
          actions.set(update.actionKey, {
            ...existing,
            operations: update.operations,
            classifierVersion: update.classifierVersion,
            recordedAt: update.recordedAt,
          });
          updated++;
        }
      }
      return Promise.resolve(updated);
    },

    countActionsBySource(query: WindowQuery): Promise<TraceSourceCounts> {
      const sourceOf = new Map<string, TraceSource>();
      for (const traceImport of imports) {
        if (!sourceOf.has(traceImport.sessionExternalId)) {
          sourceOf.set(traceImport.sessionExternalId, traceImport.source);
        }
      }
      const counts = { transcript: 0, hook: 0, synthetic: 0 };
      for (const action of actions.values()) {
        const source = sourceOf.get(action.sessionExternalId);
        if (source !== undefined && inWindow(action, query)) {
          counts[source] += 1;
        }
      }
      return Promise.resolve(counts);
    },

    dump() {
      return {
        imports: [...imports],
        sessions: [...sessions.values()],
        actions: [...actions.values()],
        observations: [...observations.values()],
      };
    },
  };
}
