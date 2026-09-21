import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { existingBoundaryRoots } from './boundary-roots.ts';

// Injects intentional architecture-boundary violations, confirms dependency-cruiser
// fails each one for its intended rule, then removes the fixtures. Exits non-zero if
// any injected violation did NOT fail for the expected rule (a vacuous pass).
// Source of truth: docs/cutline.md 16.2 clause 7.

interface Proof {
  readonly id: string;
  readonly expected: readonly string[];
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}

// Fixture directories to remove between and after proofs. `tools` is created only
// by proof (g); it does not exist in the tracked tree today.
const TEMP_PACKAGE_DIRS = [
  'packages/zz-proof',
  'packages/platform',
  'packages/action',
  'packages/contracts',
  'packages/policy',
  'packages/trace',
  'tools',
];

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
];

const root = process.cwd();
const depcruiseBin = join(root, 'node_modules', '.bin', 'depcruise');

function hasStdio(value: unknown): value is { stdout?: string; stderr?: string } {
  return typeof value === 'object' && value !== null;
}

function runDepcruise(): string {
  try {
    return execFileSync(depcruiseBin, [...existingBoundaryRoots(), '--output-type', 'err'], {
      cwd: root,
      encoding: 'utf8',
    });
  } catch (error) {
    if (hasStdio(error)) {
      return `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    }
    return '';
  }
}

function cleanup(proof: Proof): void {
  for (const file of proof.files) {
    rmSync(join(root, file.path), { force: true });
  }
  for (const dir of TEMP_PACKAGE_DIRS) {
    rmSync(join(root, dir), { recursive: true, force: true });
  }
}

// Clear any leftovers from an interrupted run before starting.
for (const dir of TEMP_PACKAGE_DIRS) {
  rmSync(join(root, dir), { recursive: true, force: true });
}

let allPassed = true;
for (const proof of PROOFS) {
  for (const file of proof.files) {
    mkdirSync(join(root, dirname(file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }
  const output = runDepcruise();
  const fired = proof.expected.find(
    (rule) => output.includes(`error ${rule}`) || output.includes(rule),
  );
  cleanup(proof);
  if (fired === undefined) {
    allPassed = false;
    console.error(`FAIL ${proof.id}`);
    console.error(`  expected one of: ${proof.expected.join(', ')}`);
    console.error(`  depcruise output:\n${output}`);
  } else {
    console.log(`PASS ${proof.id} (fired: ${fired})`);
  }
}

if (!allPassed) {
  console.error('prove-boundaries: a boundary rule did not fail as expected.');
  process.exit(1);
}
console.log('prove-boundaries: every intentional violation failed for its intended rule.');
