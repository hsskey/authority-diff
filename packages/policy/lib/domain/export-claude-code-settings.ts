import type {
  ClaudeCodeSettingsExport,
  PolicyDocument,
  PolicyRule,
  UnmappedRuleReason,
} from '#schema';

// ACR-0018 records why no Rule is mapped: every Claude Code form found in its permissions documentation covers more or less than the Rule.

const NOTICE =
  'Reference fragment only. Authority Diff does not deploy these settings and does not enforce them.';

function unmappedReason(rule: PolicyRule): UnmappedRuleReason {
  const { match } = rule;
  if ('mandateException' in rule && rule.mandateException !== null) {
    return 'mandate_exception';
  }
  if (match.zones === '*' || !match.zones.every((zone) => zone === 'credentials')) {
    return 'zone_not_expressible';
  }
  if (
    match.capabilities === '*' ||
    !match.capabilities.every((capability) => capability === 'read' || capability === 'write')
  ) {
    return 'capability_not_expressible';
  }
  if (match.reversibility !== null) {
    return 'reversibility_condition';
  }
  if (match.analyzability !== null) {
    return 'analyzability_condition';
  }
  return 'vendor_semantics_differ';
}

/**
 * Exports a Policy Document as a Claude Code settings fragment for reference.
 * The permission lists are always empty; every Rule is listed in
 * `unmappedRules`, in document order, with the most specific reason it has no
 * Claude Code form of the same meaning.
 */
export function exportClaudeCodeSettings(document: PolicyDocument): ClaudeCodeSettingsExport {
  return {
    notice: NOTICE,
    settings: { permissions: { allow: [], ask: [], deny: [] } },
    unmappedRules: document.rules.map((rule) => ({
      ruleId: rule.ruleId,
      reason: unmappedReason(rule),
    })),
  };
}
