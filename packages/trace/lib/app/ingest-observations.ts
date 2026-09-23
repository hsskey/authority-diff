import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Runtime } from '@authority/action/schema';
import type { RuntimeObservation } from '../../schema.ts';
import { deriveActionKey } from '../client/actions.ts';
import type { TraceStore, WriteCounts } from './ports.ts';

export type RuntimeObservationInput = Omit<RuntimeObservation, 'observationKey' | 'actionKey'>;

export interface IngestObservationsInput {
  readonly runtime: Runtime;
  readonly observations: readonly RuntimeObservationInput[];
}

/**
 * Derives the natural key that makes hook ingestion idempotent, over the runtime
 * and every identifying field of the observation.
 */
function deriveObservationKey(runtime: Runtime, input: RuntimeObservationInput): string {
  return sha256Hex(
    canonicalJson([
      runtime,
      input.event,
      input.sessionExternalId,
      input.toolName,
      input.toolInputHash,
      input.cwd,
      input.runtimeVersion,
      input.occurredAt,
      input.toolUseId,
      input.hookDecision,
    ]),
  );
}

export async function ingestObservations(
  deps: { readonly store: TraceStore },
  input: IngestObservationsInput,
): Promise<WriteCounts> {
  const byKey = new Map<string, RuntimeObservation>();
  for (const observation of input.observations) {
    const observationKey = deriveObservationKey(input.runtime, observation);
    if (!byKey.has(observationKey)) {
      const actionKey =
        observation.toolUseId === null
          ? null
          : deriveActionKey({
              runtime: input.runtime,
              sessionExternalId: observation.sessionExternalId,
              toolUseId: observation.toolUseId,
              sequence: 0,
            });
      byKey.set(observationKey, { observationKey, actionKey, ...observation });
    }
  }
  const counts = await deps.store.writeObservations([...byKey.values()]);
  const withinBatchDuplicates = input.observations.length - byKey.size;
  return {
    acceptedCount: counts.acceptedCount,
    duplicateCount: counts.duplicateCount + withinBatchDuplicates,
  };
}
