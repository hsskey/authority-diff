import { describe, expect, test } from 'vitest';
import { err, ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { createPolicyModule, DEFAULT_POLICY_DOCUMENT, exportClaudeCodeSettings } from '../index.ts';
import type { PolicyRepository } from '../index.ts';
import { ClaudeCodeSettingsExportSchema, PolicyVersionSchema } from '../schema.ts';
import type { PolicyDocumentV2, PolicyRuleV2 } from '../schema.ts';
import { expectErr } from './support/result.ts';

const CREDENTIAL_RULE: PolicyRuleV2 = {
  ruleId: 'deny_credential_read_write',
  match: {
    capabilities: ['read', 'write'],
    zones: ['credentials'],
    reversibility: null,
    analyzability: null,
  },
  effect: 'deny',
  mandateException: null,
  rationale: 'Credentials are never read or changed by an Agent.',
};

function documentWith(
  rules: readonly PolicyRuleV2[],
  credentialPaths: readonly string[] = ['~/.ssh/**', '/etc/secrets/*.key', '**/.env'],
): PolicyDocumentV2 {
  return {
    schemaVersion: 2,
    environment: { ...DEFAULT_POLICY_DOCUMENT.environment, credentialPaths: [...credentialPaths] },
    rules: [...rules],
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('exportClaudeCodeSettings', () => {
  test('maps read and write in credentials to Read and Edit rules under the Rule Effect, sorted and without duplicates', () => {
    const document = documentWith([
      CREDENTIAL_RULE,
      {
        ...CREDENTIAL_RULE,
        ruleId: 'deny_credential_write',
        match: { ...CREDENTIAL_RULE.match, capabilities: ['write'] },
      },
      {
        ...CREDENTIAL_RULE,
        ruleId: 'ask_credential_read',
        effect: 'ask',
        match: { ...CREDENTIAL_RULE.match, capabilities: ['read'] },
      },
    ]);

    const result = exportClaudeCodeSettings(document);

    expect(result.settings).toEqual({
      permissions: {
        allow: [],
        ask: ['Read(//**/.env)', 'Read(//etc/secrets/*.key)', 'Read(~/.ssh/**)'],
        deny: [
          'Edit(//**/.env)',
          'Edit(//etc/secrets/*.key)',
          'Edit(~/.ssh/**)',
          'Read(//**/.env)',
          'Read(//etc/secrets/*.key)',
          'Read(~/.ssh/**)',
        ],
      },
    });
  });

  test('lists every default template Rule as unmapped with its first failing reason, and exports no permission rule', () => {
    const result = exportClaudeCodeSettings(DEFAULT_POLICY_DOCUMENT);

    expect(result).toEqual({
      notice:
        'Reference fragment only. Authority Diff does not deploy these settings and does not enforce them.',
      settings: { permissions: { allow: [], ask: [], deny: [] } },
      unmappedRules: [
        { ruleId: 'deny_credentials_access', reason: 'capability_not_expressible' },
        { ruleId: 'deny_shared_history_rewrite', reason: 'zone_not_expressible' },
        { ruleId: 'ask_agent_config_change', reason: 'zone_not_expressible' },
        { ruleId: 'ask_irreversible_local', reason: 'zone_not_expressible' },
        { ruleId: 'ask_unanalyzable', reason: 'zone_not_expressible' },
        { ruleId: 'ask_external_disclosure', reason: 'mandate_exception' },
        { ruleId: 'ask_production_deploy', reason: 'mandate_exception' },
        { ruleId: 'allow_workspace_edit', reason: 'zone_not_expressible' },
        { ruleId: 'allow_workspace_execute', reason: 'zone_not_expressible' },
        { ruleId: 'allow_trusted_fetch', reason: 'zone_not_expressible' },
      ],
    });
  });

  test.each<[string, PolicyRuleV2]>([
    [
      'mandate_exception',
      {
        ...CREDENTIAL_RULE,
        effect: 'ask',
        mandateException: { clause: 'the Mandate names this exact file' },
      },
    ],
    [
      'zone_not_expressible',
      { ...CREDENTIAL_RULE, match: { ...CREDENTIAL_RULE.match, zones: ['credentials', 'host'] } },
    ],
    [
      'zone_not_expressible',
      { ...CREDENTIAL_RULE, match: { ...CREDENTIAL_RULE.match, zones: '*' } },
    ],
    [
      'capability_not_expressible',
      { ...CREDENTIAL_RULE, match: { ...CREDENTIAL_RULE.match, capabilities: ['read', 'delete'] } },
    ],
    [
      'capability_not_expressible',
      { ...CREDENTIAL_RULE, match: { ...CREDENTIAL_RULE.match, capabilities: '*' } },
    ],
    [
      'reversibility_condition',
      { ...CREDENTIAL_RULE, match: { ...CREDENTIAL_RULE.match, reversibility: ['recoverable'] } },
    ],
    [
      'analyzability_condition',
      { ...CREDENTIAL_RULE, match: { ...CREDENTIAL_RULE.match, analyzability: ['full'] } },
    ],
  ])('lists a Rule as unmapped with %s and keeps it out of the fragment', (reason, rule) => {
    const result = exportClaudeCodeSettings(documentWith([rule]));

    expect(result).toMatchObject({
      settings: { permissions: { allow: [], ask: [], deny: [] } },
      unmappedRules: [{ ruleId: CREDENTIAL_RULE.ruleId, reason }],
    });
  });

  test.each([
    ['~/.aws/credentials', 'Read(~/.aws/credentials)'],
    ['/var/run/secrets/**', 'Read(//var/run/secrets/**)'],
    ['**/*.pem', 'Read(//**/*.pem)'],
    ['**/.config/secret', 'Read(//**/.config/secret)'],
    ['**', 'Read(//**)'],
  ])('translates the credential pattern %s to %s', (pattern, entry) => {
    const rule = {
      ...CREDENTIAL_RULE,
      match: { ...CREDENTIAL_RULE.match, capabilities: ['read' as const] },
    };

    const result = exportClaudeCodeSettings(documentWith([rule], [pattern]));

    expect(result.settings.permissions.deny).toEqual([entry]);
  });

  test.each([
    '.env',
    'secrets/**',
    '~',
    '~/.config/**.json',
    '~/**/.env',
    '/home/**/.aws/credentials',
    '/etc/[ab].key',
    '**/!keep',
    '/etc//key',
    ' ~/.netrc',
  ])(
    'lists the Rule as path_pattern_not_expressible when a credential pattern is %j',
    (pattern) => {
      const result = exportClaudeCodeSettings(
        documentWith([CREDENTIAL_RULE], ['~/.ssh/**', pattern]),
      );

      expect(result).toMatchObject({
        settings: { permissions: { allow: [], ask: [], deny: [] } },
        unmappedRules: [{ ruleId: CREDENTIAL_RULE.ruleId, reason: 'path_pattern_not_expressible' }],
      });
    },
  );

  test('leaves the document unchanged and gives the same export on every call', () => {
    const document = deepFreeze(documentWith([CREDENTIAL_RULE, ...DEFAULT_POLICY_DOCUMENT.rules]));
    const before = structuredClone(document);

    const first = exportClaudeCodeSettings(document);

    expect({ document, second: exportClaudeCodeSettings(document) }).toEqual({
      document: before,
      second: first,
    });
  });

  test('returns a value the export schema accepts', () => {
    const result = exportClaudeCodeSettings(documentWith([CREDENTIAL_RULE]));

    expect(ClaudeCodeSettingsExportSchema.parse(result)).toEqual(result);
  });
});

describe('PolicyModule.exportClaudeCodeSettings', () => {
  const version = PolicyVersionSchema.parse({
    id: `pver_${'B'.repeat(26)}`,
    policyId: `pol_${'A'.repeat(26)}`,
    versionNumber: 3,
    status: 'accepted',
    document: documentWith([CREDENTIAL_RULE]),
    contentHash: 'a'.repeat(64),
    baseVersionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  // Every store method except getVersion records its name, so a write during an export shows up.
  function makeReadOnlyRepository(
    getVersion: PolicyRepository['getVersion'],
  ): PolicyRepository & { readonly calls: string[] } {
    const calls: string[] = [];
    const record =
      <T>(name: string) =>
      (): Promise<Result<T, AppError>> => {
        calls.push(name);
        return Promise.resolve(
          err({
            code: 'internal.unexpected',
            message: name,
            isRetryable: false,
            details: null,
            cause: null,
          }),
        );
      };
    return {
      calls,
      getVersion,
      createPolicy: record('createPolicy'),
      listPolicies: record('listPolicies'),
      listVersions: record('listVersions'),
      createDraftVersion: record('createDraftVersion'),
      updateDraftDocument: record('updateDraftDocument'),
      transitionVersion: record('transitionVersion'),
      getBaseline: record('getBaseline'),
      hasAcceptedVersion: record('hasAcceptedVersion'),
      declareActivation: record('declareActivation'),
      findLatestActivation: record('findLatestActivation'),
      listActivationsBetween: record('listActivationsBetween'),
      seedAcceptedPolicy: record('seedAcceptedPolicy'),
    };
  }

  test('exports the stored document of the version', async () => {
    const module = createPolicyModule(makeReadOnlyRepository(() => Promise.resolve(ok(version))));

    const result = await module.exportClaudeCodeSettings(version.id);

    expect(result).toMatchObject(
      ok({
        settings: {
          permissions: {
            allow: [],
            ask: [],
            deny: [
              'Edit(//**/.env)',
              'Edit(//etc/secrets/*.key)',
              'Edit(~/.ssh/**)',
              'Read(//**/.env)',
              'Read(//etc/secrets/*.key)',
              'Read(~/.ssh/**)',
            ],
          },
        },
        unmappedRules: [],
      }),
    );
  });

  test('reads the version and calls no other store method', async () => {
    const repository = makeReadOnlyRepository(() => Promise.resolve(ok(version)));

    await createPolicyModule(repository).exportClaudeCodeSettings(version.id);

    expect(repository.calls).toEqual([]);
  });

  test('passes policy.version_not_found through', async () => {
    const module = createPolicyModule(
      makeReadOnlyRepository(() =>
        Promise.resolve(
          err({
            code: 'policy.version_not_found',
            message: 'missing',
            isRetryable: false,
            details: null,
            cause: null,
          }),
        ),
      ),
    );

    const result = await module.exportClaudeCodeSettings(version.id);

    expect(expectErr(result).code).toBe('policy.version_not_found');
  });
});
