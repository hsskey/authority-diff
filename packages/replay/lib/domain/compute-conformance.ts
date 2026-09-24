import { invariant } from '@authority/kernel';
import type { Effect, IsoTimestamp } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Operation } from '@authority/action/schema';
import type { Decision, OperationDecision } from '@authority/policy/schema';
import type { ActionForReplay, ObservationForReplay } from '@authority/trace/schema';
import { UNKNOWN_PERMISSION_MODE } from '../../schema.ts';
import type {
  ConformanceFinding,
  ConformanceFindingKind,
  Disposition,
  PermissionModeCount,
  ReplayStats,
} from '../../schema.ts';
import { EFFECT_ORDER, sampleActionKeys } from './group-summary.ts';
import { deriveDisposition } from './derive-disposition.ts';
import { pairPermissionRequests } from './pair-permission-requests.ts';

type EvaluateAction = (operations: readonly Operation[]) => Decision | null;

/** `executed_prompt_unknown` has no Effect and is left out of the transitions. */
const DISPOSITION_EFFECT: Record<Disposition, Effect | null> = {
  auto_executed: 'allow',
  hook_approved: 'allow',
  prompted: 'ask',
  blocked: 'deny',
  executed_prompt_unknown: null,
};

export interface ConformanceResult {
  readonly stats: ReplayStats;
  readonly findings: readonly ConformanceFinding[];
  readonly resultHash: string;
  readonly unpairedPermissionRequests: number;
}

/**
 * - `violation`: the candidate denies the Action and the transcript shows it executed
 * - `under_asked`: the candidate asks and the runtime auto-executed
 * - `over_asked`: the candidate allows and the runtime prompted
 */
function findingKindOf(
  action: ActionForReplay,
  disposition: Disposition,
  candidate: Effect,
): ConformanceFindingKind | null {
  switch (candidate) {
    case 'deny':
      return action.observedOutcome === 'executed' ? 'violation' : null;
    case 'ask':
      return disposition === 'auto_executed' ? 'under_asked' : null;
    case 'allow':
      return disposition === 'prompted' ? 'over_asked' : null;
  }
}

interface FindingEntry {
  readonly action: ActionForReplay;
  readonly kind: ConformanceFindingKind;
  readonly operation: Operation;
  readonly decision: OperationDecision;
}

/** The lowest-index Operation that carries the Action's candidate Effect. */
function signatureEntry(
  action: ActionForReplay,
  candidate: Decision,
  kind: ConformanceFindingKind,
): FindingEntry {
  const decision = candidate.operations
    .filter((op) => op.effect === candidate.effect)
    .reduce<OperationDecision | undefined>(
      (lowest, op) =>
        lowest === undefined || op.operationIndex < lowest.operationIndex ? op : lowest,
      undefined,
    );
  const operation = action.operations.find((op) => op.index === decision?.operationIndex);
  invariant(
    decision !== undefined && operation !== undefined,
    'a Decision Effect comes from one of its Operations',
  );
  return { action, kind, operation, decision };
}

/** The first mode the Action's observations carried in time order, or `unknown`. */
function permissionModeOf(observations: readonly ObservationForReplay[]): string {
  return (
    observations.find((observation) => observation.permissionMode !== null)?.permissionMode ??
    UNKNOWN_PERMISSION_MODE
  );
}

interface ModeCounter {
  actionCount: number;
  findingCount: number;
}

function byPermissionModeOf(counters: ReadonlyMap<string, ModeCounter>): PermissionModeCount[] {
  return [...counters.entries()]
    .map(([permissionMode, counter]) => ({ permissionMode, ...counter }))
    .sort((a, b) =>
      a.permissionMode < b.permissionMode ? -1 : a.permissionMode > b.permissionMode ? 1 : 0,
    );
}

function findingKeyOf(entry: FindingEntry): string {
  return sha256Hex(
    canonicalJson([
      entry.kind,
      entry.operation.capability,
      entry.decision.zone,
      entry.operation.program,
    ]),
  );
}

function buildFinding(findingKey: string, entries: readonly FindingEntry[]): ConformanceFinding {
  const first = entries[0];
  invariant(first !== undefined, 'a Conformance Finding has at least one Action');
  const occurredAts = entries.map((entry) => entry.action.occurredAt);
  return {
    findingKey,
    kind: first.kind,
    capability: first.operation.capability,
    zone: first.decision.zone,
    program: first.operation.program,
    actionCount: entries.length,
    sessionCount: new Set(entries.map((entry) => entry.action.sessionExternalId)).size,
    firstOccurredAt: occurredAts.reduce((min, at) => (at < min ? at : min)),
    lastOccurredAt: occurredAts.reduce((max, at) => (at > max ? at : max)),
    sampleActionKeys: sampleActionKeys(entries.map((entry) => entry.action)),
  };
}

/**
 * Compares the `observed_runtime` Decision Source against a candidate Policy
 * Version. Each Action's Disposition comes from `deriveDisposition` over the
 * observations whose actionKey matches it, after `pairPermissionRequests` gives
 * each permission_request the actionKey of its pre_tool_use.
 *
 * ReplayStats follows the ComputeDiff contract with the Disposition Effect as
 * the baseline side: Actions without Operations or with an
 * `executed_prompt_unknown` Disposition are excluded from the transitions.
 * A `violation` is still reported for an excluded `executed_prompt_unknown`
 * Action. Findings sort by findingKey.
 * operationWidening is empty: Disposition is Action-level, so this path has no
 * Operation Effect pair to count.
 * byPermissionMode counts every Action, excluded ones included, under the
 * first permission mode its paired observations carried, or `unknown`, and
 * the Actions of each mode that landed in a finding.
 * `resultHash = sha256Hex(canonicalJson({ stats, findings }))`.
 */
export function computeConformanceWith(
  evaluateCandidate: EvaluateAction,
  actions: readonly ActionForReplay[],
  observations: readonly ObservationForReplay[],
  window: { readonly from: IsoTimestamp; readonly to: IsoTimestamp },
): ConformanceResult {
  const seen = new Set<string>();
  for (const action of actions) {
    invariant(!seen.has(action.actionKey), `duplicate actionKey: ${action.actionKey}`);
    seen.add(action.actionKey);
  }

  const { observations: paired, unpairedPermissionRequests } = pairPermissionRequests(
    observations,
    window,
  );
  const observationsByAction = new Map<string, ObservationForReplay[]>();
  for (const observation of paired) {
    if (observation.actionKey === null) {
      continue;
    }
    const bucket = observationsByAction.get(observation.actionKey) ?? [];
    bucket.push(observation);
    observationsByAction.set(observation.actionKey, bucket);
  }
  const transitionCounts = new Map<string, number>();
  const modeCounters = new Map<string, ModeCounter>();
  const grouped = new Map<string, FindingEntry[]>();
  let excludedActions = 0;
  let changedActions = 0;

  for (const action of actions) {
    const actionObservations = observationsByAction.get(action.actionKey) ?? [];
    const permissionMode = permissionModeOf(actionObservations);
    const modeCounter = modeCounters.get(permissionMode) ?? { actionCount: 0, findingCount: 0 };
    modeCounter.actionCount += 1;
    modeCounters.set(permissionMode, modeCounter);

    const candidate = evaluateCandidate(action.operations);
    if (candidate === null) {
      excludedActions += 1;
      continue;
    }
    const disposition = deriveDisposition(action.observedOutcome, actionObservations);
    const observed = DISPOSITION_EFFECT[disposition];
    if (observed === null) {
      excludedActions += 1;
    } else {
      const cell = `${observed}>${candidate.effect}`;
      transitionCounts.set(cell, (transitionCounts.get(cell) ?? 0) + 1);
      if (observed !== candidate.effect) {
        changedActions += 1;
      }
    }

    const kind = findingKindOf(action, disposition, candidate.effect);
    if (kind === null) {
      continue;
    }
    modeCounter.findingCount += 1;
    const entry = signatureEntry(action, candidate, kind);
    const findingKey = findingKeyOf(entry);
    const bucket = grouped.get(findingKey) ?? [];
    bucket.push(entry);
    grouped.set(findingKey, bucket);
  }

  const stats: ReplayStats = {
    totalActions: actions.length,
    evaluatedActions: actions.length - excludedActions,
    excludedActions,
    changedActions,
    transitions: EFFECT_ORDER.flatMap((from) =>
      EFFECT_ORDER.map((to) => ({ from, to, count: transitionCounts.get(`${from}>${to}`) ?? 0 })),
    ),
    operationWidening: [],
    byPermissionMode: byPermissionModeOf(modeCounters),
  };
  const findings = [...grouped.entries()]
    .map(([findingKey, entries]) => buildFinding(findingKey, entries))
    .sort((a, b) => (a.findingKey < b.findingKey ? -1 : a.findingKey > b.findingKey ? 1 : 0));
  const resultHash = sha256Hex(canonicalJson({ stats, findings }));
  return { stats, findings, resultHash, unpairedPermissionRequests };
}
