import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { CLASSIFIER_VERSION, createClassifier } from '@authority/action';
import { IsoTimestampSchema } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { PolicyDocumentSchema, type PolicyDocument } from '@authority/policy/schema';
import { computeAdoption, computeDiff } from '@authority/replay/diff';
import type { ActionForReplay } from '@authority/trace/schema';
import { buildActionsForReplay } from '@authority/trace/client';
import { parseArgs } from './lib/args.ts';
import { readCorpus } from './lib/corpus.ts';
import {
  archiveMainSections,
  proseLinesWithDigits,
  replaceBlocks,
  replaceStamp,
  stampVersion,
} from './lib/evidence-doc.ts';
import { runJourney } from './lib/evidence-journey.ts';
import { createMasks, readLegend, writeLegend } from './lib/evidence-masks.ts';
import * as render from './lib/evidence-render.ts';
import type {
  AdoptionInput,
  Comparison,
  ConformanceInput,
  GateInput,
} from './lib/evidence-render.ts';
import { enrichRepoRemotes } from './lib/enrich.ts';
import { discoverTranscripts } from './measure.ts';

const USAGE = 'usage: pnpm evidence:remeasure [--config <file>] [--out <dir>]';

/** Gate 2 compares policy A with each candidate, in this order. */
const CANDIDATES = [
  { label: 'B', description: '`allow_unknown_remote_fetch`' },
  { label: "B'", description: 'B plus a host-wide `github.com/**` in `trustedRemotes`' },
  { label: 'P', description: '`push` + `trusted_remote` → allow' },
  { label: "P'", description: 'P plus the same `github.com/**`' },
] as const;

const WindowSchema = z.object({ from: IsoTimestampSchema, to: IsoTimestampSchema });

/** Every path points under `.local/`: the corpus, Policies, spool copies, and legend are private. */
const ConfigSchema = z.object({
  snapshot: z.string(),
  snapshotDate: z.string(),
  policies: z.object({
    A: z.string(),
    B: z.string(),
    "B'": z.string(),
    P: z.string(),
    "P'": z.string(),
  }),
  spool: z.string(),
  conformanceWindow: WindowSchema,
  legend: z.string(),
});

const DOCS = {
  gate: 'docs/evidence/gate2-replay.md',
  adoption: 'docs/evidence/adoption-preview.md',
  conformance: 'docs/evidence/conformance.md',
  readme: 'README.md',
};

function loadDocument(path: string): PolicyDocument {
  return PolicyDocumentSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function previousVersions(doc: string): string[] {
  return [...doc.matchAll(/^## Previous version: classifier (\S+)/gm)].map(
    (match) => match[1] ?? '',
  );
}

function timed<T>(task: () => T): { value: T; ms: number } {
  const startedAt = performance.now();
  const value = task();
  return { value, ms: Math.round(performance.now() - startedAt) };
}

interface Rendered {
  readonly stamp: string;
  readonly blocks: Map<string, string>;
}

/** Archives the main sections when the classifier changed, then rewrites the stamp and blocks. */
function rewrite(
  doc: string,
  renderFor: (current: string) => Rendered,
): { doc: string; archivedFrom: string | null } {
  const version = stampVersion(doc);
  const archivedFrom = version !== null && version !== CLASSIFIER_VERSION ? version : null;
  const current = archivedFrom === null ? doc : archiveMainSections(doc, archivedFrom);
  const { stamp, blocks } = renderFor(current);
  return { doc: replaceStamp(replaceBlocks(current, blocks), stamp), archivedFrom };
}

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const configPath = flags.get('config') || join(repoRoot, '.local', 'evidence-remeasure.json');
  let config: z.infer<typeof ConfigSchema>;
  try {
    config = ConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  } catch (error) {
    console.error(
      `${USAGE}\ncannot read ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
  const measured = new Date().toISOString().slice(0, 10);
  const runDir = resolve(
    flags.get('out') ||
      join(repoRoot, '.local', 'remeasure', new Date().toISOString().replace(/[:.]/g, '-')),
  );
  mkdirSync(runDir, { recursive: true });
  const legendPath = resolve(config.legend);
  const masks = createMasks(readLegend(legendPath));

  const policies = {
    A: loadDocument(config.policies.A),
    B: loadDocument(config.policies.B),
    "B'": loadDocument(config.policies["B'"]),
    P: loadDocument(config.policies.P),
    "P'": loadDocument(config.policies["P'"]),
  };

  console.error('local: classifying the snapshot');
  const files = discoverTranscripts(config.snapshot);
  const corpus = readCorpus(files);
  const sessions = enrichRepoRemotes(corpus.sessions);
  const classify = await createClassifier();
  const { actions, duplicateCount } = buildActionsForReplay(sessions, classify);
  const snapshot: render.SnapshotInfo = {
    label: basename(resolve(config.snapshot)),
    date: config.snapshotDate,
    files: files.length,
    sessions: sessions.length,
    actions: actions.length,
    duplicates: duplicateCount,
  };

  const comparisons: Comparison[] = CANDIDATES.map(({ label, description }) => {
    const run = (): ReturnType<typeof computeDiff> =>
      computeDiff({ actions, baseline: policies.A, candidate: policies[label] });
    const [first, second] = [run(), run()];
    if (canonicalJson(first) !== canonicalJson(second)) {
      throw new Error(`A vs ${label} differs between two runs`);
    }
    writeFileSync(
      join(runDir, `gate2-${label.replace("'", 'p')}.json`),
      `${JSON.stringify(first, null, 2)}\n`,
    );
    return { label, description, candidateFile: basename(config.policies[label]), diff: first };
  });
  console.error(
    `local: Gate 2 ${comparisons.map(({ label, diff }) => `A vs ${label} ${diff.resultHash.slice(0, 8)}`).join(', ')}`,
  );

  const adoptionRuns = [
    timed(() => computeAdoption({ actions, candidate: policies.A })),
    timed(() => computeAdoption({ actions, candidate: policies.A })),
  ] as const;
  const localAdoption = adoptionRuns[0].value;
  if (canonicalJson(localAdoption) !== canonicalJson(adoptionRuns[1].value)) {
    throw new Error('computeAdoption differs between two runs');
  }
  writeFileSync(join(runDir, 'adoption-local.json'), `${JSON.stringify(localAdoption, null, 2)}\n`);
  const sessionOf = new Map(
    actions.map((action: ActionForReplay) => [action.actionKey, action.sessionExternalId]),
  );
  const sessionsWithAskOrDeny = new Set(
    localAdoption.assignments.map((entry) => sessionOf.get(entry.actionKey)),
  ).size;
  const occurred = actions.map((action) => action.occurredAt).sort();
  const [firstAction, lastAction] = [occurred[0], occurred.at(-1)];
  if (firstAction === undefined || lastAction === undefined) {
    throw new Error('the snapshot has no Actions');
  }
  const gateB = comparisons[0]?.diff;
  const gateBp = comparisons[1]?.diff;
  if (gateB === undefined || gateBp === undefined) {
    throw new Error('Gate 2 comparisons are missing');
  }

  console.error('journey: fresh compose project');
  const journey = await runJourney({
    repoRoot,
    runDir,
    snapshotDir: resolve(config.snapshot),
    spoolDir: resolve(config.spool),
    policyA: policies.A,
    policyB: policies.B,
    policyBp: policies["B'"],
    policyAContentHash: sha256Hex(canonicalJson(policies.A)),
    reviewWindow: { from: firstAction, to: lastAction },
    conformanceWindow: config.conformanceWindow,
    localAdoption,
    localB: gateB,
    localBp: gateBp,
  });
  writeFileSync(join(runDir, 'journey.json'), `${JSON.stringify(journey, null, 2)}\n`);
  if (journey.conformanceRun.classifierVersion !== CLASSIFIER_VERSION) {
    throw new Error(
      `server classifier ${journey.conformanceRun.classifierVersion} differs from local ${CLASSIFIER_VERSION}`,
    );
  }
  const localSessions = new Map(
    localAdoption.groups.map((group) => [group.groupKey, group.sessionCount]),
  );
  const serverSessionDifference = journey.adoptionGroups.reduce(
    (sum, group) => sum + Math.abs(group.sessionCount - (localSessions.get(group.groupKey) ?? 0)),
    0,
  );

  const read = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');
  const gateDoc = read(DOCS.gate);
  const adoptionDoc = read(DOCS.adoption);
  const conformanceDoc = read(DOCS.conformance);

  const adoptionInput: AdoptionInput = {
    classifierVersion: CLASSIFIER_VERSION,
    measured,
    snapshot,
    environment: policies.A.environment,
    candidateContentHash: sha256Hex(canonicalJson(policies.A)),
    local: localAdoption,
    localWallTimesMs: [adoptionRuns[0].ms, adoptionRuns[1].ms],
    sessionsWithAskOrDeny,
    serverResultHash: journey.adoptionResultHash,
    serverSessionDifference,
    gateB,
    masks,
  };

  const gate = rewrite(gateDoc, (current) => {
    const input: GateInput = {
      classifierVersion: CLASSIFIER_VERSION,
      measured,
      snapshot,
      previousVersions: previousVersions(current),
      comparisons,
      masks,
    };
    return {
      stamp: render.renderGateStamp(input),
      blocks: new Map([
        ['gate2-intro', render.renderGateIntro(input)],
        ['gate2-comparisons', render.renderGateComparisons(input)],
        ['gate2-criteria', render.renderGateCriteria(input)],
      ]),
    };
  });
  const adoption = rewrite(adoptionDoc, () => ({
    stamp: render.renderAdoptionStamp(adoptionInput),
    blocks: new Map([
      ['adoption-intro', render.renderAdoptionIntro(adoptionInput)],
      ['adoption-result', render.renderAdoptionResult(adoptionInput)],
      ['adoption-groups', render.renderAdoptionGroups(adoptionInput)],
      ['adoption-determinism', render.renderAdoptionDeterminism(adoptionInput)],
      ['adoption-journey', render.renderJourney(journey.steps)],
    ]),
  }));
  const conformanceRun = journey.conformanceRun;
  if (
    conformanceRun.stats === null ||
    conformanceRun.resultHash === null ||
    conformanceRun.kind !== 'conformance'
  ) {
    throw new Error('the conformance run has no result');
  }
  const conformanceStats = conformanceRun.stats;
  const conformanceHash = conformanceRun.resultHash;
  const conformance = rewrite(conformanceDoc, (current) => {
    const input: ConformanceInput = {
      classifierVersion: CLASSIFIER_VERSION,
      measured,
      snapshot,
      previousVersions: previousVersions(current),
      window: config.conformanceWindow,
      imported: journey.imported,
      spool: journey.spool,
      resultHash: conformanceHash,
      stats: conformanceStats,
      findings: journey.conformance.items,
    };
    return {
      stamp: render.renderConformanceStamp(input),
      blocks: new Map([
        ['conformance-intro', render.renderConformanceIntro(input)],
        ['conformance-method', render.renderConformanceMethod(input)],
        ['conformance-findings', render.renderConformanceFindings(input)],
        ['conformance-under-asked', render.renderConformanceUnderAsked(input)],
      ]),
    };
  });
  const readme = replaceBlocks(
    read(DOCS.readme),
    new Map([['readme-adoption', render.renderReadmeAdoption(adoptionInput)]]),
  );

  for (const [path, doc] of [
    [DOCS.gate, gate.doc],
    [DOCS.adoption, adoption.doc],
    [DOCS.conformance, conformance.doc],
    [DOCS.readme, readme],
  ] as const) {
    writeFileSync(join(repoRoot, path), doc);
  }
  writeLegend(legendPath, masks.legend);

  for (const [path, result] of [
    [DOCS.gate, gate],
    [DOCS.adoption, adoption],
    [DOCS.conformance, conformance],
  ] as const) {
    if (result.archivedFrom !== null) {
      console.error(
        `${path}: classifier ${result.archivedFrom} sections moved under "Previous version"; re-check these prose lines:`,
      );
      for (const line of proseLinesWithDigits(result.doc)) {
        console.error(`  ${line}`);
      }
    }
  }
  console.log(
    `classifier ${CLASSIFIER_VERSION}; ${comparisons.map(({ label, diff }) => `A vs ${label} ${diff.resultHash}`).join('; ')}; adoption ${journey.adoptionResultHash} (server) ${localAdoption.resultHash} (local); conformance ${conformanceHash}; outputs in ${runDir}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
