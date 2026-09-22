import type { Clock } from '@authority/kernel';
import type { ClassifyToolCall, ToolCall } from '@authority/action/schema';
import type { WindowQuery, TraceStore } from './ports.ts';

export interface ReclassifyActionsDeps {
  readonly store: TraceStore;
  readonly classify: ClassifyToolCall;
  readonly clock: Clock;
  readonly classifierVersion: string;
}

export interface ReclassifyActionsResult {
  readonly reclassifiedCount: number;
  readonly classifierVersion: string;
}

/**
 * Re-runs the current classifier over every Action in the window whose stored
 * `classifierVersion` differs from the current one, and rewrites its operations.
 * The stored form keeps no workspace context, so classification uses the
 * retained tool input alone.
 */
export async function reclassifyActions(
  deps: ReclassifyActionsDeps,
  window: WindowQuery,
): Promise<ReclassifyActionsResult> {
  const stale = await deps.store.listStaleActions({
    ...window,
    classifierVersion: deps.classifierVersion,
  });
  const recordedAt = deps.clock.now();
  const updates = stale.map((action) => {
    const call: ToolCall = {
      toolUseId: null,
      toolName: action.toolName,
      toolInputRedacted: action.toolInputRedacted,
      isInputTruncated: action.isInputTruncated,
      workspaceRoot: null,
      gitBranch: null,
      repoRemotes: null,
    };
    return {
      actionKey: action.actionKey,
      operations: [...deps.classify(call)],
      classifierVersion: deps.classifierVersion,
      recordedAt,
    };
  });
  const reclassifiedCount = await deps.store.updateClassifications(updates);
  return { reclassifiedCount, classifierVersion: deps.classifierVersion };
}
