import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import rule from '../oxlint-import-depth.ts';

// Drives the registered Oxlint rule's real create()/report() visitor with synthetic
// import nodes and asserts what it reports. No linter binary is spawned and no source
// text is scraped: this exercises the rule's public interface directly. It encodes the
// enforced acceptance criteria for the same-package import-depth rule: forbid a
// relative import that climbs two or more levels and stays inside the package; leave
// sibling "./x", one-level "../x", and any relative path that leaves the package
// (cross-package, which is dependency-cruiser's job) untouched.

const repoRoot = join(import.meta.dirname, '..', '..');
const visitor = rule.rules['no-deep-relative-import'];

function reportsFor(relFilename: string, specifier: string, kind = 'ImportDeclaration'): number {
  let count = 0;
  const handlers = visitor.create({
    filename: join(repoRoot, relFilename),
    report: () => {
      count += 1;
    },
  });
  const node = { source: { type: 'Literal', value: specifier } };
  switch (kind) {
    case 'ExportAllDeclaration':
      handlers.ExportAllDeclaration(node);
      break;
    case 'ImportExpression':
      handlers.ImportExpression(node);
      break;
    default:
      handlers.ImportDeclaration(node);
  }
  return count;
}

describe('no-deep-relative-import', () => {
  it('reports a same-package relative import that climbs two levels to the package root', () => {
    expect(reportsFor('packages/kernel/lib/domain/x.ts', '../../index.ts')).toBe(1);
  });

  it('reports a same-package relative import that climbs two levels into a sibling subtree', () => {
    expect(reportsFor('packages/kernel/lib/infra/deep/x.ts', '../../domain/bar.ts')).toBe(1);
  });

  it('reports the same violation inside an app package (apps/web src)', () => {
    expect(
      reportsFor('apps/web/src/features/change-review/x.tsx', '../../shared/api-client.ts'),
    ).toBe(1);
  });

  it('allows a sibling "./x" import', () => {
    expect(reportsFor('packages/kernel/lib/domain/x.ts', './bar.ts')).toBe(0);
  });

  it('allows a one-level "../x" import', () => {
    expect(reportsFor('packages/kernel/lib/domain/x.ts', '../shared.ts')).toBe(0);
  });

  it('leaves a cross-package deep relative import to dependency-cruiser (does not report)', () => {
    expect(reportsFor('packages/replay/lib/domain/x.ts', '../../../kernel/index.ts')).toBe(0);
  });

  it('ignores a non-literal (dynamic) import source without crashing', () => {
    const handlers = visitor.create({
      filename: join(repoRoot, 'packages/kernel/lib/x.ts'),
      report: () => {},
    });
    let count = 0;
    const dynamicHandlers = visitor.create({
      filename: join(repoRoot, 'packages/kernel/lib/domain/x.ts'),
      report: () => {
        count += 1;
      },
    });
    dynamicHandlers.ImportExpression({ source: { type: 'TemplateLiteral' } });
    expect(handlers.ImportDeclaration).toBeTypeOf('function');
    expect(count).toBe(0);
  });

  it('applies to export-from statements, not only imports', () => {
    expect(
      reportsFor('packages/kernel/lib/domain/x.ts', '../../index.ts', 'ExportAllDeclaration'),
    ).toBe(1);
  });
});
