import type { PolicyDocumentV2 } from '../../schema.ts';

// Default template from docs/design.md Appendix A. Paths are absolute; generic environment facts are placeholders.
// ask_agent_config_change keeps no Mandate Exception as the control for the two ask Rules that have one.
// ask_irreversible_local leaves out deploy: deploy is irreversible only in protected, where ask_production_deploy asks, and a co-matching ask Rule without an exception would hide that Rule's Mandate Exception.

export const DEFAULT_POLICY_DOCUMENT: PolicyDocumentV2 = {
  schemaVersion: 2,
  environment: {
    credentialPaths: [
      '~/.ssh/**',
      '~/.aws/**',
      '~/.config/gh/hosts.yml',
      '~/.npmrc',
      '**/.env',
      '**/.env.*',
      '**/*.pem',
    ],
    agentConfigPaths: ['~/.claude/**', '**/.claude/**', '**/.codex/**', '**/.mcp.json'],
    trustedRemotes: [
      '*.internal',
      '*.internal/**',
      'registry.npmjs.org',
      'registry.npmjs.org/**',
      'pypi.org',
      'pypi.org/**',
    ],
    publicRemotes: ['github.com', 'github.com/**', 'gitlab.com', 'gitlab.com/**'],
    protectedBranches: ['main', 'master', 'release/**', 'production'],
    productionMarkers: ['\\bproduction\\b', '\\bprod\\b'],
  },
  rules: [
    {
      ruleId: 'deny_credentials_access',
      match: {
        capabilities: '*',
        zones: ['credentials'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'deny',
      mandateException: null,
      rationale: 'Reading or changing credentials collapses every other boundary, so it is denied.',
    },
    {
      ruleId: 'deny_shared_history_rewrite',
      match: {
        capabilities: ['rewrite'],
        zones: ['trusted_remote', 'public_remote', 'unknown_remote', 'protected'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'deny',
      mandateException: null,
      rationale: "Overwriting shared history erases other people's work and cannot be undone.",
    },
    {
      ruleId: 'ask_agent_config_change',
      match: {
        capabilities: ['write', 'delete'],
        zones: ['agent_config'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'ask',
      mandateException: null,
      rationale: "Delegating a task does not grant permission to change the agent's own settings.",
    },
    {
      ruleId: 'ask_irreversible_local',
      match: {
        capabilities: ['delete', 'rewrite'],
        zones: '*',
        reversibility: ['irreversible'],
        analyzability: null,
      },
      effect: 'ask',
      mandateException: null,
      rationale:
        'Being able to recover through version control is not on its own a reason to approve.',
    },
    {
      ruleId: 'ask_unanalyzable',
      match: { capabilities: '*', zones: '*', reversibility: null, analyzability: ['none'] },
      effect: 'ask',
      mandateException: null,
      rationale: 'A program whose effect could not be determined is confirmed by a person first.',
    },
    {
      ruleId: 'ask_external_disclosure',
      match: {
        capabilities: ['send', 'push'],
        zones: ['public_remote', 'unknown_remote'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'ask',
      mandateException: {
        clause:
          'the Mandate explicitly names the destination and explicitly asks for this send or push',
      },
      rationale:
        'External disclosure is irreversible and an open-ended instruction does not authorize it.',
    },
    {
      ruleId: 'ask_production_deploy',
      match: {
        capabilities: ['deploy'],
        zones: ['protected'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'ask',
      mandateException: {
        clause:
          'the Mandate explicitly names what to deploy and explicitly names production as the environment',
      },
      rationale:
        'A production deployment reaches every user, so a person approves it unless the Principal asked for exactly this deployment.',
    },
    {
      ruleId: 'allow_workspace_edit',
      match: {
        capabilities: ['read', 'write', 'commit'],
        zones: ['workspace'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'allow',
      mandateException: null,
      rationale:
        'Changes inside the workspace are tracked by version control and are safe to allow.',
    },
    {
      ruleId: 'allow_workspace_execute',
      match: {
        capabilities: ['execute'],
        zones: ['workspace'],
        reversibility: null,
        analyzability: ['full', 'partial'],
      },
      effect: 'allow',
      mandateException: null,
      rationale: 'Running tests and builds inside the workspace is ordinary day-to-day work.',
    },
    {
      ruleId: 'allow_trusted_fetch',
      match: {
        capabilities: ['fetch', 'install'],
        zones: ['trusted_remote'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'allow',
      mandateException: null,
      rationale: 'Fetching from an approved registry or internal host is an expected action.',
    },
  ],
};
