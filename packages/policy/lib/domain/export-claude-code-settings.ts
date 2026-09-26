import type { Capability } from '@authority/action/schema';
import type { Effect } from '@authority/kernel';
import type {
  ClaudeCodeSettingsExport,
  PolicyDocument,
  PolicyRule,
  UnmappedRuleReason,
} from '../../schema.ts';

// Vendor rule syntax follows https://code.claude.com/docs/en/permissions; ACR-0018 records why only these forms are deterministic.

const NOTICE =
  'Reference fragment only. Authority Diff does not deploy these settings and does not enforce them.';

const TOOL_BY_CAPABILITY: ReadonlyMap<Capability, string> = new Map([
  ['read', 'Read'],
  ['write', 'Edit'],
]);

// gitignore reads these characters differently from the whole-value glob, so a pattern holding one has no exact translation.
const GITIGNORE_SPECIAL = /[[\]\\!#]/;

type RuleMapping =
  | { readonly kind: 'mapped'; readonly effect: Effect; readonly entries: readonly string[] }
  | { readonly kind: 'unmapped'; readonly ruleId: string; readonly reason: UnmappedRuleReason };

function toGitignorePattern(pattern: string): string | null {
  if (
    GITIGNORE_SPECIAL.test(pattern) ||
    pattern.trim() !== pattern ||
    pattern.includes('//') ||
    pattern.includes('**')
  ) {
    return null;
  }
  if (pattern.startsWith('~/')) {
    return pattern;
  }
  if (pattern.startsWith('/')) {
    return `/${pattern}`;
  }
  return null;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function mapRule(rule: PolicyRule, credentialPatterns: readonly (string | null)[]): RuleMapping {
  const unmapped = (reason: UnmappedRuleReason): RuleMapping => ({
    kind: 'unmapped',
    ruleId: rule.ruleId,
    reason,
  });
  const { match } = rule;
  if ('mandateException' in rule && rule.mandateException !== null) {
    return unmapped('mandate_exception');
  }
  if (match.zones === '*' || !match.zones.every((zone) => zone === 'credentials')) {
    return unmapped('zone_not_expressible');
  }
  const tools =
    match.capabilities === '*' ? [] : match.capabilities.map((c) => TOOL_BY_CAPABILITY.get(c));
  if (tools.length === 0 || !tools.every(isDefined)) {
    return unmapped('capability_not_expressible');
  }
  if (match.reversibility !== null) {
    return unmapped('reversibility_condition');
  }
  if (match.analyzability !== null) {
    return unmapped('analyzability_condition');
  }
  if (!credentialPatterns.every(isDefined)) {
    return unmapped('path_pattern_not_expressible');
  }
  return {
    kind: 'mapped',
    effect: rule.effect,
    entries: tools.flatMap((tool) => credentialPatterns.map((pattern) => `${tool}(${pattern})`)),
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Exports a Policy Document as a Claude Code settings fragment for reference.
 * A Rule is mapped only when its whole meaning has a Claude Code form;
 * otherwise it is listed in `unmappedRules` with the first failing reason, in
 * document order. Each permission list is sorted and has no duplicates.
 */
export function exportClaudeCodeSettings(document: PolicyDocument): ClaudeCodeSettingsExport {
  const credentialPatterns = document.environment.credentialPaths.map(toGitignorePattern);
  const mappings = document.rules.map((rule) => mapRule(rule, credentialPatterns));
  const entriesFor = (effect: Effect): string[] =>
    sortedUnique(
      mappings.flatMap((mapping) =>
        mapping.kind === 'mapped' && mapping.effect === effect ? mapping.entries : [],
      ),
    );
  return {
    notice: NOTICE,
    settings: {
      permissions: { allow: entriesFor('allow'), ask: entriesFor('ask'), deny: entriesFor('deny') },
    },
    unmappedRules: mappings.flatMap((mapping) =>
      mapping.kind === 'unmapped' ? [{ ruleId: mapping.ruleId, reason: mapping.reason }] : [],
    ),
  };
}
