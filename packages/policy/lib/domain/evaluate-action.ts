import type { Analyzability, Capability, Operation } from '@authority/action/schema';
import type { Effect } from '@authority/kernel';
import type {
  Decision,
  EvaluateAction,
  OperationDecision,
  PolicyDocument,
  PolicyRule,
  Reversibility,
  Zone,
} from '../../schema.ts';
import { type CompiledEnvironment, compileEnvironment, resolveZoneWith } from './resolve-zone.ts';
import { reversibilityFor } from './reversibility.ts';

// Rule-order-independent evaluation. Source of truth: packages/policy/schema.ts
// EvaluateAction TSDoc and docs/design.md section 13.5.

const EFFECT_RANK: Record<Effect, number> = { allow: 0, ask: 1, deny: 2 };

function ruleMatches(
  rule: PolicyRule,
  capability: Capability,
  zone: Zone,
  reversibility: Reversibility,
  analyzability: Analyzability,
): boolean {
  const { match } = rule;
  if (match.capabilities !== '*' && !match.capabilities.includes(capability)) {
    return false;
  }
  if (match.zones !== '*' && !match.zones.includes(zone)) {
    return false;
  }
  if (match.reversibility !== null && !match.reversibility.includes(reversibility)) {
    return false;
  }
  if (match.analyzability !== null && !match.analyzability.includes(analyzability)) {
    return false;
  }
  return true;
}

// Effects use deny > ask > allow; no matching Rule yields the default ask.
function resolveEffect(matched: readonly PolicyRule[]): Effect {
  if (matched.some((rule) => rule.effect === 'deny')) {
    return 'deny';
  }
  if (matched.some((rule) => rule.effect === 'ask')) {
    return 'ask';
  }
  if (matched.some((rule) => rule.effect === 'allow')) {
    return 'allow';
  }
  return 'ask';
}

// The first matched ruleId (ascending UTF-16 code-unit order) whose Effect is
// the resolved Effect; null when the default ask has no matching Rule.
function decidingRuleId(matched: readonly PolicyRule[], effect: Effect): string | null {
  const candidates = matched
    .filter((rule) => rule.effect === effect)
    .map((rule) => rule.ruleId)
    .sort();
  return candidates[0] ?? null;
}

function evaluateOperation(
  operation: Operation,
  rules: readonly PolicyRule[],
  environment: CompiledEnvironment,
): OperationDecision {
  const zone = resolveZoneWith(operation, environment);
  const reversibility = reversibilityFor(operation.capability, zone);
  const matched = rules.filter((rule) =>
    ruleMatches(rule, operation.capability, zone, reversibility, operation.analyzability),
  );
  const effect = resolveEffect(matched);
  return {
    operationIndex: operation.index,
    zone,
    reversibility,
    matchedRuleIds: matched.map((rule) => rule.ruleId).sort(),
    decidingRuleId: decidingRuleId(matched, effect),
    effect,
  };
}

function mostRestrictiveEffect(decisions: readonly OperationDecision[]): Effect {
  return decisions.reduce<Effect>(
    (worst, decision) =>
      EFFECT_RANK[decision.effect] > EFFECT_RANK[worst] ? decision.effect : worst,
    'allow',
  );
}

// The smallest Operation index among Operations carrying the Action's Effect.
function decidingOperationIndex(decisions: readonly OperationDecision[], effect: Effect): number {
  return decisions
    .filter((decision) => decision.effect === effect)
    .reduce(
      (smallest, decision) => Math.min(smallest, decision.operationIndex),
      Number.POSITIVE_INFINITY,
    );
}

function buildDecision(
  operations: readonly Operation[],
  rules: readonly PolicyRule[],
  environment: CompiledEnvironment,
): Decision | null {
  if (operations.length === 0) {
    return null;
  }
  const operationDecisions = operations.map((operation) =>
    evaluateOperation(operation, rules, environment),
  );
  const effect = mostRestrictiveEffect(operationDecisions);
  return {
    effect,
    decidingOperationIndex: decidingOperationIndex(operationDecisions, effect),
    operations: operationDecisions,
  };
}

/**
 * Compiles a Policy Document's patterns and Rules once and returns an evaluator
 * reusable across many Actions. There is no module-level cache; each call
 * produces an independent evaluator closing over its own compiled Environment.
 */
export function createEvaluator(
  document: PolicyDocument,
): (operations: readonly Operation[]) => Decision | null {
  const environment = compileEnvironment(document.environment);
  const { rules } = document;
  return (operations) => buildDecision(operations, rules, environment);
}

/** Evaluates one Action's Operations against a Policy Document. */
export const evaluateAction: EvaluateAction = (operations, document) =>
  createEvaluator(document)(operations);
