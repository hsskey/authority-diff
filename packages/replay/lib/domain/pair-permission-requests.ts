import type { IsoTimestamp } from '@authority/kernel';
import { canonicalJson } from '@authority/kernel/hash';
import type { ObservationForReplay } from '@authority/trace/schema';

export interface PairedObservations {
  readonly observations: readonly ObservationForReplay[];
  readonly unpairedPermissionRequests: number;
}

interface Window {
  readonly from: IsoTimestamp;
  readonly to: IsoTimestamp;
}

const EVENT_ORDER: Record<ObservationForReplay['event'], number> = {
  pre_tool_use: 0,
  permission_request: 1,
  session_end: 2,
};

function byTime(a: ObservationForReplay, b: ObservationForReplay): number {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? -1 : 1;
  }
  if (a.event !== b.event) {
    return EVENT_ORDER[a.event] - EVENT_ORDER[b.event];
  }
  return (a.actionKey ?? '').localeCompare(b.actionKey ?? '');
}

function pairingKeyOf(observation: ObservationForReplay): string | null {
  if (observation.toolName === null || observation.toolInputHash === null) {
    return null;
  }
  return canonicalJson([
    observation.sessionExternalId,
    observation.toolName,
    observation.toolInputHash,
  ]);
}

/**
 * The PermissionRequest hook input carries no `tool_use_id`, so a
 * permission_request arrives without an actionKey. It inherits the actionKey of
 * the closest earlier pre_tool_use that has the same sessionExternalId,
 * toolName, and toolInputHash and is not paired yet; a pre_tool_use at the same
 * instant counts as earlier. A permission_request without such a pre_tool_use
 * keeps a null actionKey. Pairing is session-wide so a permission_request can
 * still pair with a pre_tool_use just outside the window edge, but an unpaired
 * permission_request is counted only when its occurredAt is within the run
 * window, matching the run's permission_requests the report speaks of.
 */
export function pairPermissionRequests(
  observations: readonly ObservationForReplay[],
  window: Window,
): PairedObservations {
  const waiting = new Map<string, string[]>();
  let unpairedPermissionRequests = 0;
  const paired = [...observations].sort(byTime).map((observation) => {
    const key = pairingKeyOf(observation);
    if (observation.event === 'pre_tool_use' && observation.actionKey !== null && key !== null) {
      const stack = waiting.get(key) ?? [];
      stack.push(observation.actionKey);
      waiting.set(key, stack);
      return observation;
    }
    if (observation.event !== 'permission_request' || observation.actionKey !== null) {
      return observation;
    }
    const actionKey = key === null ? undefined : waiting.get(key)?.pop();
    if (actionKey === undefined) {
      if (observation.occurredAt >= window.from && observation.occurredAt <= window.to) {
        unpairedPermissionRequests += 1;
      }
      return observation;
    }
    return { ...observation, actionKey };
  });
  return { observations: paired, unpairedPermissionRequests };
}
