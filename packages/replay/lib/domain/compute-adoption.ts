import { invariant } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import type { Operation } from '@authority/action/schema';
import type { Decision, OperationDecision } from '@authority/policy/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import type {
  AdoptionAssignment,
  AdoptionEffect,
  AdoptionGroup,
  AdoptionResult,
  AdoptionStats,
} from '#schema';
import { buildAnalyzabilityCounts, buildMatrix } from './build-matrix.ts';
import {
  CAPABILITY_WORD,
  countOf,
  deriveTargetKey,
  EFFECT_WORD,
  sampleActionKeys,
  sortedUniqueRuleIds,
  targetSummary,
  topCounts,
  ZONE_WORD,
} from './group-summary.ts';

type EvaluateAction = (operations: readonly Operation[]) => Decision | null;

/** Review order of the groups: every deny group before the ask groups. */
const REVIEW_ORDER: Record<AdoptionEffect, number> = { deny: 0, ask: 1 };

/** One `ask` or `deny` Action with its signature Operation and that Operation's Decision. */
interface AdoptionEntry {
  readonly action: ActionForReplay;
  readonly effect: AdoptionEffect;
  readonly operation: Operation;
  readonly decision: OperationDecision;
}

/** The Headline is rendered from a group but is excluded from resultHash. */
type HeadlineInput = Omit<AdoptionGroup, 'headline'>;

/** Renders the fixed plain-English Headline for an Adoption Group. */
function renderAdoptionHeadline(
  group: Pick<AdoptionGroup, 'effect' | 'capability' | 'zone' | 'actionCount'>,
): string {
  return (
    `This policy gives '${EFFECT_WORD[group.effect]}' to ` +
    `${countOf(group.actionCount, `${CAPABILITY_WORD[group.capability]} Action`)} ` +
    `in the ${ZONE_WORD[group.zone]} Zone.`
  );
}

/** The signature Operation is the Decision's deciding Operation. */
function signatureEntry(
  action: ActionForReplay,
  decision: Decision,
  effect: AdoptionEffect,
): AdoptionEntry {
  const operation = action.operations.find((op) => op.index === decision.decidingOperationIndex);
  const operationDecision = decision.operations.find(
    (od) => od.operationIndex === decision.decidingOperationIndex,
  );
  invariant(
    operation !== undefined && operationDecision !== undefined,
    'a Decision Effect comes from one of its Operations',
  );
  return { action, effect, operation, decision: operationDecision };
}

function groupKeyOf(entry: AdoptionEntry): string {
  return sha256Hex(canonicalJson([entry.effect, entry.operation.capability, entry.decision.zone]));
}

interface BuiltGroup {
  readonly full: AdoptionGroup;
  readonly hashed: HeadlineInput;
}

function buildGroup(groupKey: string, entries: readonly AdoptionEntry[]): BuiltGroup {
  const first = entries[0];
  invariant(first !== undefined, 'an Adoption Group has at least one Action');
  const occurredAts = entries.map((entry) => entry.action.occurredAt);
  const programs = entries.map((entry) => entry.operation.program);
  const core: HeadlineInput = {
    groupKey,
    effect: first.effect,
    capability: first.operation.capability,
    zone: first.decision.zone,
    program: null,
    programSummary: topCounts(programs, 10).map(({ key, count }) => ({ program: key, count })),
    distinctProgramCount: new Set(programs).size,
    actionCount: entries.length,
    sessionCount: new Set(entries.map((entry) => entry.action.sessionExternalId)).size,
    analyzabilityNoneCount: entries.filter((entry) => entry.operation.analyzability === 'none')
      .length,
    firstOccurredAt: occurredAts.reduce((min, at) => (at < min ? at : min)),
    lastOccurredAt: occurredAts.reduce((max, at) => (at > max ? at : max)),
    decidingRuleIds: sortedUniqueRuleIds(entries.map((entry) => entry.decision.decidingRuleId)),
    targetSummary: targetSummary(entries.map((entry) => deriveTargetKey(entry.operation.target))),
    sampleActionKeys: sampleActionKeys(entries.map((entry) => entry.action)),
  };
  return { full: { ...core, headline: renderAdoptionHeadline(core) }, hashed: core };
}

function compareGroupKey(
  a: { readonly groupKey: string },
  b: { readonly groupKey: string },
): number {
  return a.groupKey < b.groupKey ? -1 : a.groupKey > b.groupKey ? 1 : 0;
}

function compareForReview(a: AdoptionGroup, b: AdoptionGroup): number {
  if (a.effect !== b.effect) {
    return REVIEW_ORDER[a.effect] - REVIEW_ORDER[b.effect];
  }
  if (a.actionCount !== b.actionCount) {
    return b.actionCount - a.actionCount;
  }
  if (a.sessionCount !== b.sessionCount) {
    return b.sessionCount - a.sessionCount;
  }
  return compareGroupKey(a, b);
}

/**
 * The deterministic Initial Adoption core. Receives the injected candidate
 * evaluator so it can be developed and tested independently of the Policy
 * evaluation package.
 *
 * See the ComputeAdoption TSDoc in schema.ts for the frozen output contract.
 */
export function computeAdoptionWith(
  evaluateCandidate: EvaluateAction,
  actions: readonly ActionForReplay[],
): AdoptionResult {
  const seen = new Set<string>();
  for (const action of actions) {
    invariant(!seen.has(action.actionKey), `duplicate actionKey: ${action.actionKey}`);
    seen.add(action.actionKey);
  }

  const effectCounts = { allow: 0, ask: 0, deny: 0 };
  const grouped = new Map<string, AdoptionEntry[]>();
  let excludedActions = 0;

  for (const action of actions) {
    const decision = evaluateCandidate(action.operations);
    if (decision === null) {
      excludedActions += 1;
      continue;
    }
    effectCounts[decision.effect] += 1;
    if (decision.effect === 'allow') {
      continue;
    }
    const entry = signatureEntry(action, decision, decision.effect);
    const groupKey = groupKeyOf(entry);
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(entry);
    grouped.set(groupKey, bucket);
  }

  const built = [...grouped.entries()]
    .map(([groupKey, entries]) => buildGroup(groupKey, entries))
    .sort((a, b) => compareGroupKey(a.full, b.full));
  const groups = built.map((group) => group.full).sort(compareForReview);

  const assignments: AdoptionAssignment[] = [...grouped.entries()]
    .flatMap(([groupKey, entries]) =>
      entries.map((entry) => ({
        actionKey: entry.action.actionKey,
        groupKey,
        effect: entry.effect,
      })),
    )
    .sort((a, b) => (a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0));

  const stats: AdoptionStats = {
    totalActions: actions.length,
    evaluatedActions: actions.length - excludedActions,
    excludedActions,
    effectCounts,
    analyzability: buildAnalyzabilityCounts(actions, evaluateCandidate),
    cells: buildMatrix(actions, evaluateCandidate),
  };

  const resultHash = sha256Hex(
    canonicalJson({ stats, groups: built.map((group) => group.hashed), assignments }),
  );

  return { stats, groups, assignments, resultHash };
}
