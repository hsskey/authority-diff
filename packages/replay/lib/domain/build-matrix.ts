import type { Effect } from '@authority/kernel';
import type { Capability, Operation } from '@authority/action/schema';
import type { Decision, Zone } from '@authority/policy/schema';
import type { ActionForReplay } from '@authority/trace/schema';

/**
 * One capability x zone x effect cell of the candidate policy's authority map.
 * Structurally the AuthorityMapCell the HTTP contract returns; it is kept here
 * because the diff core stores the matrix inside the `stats` jsonb value rather
 * than in a column.
 */
export interface AuthorityMapCell {
  readonly capability: Capability;
  readonly zone: Zone;
  readonly effect: Effect;
  readonly count: number;
}

type EvaluateAction = (operations: readonly Operation[]) => Decision | null;

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
