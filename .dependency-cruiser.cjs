'use strict';

/**
 * Architecture boundary rules for Authority Diff.
 * Source of truth: docs/cutline.md 15, 16.2. All rules are severity error.
 * "root file" = a file directly under packages/<pkg>/ (depth 1). Everything in
 * a subfolder (lib/, tests/) is private to its package.
 */

/** package-layering allow-lists (docs/cutline.md 15). */
const LAYERING = {
  kernel: [],
  platform: ['kernel'],
  action: ['kernel'],
  trace: ['kernel', 'action', 'platform'],
  policy: ['kernel', 'action', 'platform'],
  replay: ['kernel', 'action', 'policy', 'trace', 'platform'],
  review: ['kernel', 'policy', 'replay', 'platform'],
  contracts: ['kernel', 'action', 'trace', 'policy', 'replay', 'review'],
};

/** Forbid pkg -> any package not in its allow-list (and not itself). */
const layeringRules = Object.entries(LAYERING).map(([pkg, allowed]) => {
  const permitted = [pkg, ...allowed].join('|');
  return {
    name: `package-layering-${pkg}`,
    comment: `${pkg} may import only: ${allowed.length ? allowed.join(', ') : '(no other package)'}`,
    severity: 'error',
    from: { path: `^packages/${pkg}/` },
    to: { path: `^packages/(?!(?:${permitted})/)[^/]+/` },
  };
});

module.exports = {
  forbidden: [
    {
      name: 'entrypoint-boundary-from-app',
      comment: 'apps/** and tools/** may import only a package root file, never a subfolder.',
      severity: 'error',
      from: { path: '^(apps|tools)/' },
      to: { path: '^packages/[^/]+/[^/]+/' },
    },
    {
      name: 'entrypoint-boundary-across-packages',
      comment: 'A package may import another package only through its root files.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: { path: '^packages/([^/]+)/[^/]+/', pathNot: '^packages/$1/' },
    },
    {
      name: 'tests-through-entrypoints',
      comment: 'tests/** may import package root files and their own tests/ fixtures only.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/tests/' },
      to: { path: '^packages/([^/]+)/[^/]+/', pathNot: '^packages/$1/tests/' },
    },
    {
      name: 'tests-folder-is-private',
      comment: 'tests/ may be imported only from within a tests/ folder.',
      severity: 'error',
      from: { pathNot: '/tests/' },
      to: { path: '^packages/[^/]+/tests/' },
    },
    {
      name: 'schema-imports-schema-only',
      comment:
        'schema.ts may import only kernel, another package schema.ts, or its own package lib.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/schema\\.ts$' },
      to: {
        path: '^packages/',
        pathNot: ['^packages/kernel/', '^packages/$1/lib/', '^packages/[^/]+/schema\\.ts$'],
      },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    ...layeringRules,
    {
      name: 'domain-is-pure',
      comment: 'lib/domain must not import node builtins.',
      severity: 'error',
      from: { path: '^packages/[^/]+/lib/domain/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'domain-is-pure-no-thirdparty',
      comment: 'lib/domain must not import third-party except zod.',
      severity: 'error',
      from: { path: '^packages/[^/]+/lib/domain/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled'],
        pathNot: '[/]node_modules[/](?:zod|@authority)[/]',
      },
    },
    {
      name: 'domain-is-pure-no-infra',
      comment: 'lib/domain must not reach lib/app, lib/infra, or platform.',
      severity: 'error',
      from: { path: '^packages/[^/]+/lib/domain/' },
      to: { path: ['[/]lib[/](?:app|infra)[/]', '^packages/platform/'] },
    },
    {
      name: 'app-has-no-infra',
      comment: 'lib/app must not reach lib/infra or platform.',
      severity: 'error',
      from: { path: '^packages/[^/]+/lib/app/' },
      to: { path: ['[/]lib[/]infra[/]', '^packages/platform/'] },
    },
    {
      name: 'app-has-no-thirdparty',
      comment: 'lib/app must not import third-party except zod.',
      severity: 'error',
      from: { path: '^packages/[^/]+/lib/app/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled'],
        pathNot: '[/]node_modules[/](?:zod|@authority)[/]',
      },
    },
    {
      name: 'pure-entry-points',
      comment: 'Pure entry points must not reach lib/infra, platform, drizzle-orm, or postgres.',
      severity: 'error',
      from: {
        path: [
          '^packages/action/index\\.ts$',
          '^packages/trace/client\\.ts$',
          '^packages/policy/evaluate\\.ts$',
          '^packages/replay/diff\\.ts$',
          '^packages/[^/]+/schema\\.ts$',
        ],
      },
      to: {
        path: [
          '[/]lib[/]infra[/]',
          '^packages/platform/',
          '[/]node_modules[/]drizzle-orm[/]',
          '[/]node_modules[/]postgres[/]',
        ],
        reachable: true,
      },
    },
    {
      name: 'web-only-contracts',
      comment: 'apps/web may import only @authority/contracts and @authority/kernel/index.ts.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: {
        path: '^packages/',
        pathNot: ['^packages/contracts/', '^packages/kernel/index\\.ts$'],
      },
    },
    {
      name: 'cli-narrow',
      comment: 'apps/cli may import contracts, kernel, and trace/client.ts only.',
      severity: 'error',
      from: { path: '^apps/cli/' },
      to: {
        path: '^packages/',
        pathNot: ['^packages/contracts/', '^packages/kernel/', '^packages/trace/client\\.ts$'],
      },
    },
    {
      name: 'tools-narrow',
      comment: 'tools/** may import kernel and the pure entry points / schema.ts only.',
      severity: 'error',
      from: { path: '^tools/' },
      to: {
        path: '^packages/',
        pathNot: [
          '^packages/kernel/',
          '^packages/action/index\\.ts$',
          '^packages/trace/client\\.ts$',
          '^packages/policy/evaluate\\.ts$',
          '^packages/replay/diff\\.ts$',
          '^packages/[^/]+/schema\\.ts$',
        ],
      },
    },
    {
      name: 'contracts-schema-only',
      comment:
        'packages/contracts/** may import only another package schema.ts and @authority/kernel.',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: {
        path: '^packages/',
        pathNot: ['^packages/contracts/', '^packages/kernel/', '^packages/[^/]+/schema\\.ts$'],
      },
    },
  ],
  options: {
    doNotFollow: { path: '[/]node_modules[/]' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'node', 'default', 'types'],
      extensions: ['.ts', '.js'],
    },
  },
};
