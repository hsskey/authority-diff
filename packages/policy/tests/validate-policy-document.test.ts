import { describe, expect, test } from 'vitest';
import type { PolicyDocument, PolicyDocumentV2 } from '../schema.ts';
import { DEFAULT_POLICY_DOCUMENT, validatePolicyDocument } from '../evaluate.ts';

function withRules(rules: PolicyDocumentV2['rules']): PolicyDocumentV2 {
  return { ...DEFAULT_POLICY_DOCUMENT, rules };
}
function withEnvironment(overrides: Partial<PolicyDocument['environment']>): PolicyDocument {
  return {
    ...DEFAULT_POLICY_DOCUMENT,
    environment: { ...DEFAULT_POLICY_DOCUMENT.environment, ...overrides },
  };
}

describe('validatePolicyDocument', () => {
  test('reports duplicate_rule_id with the offending ruleId', () => {
    const rule = DEFAULT_POLICY_DOCUMENT.rules[0];
    if (rule === undefined) {
      throw new Error('default template has no rules');
    }
    const issues = validatePolicyDocument(withRules([rule, rule]));
    expect(issues).toContainEqual({
      ruleId: rule.ruleId,
      code: 'duplicate_rule_id',
      message: `Rule id "${rule.ruleId}" is defined more than once.`,
    });
  });

  test('reports invalid_pattern for an empty glob string', () => {
    const issues = validatePolicyDocument(withEnvironment({ credentialPaths: [''] }));
    expect(issues.map((issue) => issue.code)).toContain('invalid_pattern');
    expect(issues.find((issue) => issue.code === 'invalid_pattern')?.ruleId).toBeNull();
  });

  test('reports invalid_production_marker for an unparseable regular expression', () => {
    const issues = validatePolicyDocument(withEnvironment({ productionMarkers: ['[unclosed'] }));
    expect(issues.map((issue) => issue.code)).toContain('invalid_production_marker');
  });

  test('reports invalid_pattern for an empty production marker string', () => {
    const issues = validatePolicyDocument(withEnvironment({ productionMarkers: [''] }));
    expect(issues.map((issue) => issue.code)).toContain('invalid_pattern');
  });

  test('returns no issues for the default template', () => {
    expect(validatePolicyDocument(DEFAULT_POLICY_DOCUMENT)).toEqual([]);
  });
});
