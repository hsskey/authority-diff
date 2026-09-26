import type { Effect } from '@authority/kernel';
import type { Analyzability, Capability, Operation } from '@authority/action/schema';
import type { Decision, Zone } from '@authority/policy/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import type { AnalyzabilityCounts, AuthorityMapCell } from '#schema';

type EvaluateAction = (operations: readonly Operation[]) => Decision | null;

const ANALYZABILITY_RANK: Record<Analyzability, number> = { full: 0, partial: 1, none: 2 };

/** An Action's analyzability is its Operations' worst (cutline.md 11). */
function actionAnalyzability(operations: readonly Operation[]): Analyzability {
  return operations.reduce<Analyzability>(
    (worst, operation) =>
      ANALYZABILITY_RANK[operation.analyzability] > ANALYZABILITY_RANK[worst]
        ? operation.analyzability
        : worst,
    'full',
  );
}

/** Tallies evaluated Actions by analyzability, matching buildMatrix's eligibility. */
export function buildAnalyzabilityCounts(
  actions: readonly ActionForReplay[],
  evaluateCandidate: EvaluateAction,
): AnalyzabilityCounts {
  const counts = { full: 0, partial: 0, none: 0 };
  for (const action of actions) {
    if (evaluateCandidate(action.operations) === null) {
      continue;
    }
    counts[actionAnalyzability(action.operations)] += 1;
  }
  return counts;
}

/**
 * Counts each evaluated Action once, under the capability, Zone, and Effect of
 * its deciding Operation, giving the candidate policy's authority map.
 */
export function buildMatrix(
  actions: readonly ActionForReplay[],
  evaluateCandidate: EvaluateAction,
): AuthorityMapCell[] {
  const cells = new Map<
    string,
    { capability: Capability; zone: Zone; effect: Effect; count: number }
  >();
  for (const action of actions) {
    const decision = evaluateCandidate(action.operations);
    if (decision === null) {
      continue;
    }
    const operation = action.operations.find((op) => op.index === decision.decidingOperationIndex);
    const operationDecision = decision.operations.find(
      (od) => od.operationIndex === decision.decidingOperationIndex,
    );
    if (operation === undefined || operationDecision === undefined) {
      continue;
    }
    const key = `${operation.capability}\u0000${operationDecision.zone}\u0000${decision.effect}`;
    const cell = cells.get(key);
    if (cell === undefined) {
      cells.set(key, {
        capability: operation.capability,
        zone: operationDecision.zone,
        effect: decision.effect,
        count: 1,
      });
    } else {
      cell.count += 1;
    }
  }
  return [...cells.values()].sort((a, b) =>
    a.capability !== b.capability
      ? a.capability < b.capability
        ? -1
        : 1
      : a.zone !== b.zone
        ? a.zone < b.zone
          ? -1
          : 1
        : a.effect < b.effect
          ? -1
          : a.effect > b.effect
            ? 1
            : 0,
  );
}
