import { PolicyRuleSchema } from '@authority/policy/schema';
import type { PolicyRule } from '@authority/policy/schema';
import type { ConformanceFinding } from '@authority/replay/schema';

const EFFECT_FOR_KIND = {
  over_asked: 'ask',
  under_asked: 'allow',
  violation: 'allow',
} as const;

const RATIONALE_FOR_KIND = {
  over_asked:
    'Drafted from a Conformance Finding: this capability and zone were allowed in the Policy Version but the runtime prompted.',
  under_asked:
    'Drafted from a Conformance Finding: this capability and zone were asked in the Policy Version but the runtime auto-executed.',
  violation:
    'Drafted from a Conformance Finding: this capability and zone were denied in the Policy Version but the Action executed.',
} as const;

/**
 * A Rule whose match is the finding's Capability and Zone. Effect follows the
 * observed runtime: over_asked tightens to ask; under_asked and violation
 * draft an allow the Principal still has to reconcile with existing Rules.
 */
export function ruleDraftFromFinding(
  finding: Pick<ConformanceFinding, 'findingKey' | 'kind' | 'capability' | 'zone'>,
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
    effect: EFFECT_FOR_KIND[finding.kind],
    rationale: RATIONALE_FOR_KIND[finding.kind],
  });
}
