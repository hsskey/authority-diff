import type { Analyzability, Capability, Target } from '../../packages/action/schema.ts';

/**
 * Published Action counts from the frozen R1 snapshot on classifier 0.2.4
 * (`docs/evidence/adoption-preview.md` Adoption Groups, plus the allow
 * residual and the excluded no-Operation count). S1 samples these weights;
 * it does not copy recorded fragments, paths, hosts, or Session identifiers.
 */
export const R1_EVALUATED_ACTIONS = 34_490;
export const R1_EXCLUDED_ACTIONS = 450;
export const R1_TOTAL_ACTIONS = 34_940;
export const R1_ALLOW_ACTIONS = 17_509;
export const R1_ASK_DENY_ACTIONS = 16_981;
export const R1_ANALYZABILITY_FULL = 17_980;
export const R1_ANALYZABILITY_PARTIAL = 9_662;
export const R1_ANALYZABILITY_NONE = 6_848;

export const S1_PRINCIPAL_COUNT = 40;
export const S1_DAY_COUNT = 30;
export const S1_ACTION_COUNT = 300_000;
export const S1_SEED = 1;
export const S1_ORIGIN = '2026-01-01T00:00:00.000Z';
/** Design doc chapter 17: replay evaluation 50 µs per Action per Policy Version. */
export const CHAPTER_17_US_PER_ACTION = 50;

export interface S1Archetype {
  readonly weight: number;
  readonly capability: Capability | null;
  readonly analyzability: Analyzability;
  readonly programs: readonly (string | null)[];
  readonly target: Target;
  readonly signals: readonly string[];
}

const workspaceFile: Target = {
  kind: 'path',
  path: '~/synthetic-workspace/note.txt',
  isInsideWorkspace: true,
};
const hostFile: Target = {
  kind: 'path',
  path: '/tmp/synthetic/outside.txt',
  isInsideWorkspace: false,
};
const credentialFile: Target = {
  kind: 'path',
  path: '~/.ssh/synthetic-id',
  isInsideWorkspace: false,
};
const agentConfigFile: Target = {
  kind: 'path',
  path: '~/.claude/synthetic-settings.json',
  isInsideWorkspace: false,
};
const publicRepo: Target = {
  kind: 'vcs_remote',
  remoteName: 'origin',
  remoteKey: 'github.com/synthetic-org/repo-a',
  branch: 'feature/synthetic',
};
const publicProtected: Target = {
  kind: 'vcs_remote',
  remoteName: 'origin',
  remoteKey: 'github.com/synthetic-org/repo-a',
  branch: 'main',
};
const unknownRepo: Target = {
  kind: 'vcs_remote',
  remoteName: 'origin',
  remoteKey: 'example.invalid/synthetic/project',
  branch: 'feature/synthetic',
};
const unknownHost: Target = { kind: 'host', host: 'example.invalid', scheme: 'https' };
const publicHost: Target = { kind: 'host', host: 'github.com', scheme: 'https' };
const trustedPackage: Target = {
  kind: 'package',
  ecosystem: 'npm',
  source: 'registry.npmjs.org',
};
const unknownPackage: Target = {
  kind: 'package',
  ecosystem: 'system',
  source: 'example.invalid/synthetic/formula',
};
const mcpTool: Target = { kind: 'mcp', server: 'synthetic-mcp', tool: 'synthetic-tool' };

/** Ask and deny Adoption Groups, in the published review order, as sampler weights. */
export const ASK_DENY_ARCHETYPES: readonly S1Archetype[] = [
  {
    weight: 13,
    capability: 'read',
    analyzability: 'full',
    programs: ['grep', 'ls', 'gh', 'Read'],
    target: credentialFile,
    signals: [],
  },
  {
    weight: 7,
    capability: 'rewrite',
    analyzability: 'full',
    programs: ['git'],
    target: publicRepo,
    signals: [],
  },
  {
    weight: 6_611,
    capability: 'read',
    analyzability: 'full',
    programs: ['cat', 'cd', 'ls', 'grep'],
    target: hostFile,
    signals: [],
  },
  {
    weight: 5_195,
    capability: 'execute',
    analyzability: 'none',
    programs: ['python3', 'synthetic-tool-02', 'node', 'StructuredOutput'],
    target: { kind: 'unknown' },
    signals: ['inline_code'],
  },
  {
    weight: 310,
    capability: 'execute',
    analyzability: 'partial',
    programs: ['python3', 'node'],
    target: hostFile,
    signals: [],
  },
  {
    weight: 3_099,
    capability: 'write',
    analyzability: 'full',
    programs: ['cat', 'echo', 'mkdir', 'Write'],
    target: hostFile,
    signals: [],
  },
  {
    weight: 473,
    capability: 'read',
    analyzability: 'full',
    programs: ['cat', 'Read', 'sed', 'grep'],
    target: agentConfigFile,
    signals: [],
  },
  {
    weight: 387,
    capability: 'fetch',
    analyzability: 'full',
    programs: ['gh', 'git'],
    target: publicRepo,
    signals: [],
  },
  {
    weight: 231,
    capability: 'fetch',
    analyzability: 'full',
    programs: ['git', 'gh', 'WebFetch', 'curl'],
    target: unknownRepo,
    signals: [],
  },
  {
    weight: 149,
    capability: 'fetch',
    analyzability: 'full',
    programs: ['gh'],
    target: publicProtected,
    signals: [],
  },
  {
    weight: 147,
    capability: 'delete',
    analyzability: 'full',
    programs: ['rm', 'git', 'find', 'rmdir'],
    target: workspaceFile,
    signals: [],
  },
  {
    weight: 105,
    capability: 'delete',
    analyzability: 'full',
    programs: ['rm', 'rmdir'],
    target: hostFile,
    signals: [],
  },
  {
    weight: 90,
    capability: 'push',
    analyzability: 'full',
    programs: ['git'],
    target: publicRepo,
    signals: [],
  },
  {
    weight: 60,
    capability: 'execute',
    analyzability: 'full',
    programs: ['synthetic-mcp-01', 'synthetic-mcp-02'],
    target: mcpTool,
    signals: [],
  },
  {
    weight: 38,
    capability: 'fetch',
    analyzability: 'full',
    programs: ['git'],
    target: hostFile,
    signals: [],
  },
  {
    weight: 21,
    capability: 'write',
    analyzability: 'full',
    programs: ['Write', 'Edit', 'cat', 'ln'],
    target: agentConfigFile,
    signals: [],
  },
  {
    weight: 20,
    capability: 'rewrite',
    analyzability: 'full',
    programs: ['git'],
    target: workspaceFile,
    signals: [],
  },
  {
    weight: 7,
    capability: 'send',
    analyzability: 'full',
    programs: ['gh'],
    target: publicProtected,
    signals: [],
  },
  {
    weight: 4,
    capability: 'install',
    analyzability: 'full',
    programs: ['brew', 'npm'],
    target: unknownPackage,
    signals: [],
  },
  {
    weight: 3,
    capability: 'push',
    analyzability: 'full',
    programs: ['git', 'gh'],
    target: publicProtected,
    signals: [],
  },
  {
    weight: 3,
    capability: 'execute',
    analyzability: 'full',
    programs: ['npm'],
    target: trustedPackage,
    signals: [],
  },
  {
    weight: 3,
    capability: 'send',
    analyzability: 'full',
    programs: ['curl'],
    target: unknownHost,
    signals: [],
  },
  {
    weight: 2,
    capability: 'send',
    analyzability: 'full',
    programs: ['gh'],
    target: publicHost,
    signals: [],
  },
  {
    weight: 2,
    capability: 'delete',
    analyzability: 'full',
    programs: ['rm'],
    target: agentConfigFile,
    signals: [],
  },
  {
    weight: 1,
    capability: 'commit',
    analyzability: 'full',
    programs: ['git'],
    target: agentConfigFile,
    signals: [],
  },
];

/** Allow residual under the default template: workspace read, write, execute, commit. */
export const ALLOW_ARCHETYPES: readonly S1Archetype[] = [
  {
    weight: 8_000,
    capability: 'read',
    analyzability: 'full',
    programs: ['Read', 'cat', 'ls', 'git'],
    target: workspaceFile,
    signals: [],
  },
  {
    weight: 5_000,
    capability: 'write',
    analyzability: 'full',
    programs: ['Write', 'Edit', 'cat'],
    target: workspaceFile,
    signals: [],
  },
  {
    weight: 2_500,
    capability: 'execute',
    analyzability: 'full',
    programs: ['node', 'npm', 'pnpm'],
    target: workspaceFile,
    signals: [],
  },
  {
    weight: 1_500,
    capability: 'execute',
    analyzability: 'partial',
    programs: ['node', 'python3'],
    target: workspaceFile,
    signals: [],
  },
  {
    weight: 509,
    capability: 'commit',
    analyzability: 'full',
    programs: ['git'],
    target: workspaceFile,
    signals: [],
  },
];

export const EXCLUDED_ARCHETYPE: S1Archetype = {
  weight: R1_EXCLUDED_ACTIONS,
  capability: null,
  analyzability: 'full',
  programs: [null],
  target: { kind: 'unknown' },
  signals: [],
};

export const S1_ARCHETYPES: readonly S1Archetype[] = [
  ...ASK_DENY_ARCHETYPES,
  ...ALLOW_ARCHETYPES,
  EXCLUDED_ARCHETYPE,
];
