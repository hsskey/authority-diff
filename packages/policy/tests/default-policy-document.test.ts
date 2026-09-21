import { describe, expect, test } from 'vitest';
import { PolicyDocumentSchema } from '../schema.ts';
import { DEFAULT_POLICY_DOCUMENT, validatePolicyDocument } from '../evaluate.ts';

describe('DEFAULT_POLICY_DOCUMENT', () => {
  test('is a valid Policy Document', () => {
    expect(PolicyDocumentSchema.safeParse(DEFAULT_POLICY_DOCUMENT).success).toBe(true);
  });

  test('passes its own validation with no issues', () => {
    expect(validatePolicyDocument(DEFAULT_POLICY_DOCUMENT)).toEqual([]);
  });

  test('holds the ten Appendix A rules', () => {
    expect(DEFAULT_POLICY_DOCUMENT.rules.map((rule) => rule.ruleId)).toEqual([
      'deny_credentials_access',
      'deny_shared_history_rewrite',
      'ask_agent_config_change',
      'ask_irreversible_local',
      'ask_unanalyzable',
      'ask_external_disclosure',
      'ask_production_deploy',
      'allow_workspace_edit',
      'allow_workspace_execute',
      'allow_trusted_fetch',
    ]);
  });

  test('populates every Environment Profile list', () => {
    const { environment } = DEFAULT_POLICY_DOCUMENT;
    expect(environment.credentialPaths.length).toBeGreaterThan(0);
    expect(environment.agentConfigPaths).toContain('.claude/**');
    expect(environment.trustedRemotes.length).toBeGreaterThan(0);
    expect(environment.publicRemotes.length).toBeGreaterThan(0);
    expect(environment.protectedBranches).toContain('main');
    expect(environment.productionMarkers.length).toBeGreaterThan(0);
  });
});
