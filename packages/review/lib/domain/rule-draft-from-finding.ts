import type { Effect } from '@authority/kernel';
import { PolicyRuleSchema } from '@authority/policy/schema';
import type { PolicyRule } from '@authority/policy/schema';
import type { ConformanceFinding, ConformanceFindingKind } from '@authority/replay/schema';

/** Whether `effect` is allowed for this Conformance Finding kind. */
export function isEffectAllowedForFinding(kind: ConformanceFindingKind, effect: Effect): boolean {
  switch (kind) {
    case 'over_asked':
      return effect === 'ask' || effect === 'deny';
    case 'under_asked':
      return effect === 'allow' || effect === 'ask' || effect === 'deny';
    case 'violation':
      return effect === 'ask' || effect === 'deny';
  }
}

/**
 * A Rule whose match is the finding's Capability and Zone. The caller supplies
 * Effect; adoption is decided in Change Review.
 */
export function ruleDraftFromFinding(
  finding: Pick<ConformanceFinding, 'findingKey' | 'capability' | 'zone'>,
  effect: Effect,
  existingRuleIds: readonly string[],
): PolicyRule {
  const existing = new Set(existingRuleIds);
  const stem = `cfnd_${finding.findingKey.slice(0, 12)}`;
  let ruleId = stem;
  let suffix = 2;
  while (existing.has(ruleId)) {
    ruleId = `${stem}_${suffix}`;
    suffix += 1;
  }
  return PolicyRuleSchema.parse({
    ruleId,
    match: {
      capabilities: [finding.capability],
      zones: [finding.zone],
      reversibility: null,
      analyzability: null,
    },
    effect,
    rationale: `review candidate created from finding ${finding.findingKey}; adoption is decided in change review.`,
  });
}
