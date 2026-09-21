import { describe, test } from 'vitest';
import { noRealViolations } from './support.ts';
import {
  REPO,
  LAYERING,
  entrypointBoundaryFromApp,
  entrypointBoundaryAcrossPackages,
  testsThroughEntrypoints,
  testsFolderIsPrivate,
  noCircular,
  packageLayering,
  contractsSchemaOnly,
  domainNoInfra,
  domainNoExternal,
  appNoInfra,
  appNoExternal,
  pureEntryPoints,
  pureEntryNoExternal,
  webOnlyContracts,
  cliNarrow,
  toolsNarrow,
  drizzlePostgresConfined,
  kebabCaseNames,
  appFileNames,
  infraFileNames,
  routesPlacement,
  commandsPlacement,
  testFilePlacement,
  noGeneratedImports,
} from './rules.ts';
import type { Checkable } from 'archunit';

// Every rule, applied to the real repository tree. Rules whose subject/target does
// not yet exist are tolerated (allowEmptyTests) - their firing is proven by fixtures -
// but any real violation in the shipped code fails the build.
const REAL_TREE_RULES: ReadonlyArray<readonly [string, Checkable]> = [
  ['entrypoint-boundary-from-app', entrypointBoundaryFromApp(REPO)],
  ['entrypoint-boundary-across-packages (kernel)', entrypointBoundaryAcrossPackages(REPO, 'kernel')],
  ['tests-through-entrypoints', testsThroughEntrypoints(REPO)],
  ['tests-folder-is-private', testsFolderIsPrivate(REPO)],
  ['no-circular', noCircular('packages')],
  ['package-layering (kernel)', packageLayering(REPO, 'kernel', LAYERING.kernel)],
  ['contracts-schema-only', contractsSchemaOnly(REPO)],
  ['domain-no-infra', domainNoInfra(REPO)],
  ['domain-no-external', domainNoExternal(REPO)],
  ['app-no-infra', appNoInfra(REPO)],
  ['app-no-external', appNoExternal(REPO)],
  ['pure-entry-points', pureEntryPoints(REPO)],
  ['pure-entry-no-external', pureEntryNoExternal(REPO)],
  ['web-only-contracts', webOnlyContracts(REPO)],
  ['cli-narrow', cliNarrow(REPO)],
  ['tools-narrow', toolsNarrow(REPO)],
  ['drizzle-postgres-confined', drizzlePostgresConfined(REPO)],
  ['kebab-case-names', kebabCaseNames(REPO)],
  ['app-file-names', appFileNames(REPO)],
  ['infra-file-names', infraFileNames(REPO)],
  ['routes-placement', routesPlacement(REPO)],
  ['commands-placement', commandsPlacement(REPO)],
  ['test-file-placement', testFilePlacement(REPO)],
  ['no-generated-imports', noGeneratedImports(REPO)],
];

describe('real repository tree has no architecture violations', () => {
  test.each(REAL_TREE_RULES)('%s holds on the real tree', async (_name, rule) => {
    await noRealViolations(rule);
  });
});
