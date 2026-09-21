import type { PolicyDocument } from '../../schema.ts';

// The default Policy template. Source of truth: docs/design.md Appendix A, with
// the Mandate Exception concept removed for schemaVersion 1 (ADR-0009). The
// Environment Profile is populated with generic, editable defaults so the
// template is functional out of the box: the agent_config paths are the ones
// named in design 13.3, and the remaining lists use widely recognized public
// locations. No real or private Environment Profile is embedded; an organization
// replaces these with its own facts.

export const DEFAULT_POLICY_DOCUMENT: PolicyDocument = {
  schemaVersion: 1,
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
    agentConfigPaths: ['.claude/**', '~/.claude/**', '.codex/**', '.mcp.json'],
    trustedRemotes: ['*.internal', '*.internal/**'],
    publicRemotes: [
      'github.com',
      'github.com/**',
      'gitlab.com',
      'gitlab.com/**',
      'registry.npmjs.org',
      'registry.npmjs.org/**',
      'pypi.org',
      'pypi.org/**',
    ],
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
      rationale: "Delegating a task does not grant permission to change the agent's own settings.",
    },
    {
      ruleId: 'ask_irreversible_local',
      match: {
        capabilities: ['delete', 'rewrite', 'deploy'],
        zones: '*',
        reversibility: ['irreversible'],
        analyzability: null,
      },
      effect: 'ask',
      rationale:
        'Being able to recover through version control is not on its own a reason to approve.',
    },
    {
      ruleId: 'ask_unanalyzable',
      match: { capabilities: '*', zones: '*', reversibility: null, analyzability: ['none'] },
      effect: 'ask',
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
      rationale: 'A production deployment is always approved by a person before it runs.',
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
      rationale: 'Fetching from an approved registry or internal host is an expected action.',
    },
  ],
};
