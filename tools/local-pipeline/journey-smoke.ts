import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { runJourneyAt } from './lib/evidence-journey.ts';
import { discoverTranscripts } from './measure.ts';

const USAGE = 'usage: pnpm smoke:journey [--fixture <dir>] [--server <url>]';
const DEFAULT_FIXTURE = 'tests/fixtures/journey';
const DEFAULT_SERVER = 'http://localhost:8787';

/** Every key either side names, with the expected and the actual value when they differ. */
export function compareFigures(
  expected: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, string>,
): string[] {
  return [...new Set([...expected.keys(), ...actual.keys()])]
    .filter((key) => expected.get(key) !== actual.get(key))
    .map(
      (key) =>
        `${key}: expected ${expected.get(key) ?? '(none)'}, got ${actual.get(key) ?? '(none)'}`,
    );
}

function loadDocument(path: string): PolicyDocument {
  return PolicyDocumentSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * Runs the twelve-step journey against a server with an empty volume on the
 * synthetic fixture and compares its figures with the fixture's
 * evidence-numbers block.
 */
async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const fixture = resolve(flags.get('fixture') || DEFAULT_FIXTURE);
  const serverUrl = flags.get('server') || DEFAULT_SERVER;
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

  const runDir = mkdtempSync(join(tmpdir(), 'authority-journey-'));
  try {
    const journey = await runJourneyAt(serverUrl, {
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
    const mismatches = compareFigures(expected, actual);
    if (mismatches.length > 0) {
      console.error(`journey figures differ from ${expectedPath}:\n${mismatches.join('\n')}`);
      console.error(
        `figures from this run:\n<!-- evidence-numbers\n${[...actual].map(([key, value]) => `${key}: ${value}`).join('\n')}\n-->`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(journey.steps.map((step) => `${step.step}: ${step.result}`).join('\n'));
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
