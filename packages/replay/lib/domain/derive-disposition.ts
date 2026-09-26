import type { ObservationForReplay, ObservedOutcome } from '@authority/trace/schema';
import type { Disposition } from '#schema';

type ObservationEvidence = Pick<ObservationForReplay, 'event' | 'hookDecision'>;

/**
 * Derives the Disposition the runtime showed for one Action from its transcript
 * outcome and the hook observations joined to it by actionKey.
 *
 * - a tool_result carrying a runtime block marker: `blocked`
 * - a permission_request whose hook input carried an `allow` decision:
 *   `hook_approved`; a `deny` decision: `blocked`
 * - a permission_request without a decision, or a human refusal: `prompted`
 * - only pre_tool_use, no permission_request: `auto_executed`
 * - no observation at all, so the Session had no hook coverage:
 *   `executed_prompt_unknown`
 */
export function deriveDisposition(
  observedOutcome: ObservedOutcome,
  observations: readonly ObservationEvidence[],
): Disposition {
  if (observedOutcome === 'blocked_by_runtime') {
    return 'blocked';
  }
  const permissionRequests = observations.filter(
    (observation) => observation.event === 'permission_request',
  );
  if (permissionRequests.some((observation) => observation.hookDecision === 'deny')) {
    return 'blocked';
  }
  if (permissionRequests.some((observation) => observation.hookDecision === 'allow')) {
    return 'hook_approved';
  }
  if (permissionRequests.length > 0 || observedOutcome === 'rejected_by_human') {
    return 'prompted';
  }
  if (observations.some((observation) => observation.event === 'pre_tool_use')) {
    return 'auto_executed';
  }
  return 'executed_prompt_unknown';
}
