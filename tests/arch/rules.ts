import { project } from './support.ts';
import type { Checkable, FileInfo } from 'archunit';

// Rule definitions are parameterised by a root so one definition drives both the
// positive check (a compliant tree) and the negative check (a violating fixture).
//
// Two root conventions are used:
//   - "subtree" rules take a directory and scan everything under it (noCircular).
//   - "container" rules take the directory that HOLDS packages/apps/tools. For the
//     real repository that container is the repo root, written as REPO ('').
//     For a fixture it is e.g. 'tests/arch/fixtures/<rule>/fail'.
//
// Source of truth for the rules themselves: docs/cutline.md sections 15 and 16.2.

export const REPO = '';

// package-layering allow-lists (docs/cutline.md 15). `satisfies` keeps each key's
// literal type so dot-access is not widened to `string[] | undefined`.
export const LAYERING = {
  kernel: [],
  platform: ['kernel'],
  action: ['kernel'],
  trace: ['kernel', 'action', 'platform'],
  policy: ['kernel', 'action', 'platform'],
  replay: ['kernel', 'action', 'policy', 'trace', 'platform'],
  review: ['kernel', 'policy', 'replay', 'platform'],
  contracts: ['kernel', 'action', 'trace', 'policy', 'replay', 'review'],
} satisfies Record<string, readonly string[]>;

// The four pure entry points (docs/cutline.md 15).
export const PURE_ENTRIES = [
  'action/index.ts',
  'trace/client.ts',
  'policy/evaluate.ts',
  'replay/diff.ts',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Regex fragment anchoring a path to a container root ('' means the repo root).
function prefix(root: string): string {
  return root === '' ? '' : `${escapeRegExp(root)}/`;
}

function under(dir: string): RegExp {
  return new RegExp(`^${escapeRegExp(dir)}/`);
}

function inPackageSubfolder(root: string): RegExp {
  return new RegExp(`^${prefix(root)}packages/[^/]+/[^/]+/`);
}

// ---- import-specifier inspection (for rules on external modules) ------------
// archunit's dependency graph excludes node builtins and node_modules, so rules
// about node:*/third-party imports read the raw import text instead. Measured:
// archunit 2.5.4 reports zero external edges even with includeExternalDependencies().

// Matches an import/export statement anchored at the start of a line, capturing the
// module specifier: `import ... from 'x'`, `export ... from 'x'`, and side-effect
// `import 'x'`. Line-anchoring keeps it from matching string literals inside code.
const FROM_IMPORT_RE = /(?:^|\n)[ \t]*(?:import|export)\b[\s\S]*?\bfrom[ \t]*['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /(?:^|\n)[ \t]*import[ \t]*['"]([^'"]+)['"]/g;

export function importSpecifiers(content: string): string[] {
  return [...content.matchAll(FROM_IMPORT_RE), ...content.matchAll(BARE_IMPORT_RE)]
    .map((match) => match[1])
    .filter((spec): spec is string => spec !== undefined);
}

// True when the file imports a node builtin, or a third-party package whose base
// name is not in `allow` (relative and @authority/* specifiers are in-project).
export function importsForbiddenExternal(content: string, allow: readonly string[]): boolean {
  return importSpecifiers(content).some((spec) => {
    if (spec.startsWith('.')) {
      return false;
    }
    if (spec.startsWith('node:')) {
      return true;
    }
    if (spec.startsWith('@authority/')) {
      return false;
    }
    const base = spec.split('/')[0] ?? spec;
    return !allow.includes(base);
  });
}

export function importsPackage(content: string, packages: readonly string[]): boolean {
  return importSpecifiers(content).some((spec) => {
    const base = spec.split('/')[0] ?? spec;
    return packages.includes(base);
  });
}

// ============================ boundary rules (G) ============================

// G1: apps/** and tools/** import only package root files, never a subfolder.
export function entrypointBoundaryFromApp(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}(?:apps|tools)/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(inPackageSubfolder(root));
}

// G2: a package imports another package only through its root files.
export function entrypointBoundaryAcrossPackages(root: string, importer: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/${importer}/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?!${importer}/)[^/]+/[^/]+/`));
}

// G3: packages/<pkg>/tests/** may reach package root files and their own tests/,
// never another file's lib/.
export function testsThroughEntrypoints(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/tests/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/lib/`));
}

// G4: tests/ is private - only files inside a tests/ folder may import it.
export function testsFolderIsPrivate(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/(?:lib/|[^/]+\\.ts$)`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/tests/`));
}

// G5: no circular dependencies within the given subtree.
export function noCircular(subtree: string): Checkable {
  return project().inPath(under(subtree)).should().haveNoCycles();
}

// G6: package-layering. `importer` may import only the packages in its allow-list.
export function packageLayering(root: string, importer: string, allowed: readonly string[]): Checkable {
  const permitted = [importer, ...allowed].join('|');
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/${importer}/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?!(?:${permitted})/)[^/]+/`));
}

// G7: contracts/** imports only another package's schema.ts and @authority/kernel.
export function contractsSchemaOnly(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/contracts/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?!kernel/|contracts/)[^/]+/(?!schema\\.ts$).*`));
}

// G8a: lib/domain must not reach lib/app, lib/infra, or platform (in-project edges).
export function domainNoInfra(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/lib/domain/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?:[^/]+/lib/(?:app|infra)/|platform/)`));
}

// G8b: lib/domain must not import node builtins or third-party except zod.
export function domainNoExternal(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/lib/domain/`))
    .shouldNot()
    .adhereTo(
      (file: FileInfo) => importsForbiddenExternal(file.content, ['zod']),
      'lib/domain may import only relative modules, @authority/*, and zod',
    );
}

// G9a: lib/app must not reach lib/infra or platform (in-project edges).
export function appNoInfra(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/lib/app/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?:[^/]+/lib/infra/|platform/)`));
}

// G9b: lib/app must not import node builtins or third-party except zod.
export function appNoExternal(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/[^/]+/lib/app/`))
    .shouldNot()
    .adhereTo(
      (file: FileInfo) => importsForbiddenExternal(file.content, ['zod']),
      'lib/app may import only relative modules, @authority/*, and zod',
    );
}

// G10 (G10' direct encoding, docs ACR): pure entry points and every schema.ts must
// not directly import lib/app, lib/infra, or platform. With G8 closing lib/domain,
// this makes every file reachable from an entry free of infra by induction.
export function pureEntryPoints(root: string): Checkable {
  const entries = [...PURE_ENTRIES.map((entry) => `packages/${entry}`), 'packages/[^/]+/schema\\.ts'];
  const subject = new RegExp(`^${prefix(root)}(?:${entries.join('|')})$`);
  return project()
    .inPath(subject)
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?:[^/]+/lib/(?:app|infra)/|platform/)`));
}

// G10b: pure entry points must not import node builtins or third-party except zod.
export function pureEntryNoExternal(root: string): Checkable {
  const entries = [...PURE_ENTRIES.map((entry) => `packages/${entry}`), 'packages/[^/]+/schema\\.ts'];
  const subject = new RegExp(`^${prefix(root)}(?:${entries.join('|')})$`);
  return project()
    .inPath(subject)
    .shouldNot()
    .adhereTo(
      (file: FileInfo) => importsForbiddenExternal(file.content, ['zod']),
      'pure entry points may import only relative modules, @authority/*, and zod',
    );
}

// G11: apps/web imports only @authority/contracts and @authority/kernel/index.ts.
export function webOnlyContracts(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}apps/web/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?!contracts/)(?!kernel/index\\.ts$).*`));
}

// G12: apps/cli imports contracts, kernel, and trace/client.ts only.
export function cliNarrow(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}apps/cli/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(`^${prefix(root)}packages/(?!contracts/)(?!kernel/)(?!trace/client\\.ts$).*`));
}

// G13: tools/** import kernel, the pure entry points, and each schema.ts only.
export function toolsNarrow(root: string): Checkable {
  const forbidden =
    `^${prefix(root)}packages/(?!kernel/)` +
    PURE_ENTRIES.map((entry) => `(?!${entry.replace(/\./g, '\\.')}$)`).join('') +
    `(?![^/]+/schema\\.ts$).*`;
  return project()
    .inPath(new RegExp(`^${prefix(root)}tools/`))
    .shouldNot()
    .dependOnFiles()
    .inPath(new RegExp(forbidden));
}

// G14: drizzle-orm and postgres may be imported only from lib/infra and platform.
export function drizzlePostgresConfined(root: string): Checkable {
  const infra = /\/lib\/infra\//;
  const platform = new RegExp(`^${prefix(root)}packages/platform/`);
  return project()
    .inPath(new RegExp(`^${prefix(root)}packages/`))
    .shouldNot()
    .adhereTo(
      (file: FileInfo) =>
        importsPackage(file.content, ['drizzle-orm', 'postgres']) &&
        !infra.test(file.path) &&
        !platform.test(file.path),
      'drizzle-orm and postgres may be imported only from lib/infra and platform',
    );
}

// ============================ naming rules (N) ==============================

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)*\.ts$/;

// N1: every source file name is kebab-case (dotted suffixes such as .test.ts allowed).
export function kebabCaseNames(root: string): Checkable {
  return project()
    .inPath(new RegExp(`^${prefix(root)}(?:packages|apps|tools)/`))
    .should()
    .haveName(KEBAB);
}

// N4: *.use-case.ts and *.port.ts live only in lib/app.
export function appFileNames(root: string): Checkable {
  return project()
    .inPath(under(root))
    .withName(/\.(?:use-case|port)\.ts$/)
    .should()
    .beInPath(/\/lib\/app\//);
}

// N4b: *.<tech>.ts adapters and tables.ts live only in lib/infra.
export function infraFileNames(root: string): Checkable {
  return project()
    .inPath(under(root))
    .withName(/^tables\.ts$/)
    .should()
    .beInPath(/\/lib\/infra\//);
}

// N6: *.routes.ts live only in apps/server/src/http/routes.
export function routesPlacement(root: string): Checkable {
  return project()
    .inPath(under(root))
    .withName(/\.routes\.ts$/)
    .should()
    .beInPath(/\/apps\/server\/src\/http\/routes\//);
}

// N6b: *.command.ts live only in apps/cli/src/commands.
export function commandsPlacement(root: string): Checkable {
  return project()
    .inPath(under(root))
    .withName(/\.command\.ts$/)
    .should()
    .beInPath(/\/apps\/cli\/src\/commands\//);
}

// N7: test files live only under a tests/ folder (packages/*/tests, apps/*/tests, tests/).
export function testFilePlacement(root: string): Checkable {
  return project()
    .inPath(under(root))
    .withName(/\.test\.ts$/)
    .should()
    .beInPath(/\/tests\//);
}

// N9: hand-written files must not import generated files (*.gen.ts).
export function noGeneratedImports(root: string): Checkable {
  return project()
    .inPath(under(root))
    .withName(/^(?!.*\.gen\.ts$).*\.ts$/)
    .shouldNot()
    .dependOnFiles()
    .withName(/\.gen\.ts$/);
}

export { under, escapeRegExp, prefix, inPackageSubfolder };
