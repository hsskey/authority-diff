import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BOUNDARY_ROOTS } from './boundary-roots.ts';

// Injects intentional architecture-boundary violations, confirms dependency-cruiser
// fails each one for its intended rule, then discards the fixtures. Exits non-zero if
// any injected violation did NOT fail for the expected rule (a vacuous pass).
// Source of truth: docs/cutline.md 16.2 clause 7.
//
// Every fixture is materialized in a throwaway directory under the OS temp root, never
// in the work tree: each proof gets a fresh synthetic tree seeded from a minimal
// scaffold, with the live .dependency-cruiser.cjs and tsconfig.base.json copied in at
// run time, and dependency-cruiser is run with its cwd set to that temp tree. The repo
// checkout is never written to or deleted, and the run asserts `git status --porcelain`
// is byte-identical before and after.

interface Proof {
  readonly id: string;
  readonly expected: readonly string[];
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}

// Real-structure targets that proof imports resolve to but do not themselves author.
// Present in every synthetic tree so relative imports resolve to the same paths the
// enforced rules match against.
const SCAFFOLD: ReadonlyArray<{ readonly path: string; readonly content: string }> = [
  {
    path: 'packages/kernel/lib/hash.ts',
    content: 'export function canonicalJson(_value: unknown): string {\n  return "";\n}\n',
  },
];

// Config files copied from the repo into each synthetic tree so the proof cruises the
// exact rules and TypeScript resolution the enforced check uses.
const COPIED_CONFIG = ['.dependency-cruiser.cjs', 'tsconfig.base.json'] as const;

const PROOFS: readonly Proof[] = [
  {
    id: '(a) kernel test imports its own lib -> tests-through-entrypoints',
    expected: ['tests-through-entrypoints'],
    files: [
      {
        path: 'packages/kernel/tests/zz_prove_a.ts',
        content:
          "import { canonicalJson } from '../lib/hash.ts';\nexport const a = canonicalJson({});\n",
      },
    ],
  },
  {
    id: '(b) kernel lib/domain imports node:fs -> domain-is-pure',
    expected: ['domain-is-pure'],
    files: [
      {
        path: 'packages/kernel/lib/domain/zz_prove_b.ts',
        content: "import * as fs from 'node:fs';\nexport const b = typeof fs;\n",
      },
    ],
  },
  {
    id: '(c) zz-proof package imports kernel lib -> entrypoint-boundary-across-packages',
    expected: ['entrypoint-boundary-across-packages'],
    files: [
      {
        path: 'packages/zz-proof/zz_prove_c.ts',
        content:
          "import { canonicalJson } from '../kernel/lib/hash.ts';\nexport const c = canonicalJson({});\n",
      },
    ],
  },
  {
    id: '(d) action/lib/domain imports platform -> package-layering or domain-is-pure',
    expected: ['package-layering', 'domain-is-pure'],
    files: [
      { path: 'packages/platform/index.ts', content: 'export const p = 1;\n' },
      {
        path: 'packages/action/lib/domain/zz_prove_d.ts',
        content: "import { p } from '../../../platform/index.ts';\nexport const d = p;\n",
      },
    ],
  },
  {
    id: '(e) contracts imports another package non-schema file -> contracts-schema-only',
    expected: ['contracts-schema-only'],
    files: [
      { path: 'packages/policy/evaluate.ts', content: 'export const e = 1;\n' },
      {
        path: 'packages/contracts/lib/zz_prove_e.ts',
        content: "import { e } from '../../policy/evaluate.ts';\nexport const ee = e;\n",
      },
    ],
  },
  {
    id: '(f) pure entry reaches lib/infra transitively -> pure-entry-points',
    expected: ['pure-entry-points'],
    files: [
      {
        path: 'packages/trace/client.ts',
        content: "import { parse } from './lib/client/parse.ts';\nexport const c = parse;\n",
      },
      {
        path: 'packages/trace/lib/client/parse.ts',
        content: "import { shared } from './shared.ts';\nexport const parse = shared;\n",
      },
      {
        path: 'packages/trace/lib/client/shared.ts',
        content: "import { db } from '../infra/db.ts';\nexport const shared = db;\n",
      },
      { path: 'packages/trace/lib/infra/db.ts', content: 'export const db = 1;\n' },
    ],
  },
  {
    id: '(g) tools file imports packages/kernel/lib -> entrypoint-boundary-from-app',
    expected: ['entrypoint-boundary-from-app'],
    files: [
      {
        path: 'tools/zz-proof/zz_prove_g.ts',
        content:
          "import { canonicalJson } from '../../packages/kernel/lib/hash.ts';\nexport const g = canonicalJson({});\n",
      },
    ],
  },
  {
    id: '(h) schema imports another package non-schema root -> schema-imports-schema-only',
    expected: ['schema-imports-schema-only'],
    files: [
      { path: 'packages/policy/evaluate.ts', content: 'export const h = 1;\n' },
      {
        path: 'packages/contracts/schema.ts',
        content: "import { h } from '../policy/evaluate.ts';\nexport const hh = h;\n",
      },
    ],
  },
];

/**
 * Resolves relPath against root and refuses any result outside root. The single
 * choke point every write in this script passes through, so no fixture can escape
 * the throwaway temp tree.
 */
export function resolveInsideRoot(root: string, relPath: string): string {
  const abs = resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`refusing to write outside the temp root: ${relPath}`);
  }
  return abs;
}

function writeInto(root: string, relPath: string, content: string): void {
  const abs = resolveInsideRoot(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function hasStdio(value: unknown): value is { stdout?: string; stderr?: string } {
  return typeof value === 'object' && value !== null;
}

function runDepcruise(repoRoot: string, tmpRoot: string, roots: readonly string[]): string {
  const depcruiseBin = join(repoRoot, 'node_modules', '.bin', 'depcruise');
  try {
    return execFileSync(
      depcruiseBin,
      [...roots, '--config', '.dependency-cruiser.cjs', '--output-type', 'err'],
      { cwd: tmpRoot, encoding: 'utf8' },
    );
  } catch (error) {
    if (hasStdio(error)) {
      return `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    }
    return '';
  }
}

function gitStatus(repoRoot: string): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
}

function removeTempRoot(tmpRoot: string, tempBase: string): void {
  // Cleanup only ever deletes inside the OS temp base, never a repo path.
  if (tmpRoot !== tempBase && !tmpRoot.startsWith(tempBase + sep)) {
    throw new Error(`refusing to delete outside the temp base: ${tmpRoot}`);
  }
  rmSync(tmpRoot, { recursive: true, force: true });
}

function runProof(proof: Proof, repoRoot: string, tempBase: string): string {
  const tmpRoot = realpathSync(mkdtempSync(join(tempBase, 'authority-proof-')));
  try {
    for (const name of COPIED_CONFIG) {
      writeInto(tmpRoot, name, readFileSync(join(repoRoot, name), 'utf8'));
    }
    for (const file of [...SCAFFOLD, ...proof.files]) {
      writeInto(tmpRoot, file.path, file.content);
    }
    const roots = BOUNDARY_ROOTS.filter((dir) => existsUnder(tmpRoot, dir));
    return runDepcruise(repoRoot, tmpRoot, roots);
  } finally {
    removeTempRoot(tmpRoot, tempBase);
  }
}

function existsUnder(root: string, relPath: string): boolean {
  try {
    realpathSync(resolveInsideRoot(root, relPath));
    return true;
  } catch {
    return false;
  }
}

export interface ProofRunResult {
  readonly allPassed: boolean;
  readonly gitStable: boolean;
  readonly lines: readonly string[];
}

/**
 * Runs every proof against fresh temp trees and reports whether each violation fired
 * and whether the repo working tree was left byte-identical. Never calls process.exit
 * so it stays callable from tests.
 */
export function runAllProofs(repoRoot: string): ProofRunResult {
  const tempBase = realpathSync(tmpdir());
  const gitBefore = gitStatus(repoRoot);
  const lines: string[] = [];
  let allPassed = true;
  for (const proof of PROOFS) {
    const output = runProof(proof, repoRoot, tempBase);
    const fired = proof.expected.find(
      (rule) => output.includes(`error ${rule}`) || output.includes(rule),
    );
    if (fired === undefined) {
      allPassed = false;
      lines.push(`FAIL ${proof.id}`);
      lines.push(`  expected one of: ${proof.expected.join(', ')}`);
      lines.push(`  depcruise output:\n${output}`);
    } else {
      lines.push(`PASS ${proof.id} (fired: ${fired})`);
    }
  }
  const gitStable = gitStatus(repoRoot) === gitBefore;
  return { allPassed, gitStable, lines };
}

function main(): void {
  const result = runAllProofs(process.cwd());
  for (const line of result.lines) {
    if (line.startsWith('FAIL') || line.startsWith('  ')) {
      console.error(line);
    } else {
      console.log(line);
    }
  }
  if (!result.gitStable) {
    console.error('prove-boundaries: the work tree changed during the run.');
    process.exit(1);
  }
  if (!result.allPassed) {
    console.error('prove-boundaries: a boundary rule did not fail as expected.');
    process.exit(1);
  }
  console.log('prove-boundaries: every intentional violation failed for its intended rule.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
