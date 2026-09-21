import { describe, test, expect } from 'vitest';
import { passes, fires } from './support.ts';
import {
  REPO,
  kebabCaseNames,
  appFileNames,
  infraFileNames,
  routesPlacement,
  commandsPlacement,
  testFilePlacement,
  noGeneratedImports,
} from './rules.ts';
import {
  undeclaredRootFiles,
  barrelFiles,
  tablesViolations,
  unexpectedPackageDirs,
} from './fs-rules.ts';

const FIX = 'tests/arch/fixtures';

describe('N1 kebab-case file names', () => {
  test('passes on the real tree', async () => {
    await passes(kebabCaseNames(REPO));
  });
  test('passes on a kebab-case fixture', async () => {
    await passes(kebabCaseNames(`${FIX}/kebab-case/pass`));
  });
  test('fires on a PascalCase file name', async () => {
    await fires(kebabCaseNames(`${FIX}/kebab-case/fail`), 'naming');
  });
});

describe('N2 package root files are declared exports', () => {
  test('passes when root files match package.json exports', () => {
    expect(undeclaredRootFiles(`${FIX}/root-files/pass/packages`)).toEqual([]);
  });
  test('passes on the real packages tree', () => {
    expect(undeclaredRootFiles('packages')).toEqual([]);
  });
  test('fires on an undeclared root file', () => {
    expect(undeclaredRootFiles(`${FIX}/root-files/fail/packages`).length).toBeGreaterThan(0);
  });
});

describe('N3 no barrel files', () => {
  test('passes on the real packages tree', () => {
    expect(barrelFiles('packages')).toEqual([]);
  });
  test('passes on a barrel-free fixture', () => {
    expect(barrelFiles(`${FIX}/barrel/pass/packages`)).toEqual([]);
  });
  test('fires on a lib/index.ts barrel', () => {
    expect(barrelFiles(`${FIX}/barrel/fail/packages`).length).toBeGreaterThan(0);
  });
});

describe('N4 app and infra file placement', () => {
  test('appFileNames passes when *.use-case.ts is in lib/app', async () => {
    await passes(appFileNames(`${FIX}/app-file-names/pass`));
  });
  test('appFileNames fires when *.use-case.ts is in lib/domain', async () => {
    await fires(appFileNames(`${FIX}/app-file-names/fail`), 'naming');
  });
  test('infraFileNames passes when tables.ts is in lib/infra', async () => {
    await passes(infraFileNames(`${FIX}/infra-file-names/pass`));
  });
  test('infraFileNames fires when tables.ts is outside lib/infra', async () => {
    await fires(infraFileNames(`${FIX}/infra-file-names/fail`), 'naming');
  });
});

describe('N5 tables.ts singleton in lib/infra', () => {
  test('passes when tables.ts is a single lib/infra file', () => {
    expect(tablesViolations(`${FIX}/tables/pass/packages`)).toEqual([]);
  });
  test('fires when tables.ts is outside lib/infra', () => {
    expect(tablesViolations(`${FIX}/tables/fail/packages`).length).toBeGreaterThan(0);
  });
});

describe('N6 routes and command placement', () => {
  test('routesPlacement passes when *.routes.ts is under apps/server routes', async () => {
    await passes(routesPlacement(`${FIX}/routes/pass`));
  });
  test('routesPlacement fires when *.routes.ts is elsewhere', async () => {
    await fires(routesPlacement(`${FIX}/routes/fail`), 'naming');
  });
  test('commandsPlacement passes when *.command.ts is under apps/cli commands', async () => {
    await passes(commandsPlacement(`${FIX}/commands/pass`));
  });
  test('commandsPlacement fires when *.command.ts is elsewhere', async () => {
    await fires(commandsPlacement(`${FIX}/commands/fail`), 'naming');
  });
});

describe('N7 test file placement', () => {
  test('passes when a test file is under tests/', async () => {
    await passes(testFilePlacement(`${FIX}/test-placement/pass`));
  });
  test('fires when a test file is under lib/', async () => {
    await fires(testFilePlacement(`${FIX}/test-placement/fail`), 'naming');
  });
});

describe('N8 packages directory allow-list', () => {
  test('passes on the real packages tree', () => {
    expect(unexpectedPackageDirs('packages')).toEqual([]);
  });
  test('passes on an approved fixture package', () => {
    expect(unexpectedPackageDirs(`${FIX}/package-dirs/pass/packages`)).toEqual([]);
  });
  test('fires on an unapproved package directory', () => {
    expect(unexpectedPackageDirs(`${FIX}/package-dirs/fail/packages`).length).toBeGreaterThan(0);
  });
});

describe('N9 no generated-file imports', () => {
  test('passes when no hand-written file imports a *.gen.ts', async () => {
    await passes(noGeneratedImports(`${FIX}/generated-imports/pass`));
  });
  test('fires when a hand-written file imports a *.gen.ts', async () => {
    await fires(noGeneratedImports(`${FIX}/generated-imports/fail`), 'dependency');
  });
});
