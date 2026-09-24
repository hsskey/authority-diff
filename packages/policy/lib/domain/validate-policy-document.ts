import type { PolicyIssue, ValidatePolicyDocument } from '../../schema.ts';

// Empty glob or production-marker strings are invalid_pattern; a non-empty unparseable production marker is invalid_production_marker.

const GLOB_FIELDS = [
  'credentialPaths',
  'agentConfigPaths',
  'trustedRemotes',
  'publicRemotes',
  'protectedBranches',
] as const;

function isValidRegExp(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

export const validatePolicyDocument: ValidatePolicyDocument = (document) => {
  const issues: PolicyIssue[] = [];

  const seen = new Set<string>();
  for (const rule of document.rules) {
    if (seen.has(rule.ruleId)) {
      issues.push({
        ruleId: rule.ruleId,
        code: 'duplicate_rule_id',
        message: `Rule id "${rule.ruleId}" is defined more than once.`,
      });
    } else {
      seen.add(rule.ruleId);
    }
  }

  for (const field of GLOB_FIELDS) {
    document.environment[field].forEach((pattern, index) => {
      if (pattern.length === 0) {
        issues.push({
          ruleId: null,
          code: 'invalid_pattern',
          message: `environment.${field}[${index}] is an empty pattern.`,
        });
      }
    });
  }

  document.environment.productionMarkers.forEach((source, index) => {
    if (source.length === 0) {
      issues.push({
        ruleId: null,
        code: 'invalid_pattern',
        message: `environment.productionMarkers[${index}] is an empty pattern.`,
      });
    } else if (!isValidRegExp(source)) {
      issues.push({
        ruleId: null,
        code: 'invalid_production_marker',
        message: `environment.productionMarkers[${index}] is not a valid regular expression.`,
      });
    }
  });

  return issues;
};
