import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClassifier } from '@authority/action';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { PolicyDocumentSchema, type PolicyDocument } from '@authority/policy/schema';
import { computeAdoption, computeDiff } from '@authority/replay/diff';
import { buildActionsForReplay } from '@authority/trace/client';
import { readEvidenceNumbers } from '../../scripts/check-evidence.ts';
import { parseArgs } from './lib/args.ts';
import { readCorpus } from './lib/corpus.ts';
import { enrichRepoRemotes } from './lib/enrich.ts';
import { runJourney } from './lib/evidence-journey.ts';
import { discoverTranscripts } from './measure.ts';
import { compareFigures } from './journey-smoke.ts';

const USAGE =
  'usage: pnpm tsx tools/local-pipeline/journey-check.ts [--fixture <dir>] [--out <dir>]';
const DEFAULT_FIXTURE = 'tests/fixtures/journey';

function loadDocument(path: string): PolicyDocument {
  return PolicyDocumentSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

/**
 * Runs the twelve-step journey, including `verify-audit`, against a compose
 * project of its own with an empty volume, then prints date, commit, and result.
 */
async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const fixture = resolve(flags.get('fixture') || DEFAULT_FIXTURE);
  const measured = new Date().toISOString().slice(0, 10);
  const commit = git(repoRoot, ['rev-parse', 'HEAD']);
  const expectedPath = join(fixture, 'expected.md');
  const { numbers: expected, failures } = readEvidenceNumbers(
    expectedPath,
    readFileSync(expectedPath, 'utf8'),
  );
  if (failures.length > 0 || expected.size === 0) {
    console.error(`${USAGE}\n${expectedPath} has no readable evidence-numbers block`);
    console.error(failures.join('\n'));
    process.exit(2);
  }
  const policies = {
    A: loadDocument(join(fixture, 'policy-a.json')),
    B: loadDocument(join(fixture, 'policy-b.json')),
    "B'": loadDocument(join(fixture, 'policy-bp.json')),
  };

  const snapshotDir = join(fixture, 'transcripts');
  const sessions = enrichRepoRemotes(readCorpus(discoverTranscripts(snapshotDir)).sessions);
  const { actions } = buildActionsForReplay(sessions, await createClassifier());
  const occurred = actions.map((action) => action.occurredAt).sort();
  const [from, to] = [occurred[0], occurred.at(-1)];
  if (from === undefined || to === undefined) {
    throw new Error('the fixture has no Actions');
  }

  const runDir = resolve(
    flags.get('out') ||
      join(repoRoot, '.local', 'journey-check', new Date().toISOString().replace(/[:.]/g, '-')),
  );
  mkdirSync(runDir, { recursive: true });

  const journey = await runJourney({
    repoRoot,
    runDir,
    snapshotDir,
    spoolDir: join(fixture, 'spool'),
    policyA: policies.A,
    policyB: policies.B,
    policyBp: policies["B'"],
    policyAContentHash: sha256Hex(canonicalJson(policies.A)),
    reviewWindow: { from, to },
    conformanceWindow: { from, to },
    localAdoption: computeAdoption({ actions, candidate: policies.A }),
    localB: computeDiff({ actions, baseline: policies.A, candidate: policies.B }),
    localBp: computeDiff({ actions, baseline: policies.A, candidate: policies["B'"] }),
  });
  const actual = new Map([
    ['classifier', journey.conformanceRun.classifierVersion],
    ...journey.figures,
  ]);
  writeFileSync(join(runDir, 'journey.json'), `${JSON.stringify(journey, null, 2)}\n`);
  const mismatches = compareFigures(expected, actual);
  const audit = journey.steps.find((step) => step.step.startsWith('12 '));
  const result =
    mismatches.length === 0
      ? `pass; ${audit?.result ?? 'verify-audit missing'}`
      : `fail; figures differ: ${mismatches.join('; ')}`;
  console.log(`${measured} ${commit} ${result}`);
  console.log(journey.steps.map((step) => `${step.step}: ${step.result}`).join('\n'));
  if (mismatches.length > 0) {
    console.error(
      `figures from this run:\n<!-- evidence-numbers\n${[...actual].map(([key, value]) => `${key}: ${value}`).join('\n')}\n-->`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
