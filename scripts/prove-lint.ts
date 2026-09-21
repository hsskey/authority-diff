import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Injects one deliberate violation per preserved lint behavior, confirms Oxlint
// reports it for the intended rule, then removes the fixture. Exits non-zero if
// any injected violation did NOT fire (a vacuous pass). This is the lint
// counterpart of scripts/prove-boundaries.ts. The 14 behaviors are the lint
// contract carried over from ESLint; source of truth: .oxlintrc.json.

interface Proof {
  readonly id: string;
  readonly rule: string;
  readonly typeAware: boolean;
  readonly path: string;
  readonly content: string;
}

const LIB = 'packages/kernel/lib';
const DOMAIN = 'packages/kernel/lib/domain';

const PROOFS: readonly Proof[] = [
  {
    id: '1 floating promise',
    rule: 'no-floating-promises',
    typeAware: true,
    path: `${LIB}/zz_prove_floating.ts`,
    content:
      'async function makePromise(): Promise<number> {\n  return 1;\n}\nexport function run(): void {\n  makePromise();\n}\n',
  },
  {
    id: '2 async without await',
    rule: 'require-await',
    typeAware: true,
    path: `${LIB}/zz_prove_require_await.ts`,
    content: 'export async function f(): Promise<number> {\n  return 1;\n}\n',
  },
  {
    id: '3 new Date() in lib/domain',
    rule: 'no-restricted-globals',
    typeAware: false,
    path: `${DOMAIN}/zz_prove_newdate.ts`,
    content: 'export const d = new Date();\n',
  },
  {
    id: '4 Math.random() in lib/domain',
    rule: 'no-restricted-properties',
    typeAware: false,
    path: `${DOMAIN}/zz_prove_random.ts`,
    content: 'export const r = Math.random();\n',
  },
  {
    id: '5 process.env outside designated config files',
    rule: 'no-process-env',
    typeAware: false,
    path: `${LIB}/zz_prove_env.ts`,
    content: 'export const e = process.env.FOO;\n',
  },
  {
    id: '6 type assertion (as T)',
    rule: 'consistent-type-assertions',
    typeAware: false,
    path: `${LIB}/zz_prove_assert.ts`,
    content: 'export const x = 1 as number;\n',
  },
  {
    id: '7 unnecessary type assertion',
    rule: 'no-unnecessary-type-assertion',
    typeAware: true,
    path: `${LIB}/zz_prove_unnecessary.ts`,
    content: "const s: string = 'x';\nexport const t = s as string;\n",
  },
  {
    id: '8 explicit any',
    rule: 'no-explicit-any',
    typeAware: false,
    path: `${LIB}/zz_prove_any.ts`,
    content: 'export const x: any = 1;\n',
  },
  {
    id: '9 unsafe assignment',
    rule: 'no-unsafe-assignment',
    typeAware: true,
    path: `${LIB}/zz_prove_unsafe.ts`,
    content: 'const bad: any = 1;\nexport const n: number = bad;\n',
  },
  {
    id: '10 console',
    rule: 'no-console',
    typeAware: false,
    path: `${LIB}/zz_prove_console.ts`,
    content: "export function log(): void {\n  console.log('x');\n}\n",
  },
  {
    id: '11 non-null assertion',
    rule: 'no-non-null-assertion',
    typeAware: false,
    path: `${LIB}/zz_prove_nonnull.ts`,
    content: 'const o: { a?: number } = {};\nexport const y = o.a!;\n',
  },
  {
    id: '12 non-exhaustive switch',
    rule: 'switch-exhaustiveness-check',
    typeAware: true,
    path: `${LIB}/zz_prove_switch.ts`,
    content:
      "type Shape = 'a' | 'b';\nexport function pick(s: Shape): number {\n  switch (s) {\n    case 'a':\n      return 1;\n  }\n  return 0;\n}\n",
  },
  {
    id: '13 default export',
    rule: 'no-default-export',
    typeAware: false,
    path: `${LIB}/zz_prove_default.ts`,
    content: 'const x = 1;\nexport default x;\n',
  },
  {
    id: '14 drizzle-orm import outside lib/infra and platform',
    rule: 'no-restricted-imports',
    typeAware: false,
    path: `${LIB}/zz_prove_drizzle.ts`,
    content: "import { sql } from 'drizzle-orm';\nexport const q = sql;\n",
  },
];

const root = process.cwd();
const oxlintBin = join(root, 'node_modules', '.bin', 'oxlint');

function hasStdio(value: unknown): value is { stdout?: string; stderr?: string } {
  return typeof value === 'object' && value !== null;
}

function runOxlint(proof: Proof): string {
  const args = proof.typeAware ? ['--type-aware', proof.path] : [proof.path];
  try {
    return execFileSync(oxlintBin, args, { cwd: root, encoding: 'utf8' });
  } catch (error) {
    if (hasStdio(error)) {
      return `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    }
    return '';
  }
}

let allPassed = true;
for (const proof of PROOFS) {
  const abs = join(root, proof.path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, proof.content);
  const output = runOxlint(proof);
  rmSync(abs, { force: true });
  if (output.includes(`(${proof.rule})`)) {
    console.log(`PASS ${proof.id} (fired: ${proof.rule})`);
  } else {
    allPassed = false;
    console.error(`FAIL ${proof.id}`);
    console.error(`  expected rule: ${proof.rule}`);
    console.error(`  oxlint output:\n${output}`);
  }
}

if (!allPassed) {
  console.error('prove-lint: a lint rule did not fire as expected.');
  process.exit(1);
}
console.log('prove-lint: every intentional violation fired for its intended rule.');
