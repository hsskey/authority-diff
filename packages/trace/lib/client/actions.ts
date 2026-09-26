import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { ClassifyToolCall, ToolCall } from '@authority/action/schema';
import type { ActionForReplay, DeriveActionKey, ParsedSession } from '#schema';

/**
 * Derives a stable Action Key from the runtime tool use identifier, or from the
 * Session identifier and sequence when no tool use identifier exists.
 */
export const deriveActionKey: DeriveActionKey = ({
  runtime,
  sessionExternalId,
  toolUseId,
  sequence,
}) => {
  const payload =
    toolUseId !== null ? [runtime, toolUseId] : [runtime, sessionExternalId, 'seq', sequence];
  return sha256Hex(canonicalJson(payload));
};

function prefersCandidate(candidate: ActionForReplay, existing: ActionForReplay): boolean {
  if (candidate.occurredAt !== existing.occurredAt) {
    return candidate.occurredAt < existing.occurredAt;
  }
  return candidate.sessionExternalId < existing.sessionExternalId;
}

/**
 * Builds the replay Action set from parsed Sessions using an injected
 * classifier, so trace never depends on the Action implementation. Duplicate
 * actionKeys across Sessions collapse to the earliest occurredAt, breaking ties
 * on the lexicographically first sessionExternalId. Actions are returned sorted
 * by actionKey ascending, with the count of removed duplicates.
 */
export function buildActionsForReplay(
  sessions: readonly ParsedSession[],
  classify: ClassifyToolCall,
): { readonly actions: readonly ActionForReplay[]; readonly duplicateCount: number } {
  const chosen = new Map<string, ActionForReplay>();
  let total = 0;

  for (const session of sessions) {
    for (const toolCall of session.toolCalls) {
      total++;
      const actionKey = deriveActionKey({
        runtime: session.runtime,
        sessionExternalId: session.sessionExternalId,
        toolUseId: toolCall.toolUseId,
        sequence: toolCall.sequence,
      });
      const call: ToolCall = {
        toolUseId: toolCall.toolUseId,
        toolName: toolCall.toolName,
        toolInputRedacted: toolCall.toolInputRedacted,
        isInputTruncated: toolCall.isInputTruncated,
        workspaceRoot: toolCall.workspaceRoot,
        gitBranch: toolCall.gitBranch,
        repoRemotes: toolCall.repoRemotes,
      };
      const candidate: ActionForReplay = {
        actionKey,
        sessionExternalId: session.sessionExternalId,
        operations: [...classify(call)],
        observedOutcome: toolCall.observedOutcome,
        occurredAt: toolCall.occurredAt,
      };
      const existing = chosen.get(actionKey);
      if (existing === undefined || prefersCandidate(candidate, existing)) {
        chosen.set(actionKey, candidate);
      }
    }
  }

  const actions = [...chosen.values()].sort((a, b) =>
    a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0,
  );
  return { actions, duplicateCount: total - chosen.size };
}
