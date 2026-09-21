import { describe, test } from 'vitest';
import { passes, fires } from './support.ts';
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
} from './rules.ts';

const FIX = 'tests/arch/fixtures';

describe('G1 entrypoint-boundary-from-app', () => {
  test('passes when apps import a package root file', async () => {
    await passes(entrypointBoundaryFromApp(`${FIX}/entrypoint-from-app/pass`));
  });
  test('fires when an app imports a package subfolder', async () => {
    await fires(entrypointBoundaryFromApp(`${FIX}/entrypoint-from-app/fail`), 'dependency');
  });
});

describe('G2 entrypoint-boundary-across-packages', () => {
  test('passes when a package imports another through its root', async () => {
    await passes(entrypointBoundaryAcrossPackages(`${FIX}/across-packages/pass`, 'policy'));
  });
  test('fires when a package imports another package subfolder', async () => {
    await fires(entrypointBoundaryAcrossPackages(`${FIX}/across-packages/fail`, 'policy'), 'dependency');
  });
});

describe('G3 tests-through-entrypoints', () => {
  test('passes on the real kernel', async () => {
    await passes(testsThroughEntrypoints(REPO));
  });
  test('passes on a compliant fixture', async () => {
    await passes(testsThroughEntrypoints(`${FIX}/tests-through-entrypoints/pass`));
  });
  test('fires when a test imports lib directly', async () => {
    await fires(testsThroughEntrypoints(`${FIX}/tests-through-entrypoints/fail`), 'dependency');
  });
});

describe('G4 tests-folder-is-private', () => {
  test('passes on the real kernel', async () => {
    await passes(testsFolderIsPrivate(REPO));
  });
  test('passes on a compliant fixture', async () => {
    await passes(testsFolderIsPrivate(`${FIX}/tests-folder-private/pass`));
  });
  test('fires when a lib file imports a tests fixture', async () => {
    await fires(testsFolderIsPrivate(`${FIX}/tests-folder-private/fail`), 'dependency');
  });
});

describe('G5 no-circular', () => {
  test('passes on the real packages tree', async () => {
    await passes(noCircular('packages'));
  });
  test('passes on an acyclic fixture', async () => {
    await passes(noCircular(`${FIX}/no-circular/pass`));
  });
  test('fires on a cyclic fixture', async () => {
    await fires(noCircular(`${FIX}/no-circular/fail`), 'cycle');
  });
});

describe('G6 package-layering', () => {
  test('passes when a package imports within its allow-list', async () => {
    await passes(packageLayering(`${FIX}/package-layering/pass`, 'platform', LAYERING.platform));
  });
  test('fires when a package imports outside its allow-list', async () => {
    await fires(packageLayering(`${FIX}/package-layering/fail`, 'kernel', LAYERING.kernel), 'dependency');
  });
});

describe('G7 contracts-schema-only', () => {
  test('passes when contracts import only schema.ts and kernel', async () => {
    await passes(contractsSchemaOnly(`${FIX}/contracts-schema-only/pass`));
  });
  test('fires when contracts import a non-schema file', async () => {
    await fires(contractsSchemaOnly(`${FIX}/contracts-schema-only/fail`), 'dependency');
  });
});

describe('G8 domain-is-pure', () => {
  test('domainNoInfra passes on a compliant fixture', async () => {
    await passes(domainNoInfra(`${FIX}/domain-no-infra/pass`));
  });
  test('domainNoInfra fires when domain reaches infra', async () => {
    await fires(domainNoInfra(`${FIX}/domain-no-infra/fail`), 'dependency');
  });
  test('domainNoExternal passes on the real kernel', async () => {
    await passes(domainNoExternal(REPO));
  });
  test('domainNoExternal fires on a node builtin import', async () => {
    await fires(domainNoExternal(`${FIX}/domain-no-external/fail`), 'custom');
  });
  test('domainNoExternal passes when domain imports only zod', async () => {
    await passes(domainNoExternal(`${FIX}/domain-no-external/pass`));
  });
});

describe('G9 app-has-no-infra', () => {
  test('appNoInfra passes on a compliant fixture', async () => {
    await passes(appNoInfra(`${FIX}/app-no-infra/pass`));
  });
  test('appNoInfra fires when app reaches infra', async () => {
    await fires(appNoInfra(`${FIX}/app-no-infra/fail`), 'dependency');
  });
  test('appNoExternal fires on a third-party import', async () => {
    await fires(appNoExternal(`${FIX}/app-no-external/fail`), 'custom');
  });
  test('appNoExternal passes when app imports only zod', async () => {
    await passes(appNoExternal(`${FIX}/app-no-external/pass`));
  });
});

describe('G10 pure-entry-points (direct encoding)', () => {
  test('passes when an entry reaches only its domain', async () => {
    await passes(pureEntryPoints(`${FIX}/pure-entry-points/pass`));
  });
  test('fires when an entry reaches infra directly', async () => {
    await fires(pureEntryPoints(`${FIX}/pure-entry-points/fail`), 'dependency');
  });
  test('pureEntryNoExternal fires on a third-party import', async () => {
    await fires(pureEntryNoExternal(`${FIX}/pure-entry-no-external/fail`), 'custom');
  });
  test('pureEntryNoExternal passes when a schema imports only zod', async () => {
    await passes(pureEntryNoExternal(`${FIX}/pure-entry-no-external/pass`));
  });
});

describe('G11 web-only-contracts', () => {
  test('passes when web imports only contracts and kernel index', async () => {
    await passes(webOnlyContracts(`${FIX}/web-only-contracts/pass`));
  });
  test('fires when web imports another package', async () => {
    await fires(webOnlyContracts(`${FIX}/web-only-contracts/fail`), 'dependency');
  });
});

describe('G12 cli-narrow', () => {
  test('passes when cli imports contracts, kernel, and trace/client', async () => {
    await passes(cliNarrow(`${FIX}/cli-narrow/pass`));
  });
  test('fires when cli imports another package', async () => {
    await fires(cliNarrow(`${FIX}/cli-narrow/fail`), 'dependency');
  });
});

describe('G13 tools-narrow', () => {
  test('passes when tools import kernel and a pure entry', async () => {
    await passes(toolsNarrow(`${FIX}/tools-narrow/pass`));
  });
  test('fires when tools import a non-entry file', async () => {
    await fires(toolsNarrow(`${FIX}/tools-narrow/fail`), 'dependency');
  });
});

describe('G14 drizzle-orm and postgres confinement', () => {
  test('passes on the real tree', async () => {
    await passes(drizzlePostgresConfined(REPO));
  });
  test('passes when drizzle is imported only from infra', async () => {
    await passes(drizzlePostgresConfined(`${FIX}/drizzle-postgres/pass`));
  });
  test('fires when domain imports drizzle-orm', async () => {
    await fires(drizzlePostgresConfined(`${FIX}/drizzle-postgres/fail`), 'custom');
  });
});
