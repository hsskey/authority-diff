import type { EnvironmentProfile, PolicyDocument, PolicyRule } from './schema.ts';

const ENVIRONMENT_NAMES: readonly (keyof EnvironmentProfile)[] = [
  'credentialPaths',
  'agentConfigPaths',
  'trustedRemotes',
  'publicRemotes',
  'protectedBranches',
  'productionMarkers',
];

function renderValues(values: '*' | readonly string[]): string {
  return values === '*' ? 'any' : values.join(', ');
}

function renderRule(rule: PolicyRule): string {
  return (
    `Rule ${rule.ruleId}: capability ${renderValues(rule.match.capabilities)} ` +
    `on zone ${renderValues(rule.match.zones)}: ${rule.effect}. Rationale: ${rule.rationale}`
  );
}

/**
 * Renders a Policy Document as English prose for bounded semantic evaluation.
 * Environment values are never included; only their field names are listed.
 */
export function renderPolicyProse(document: PolicyDocument): string {
  const rules = document.rules.map(renderRule);
  return [`Environment: ${ENVIRONMENT_NAMES.join(', ')}.`, ...rules].join('\n');
}
