import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// File-existence, counting, and directory-enumeration rules. archunit reports a
// zero-match rule as a failure, which is the wrong sense for "these files must not
// exist", and it cannot read package.json. These rules use node:fs instead
// (docs/cutline.md 15; report allows a stdlib predicate in the same arch test).
//
// Each function returns the list of offending paths: empty means the rule holds.

// packages/ direct directories allowed by docs/design.md 33.3 (new package = ACR).
export const ALLOWED_PACKAGES = [
  'kernel',
  'platform',
  'contracts',
  'action',
  'trace',
  'policy',
  'replay',
  'review',
  'probe',
  'audit',
];

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
}

function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function collectTsTargets(node: unknown, into: Set<string>): void {
  if (typeof node === 'string') {
    if (node.endsWith('.ts')) {
      into.add(basename(node));
    }
    return;
  }
  if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node)) {
      collectTsTargets(value, into);
    }
  }
}

// The root .ts files a package publicly declares through package.json "exports".
function declaredRootFiles(packageDir: string): Set<string> {
  const allowed = new Set<string>(['index.ts']);
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    return allowed;
  }
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (parsed !== null && typeof parsed === 'object' && 'exports' in parsed) {
    collectTsTargets(parsed.exports, allowed);
  }
  return allowed;
}

// N2: a package root may hold only the .ts files it declares in package.json exports.
export function undeclaredRootFiles(packagesDir: string): string[] {
  const offenders: string[] = [];
  for (const pkg of listDirs(packagesDir)) {
    const packageDir = join(packagesDir, pkg);
    const allowed = declaredRootFiles(packageDir);
    for (const name of readdirSync(packageDir)) {
      const full = join(packageDir, name);
      if (name.endsWith('.ts') && statSync(full).isFile() && !allowed.has(name)) {
        offenders.push(full);
      }
    }
  }
  return offenders;
}

// N3: no barrel files - lib/**/index.ts is forbidden.
export function barrelFiles(packagesDir: string): string[] {
  return walkTsFiles(packagesDir).filter(
    (path) => /\/lib\/(?:.*\/)?index\.ts$/.test(path),
  );
}

// N5: tables.ts appears at most once per package and only under lib/infra.
export function tablesViolations(packagesDir: string): string[] {
  const offenders: string[] = [];
  for (const pkg of listDirs(packagesDir)) {
    const tables = walkTsFiles(join(packagesDir, pkg)).filter(
      (path) => basename(path) === 'tables.ts',
    );
    for (const path of tables) {
      if (!/\/lib\/infra\//.test(path)) {
        offenders.push(path);
      }
    }
    if (tables.length > 1) {
      offenders.push(...tables);
    }
  }
  return [...new Set(offenders)];
}

// N8: packages/ holds only the approved package directories.
export function unexpectedPackageDirs(packagesDir: string): string[] {
  return listDirs(packagesDir)
    .filter((name) => !ALLOWED_PACKAGES.includes(name))
    .map((name) => join(packagesDir, name));
}
