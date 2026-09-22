import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClassifier } from '@authority/action';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { createEvaluator, validatePolicyDocument } from '@authority/policy/evaluate';
import {
  EnvironmentProfileSchema,
  PolicyDocumentSchema,
  type PolicyDocument,
  type PolicyIssue,
} from '@authority/policy/schema';
import { computeDiff } from '@authority/replay/diff';
import { buildActionsForReplay } from '@authority/trace/client';
import type { ActionForReplay } from '@authority/trace/schema';
import { parseArgs } from './lib/args.ts';
import { readCorpus } from './lib/corpus.ts';
import { enrichRepoRemotes } from './lib/enrich.ts';
import { buildGroupSample, renderReplayMarkdown } from './lib/replay-report.ts';
import { buildActionMeta, discoverTranscripts } from './measure.ts';

const USAGE =
  'usage: pnpm dev:replay-local --transcripts <dir> --baseline <a.json> --candidate <b.json> [--env <profile.json>] [--out <dir>] [--seed <n>]';

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadDocument(path: string): PolicyDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read policy document ${path}: ${errorMessage(error)}`);
  }
  const parsed = PolicyDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    fail(`policy document ${path} is structurally invalid:\n${parsed.error.message}`);
  }
  return parsed.data;
}

function withEnvironment(document: PolicyDocument, envPath: string): PolicyDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(envPath, 'utf8'));
  } catch (error) {
    fail(`cannot read environment profile ${envPath}: ${errorMessage(error)}`);
  }
  const parsed = EnvironmentProfileSchema.safeParse(raw);
  if (!parsed.success) {
    fail(`environment profile ${envPath} is invalid:\n${parsed.error.message}`);
  }
  return { ...document, environment: parsed.data };
}

function reportIssues(label: string, issues: readonly PolicyIssue[]): void {
  for (const issue of issues) {
    console.error(`${label}: [${issue.code}] ${issue.ruleId ?? '-'} ${issue.message}`);
  }
}

function contentHash(document: PolicyDocument): string {
  return sha256Hex(canonicalJson(document));
}

async function main(): Promise<void> {
  const { flags } = parseArgs(process.argv.slice(2));
  const transcripts = flags.get('transcripts');
  const baselinePath = flags.get('baseline');
  const candidatePath = flags.get('candidate');
  if (
    transcripts === undefined ||
    baselinePath === undefined ||
    candidatePath === undefined ||
    transcripts === '' ||
    baselinePath === '' ||
    candidatePath === ''
  ) {
    fail(USAGE);
  }
  if (statSync(transcripts, { throwIfNoEntry: false })?.isDirectory() !== true) {
    fail(`not a directory: ${transcripts}`);
  }

  const envPath = flags.get('env');
  let baseline = loadDocument(baselinePath);
  let candidate = loadDocument(candidatePath);
  if (envPath !== undefined && envPath !== '') {
    baseline = withEnvironment(baseline, envPath);
    candidate = withEnvironment(candidate, envPath);
  }

  const outDir = flags.get('out') ?? join(process.cwd(), '.local', 'replay');
  mkdirSync(join(outDir, 'groups'), { recursive: true });

  if (envPath !== undefined && envPath !== '') {
    writeFileSync(
      join(outDir, 'policy-baseline.resolved.json'),
      `${JSON.stringify(baseline, null, 2)}\n`,
    );
    writeFileSync(
      join(outDir, 'policy-candidate.resolved.json'),
      `${JSON.stringify(candidate, null, 2)}\n`,
    );
  }

  const baselineIssues = validatePolicyDocument(baseline);
  const candidateIssues = validatePolicyDocument(candidate);
  if (baselineIssues.length > 0 || candidateIssues.length > 0) {
    reportIssues('baseline', baselineIssues);
    reportIssues('candidate', candidateIssues);
    console.error(
      `policy validation failed: ${String(baselineIssues.length + candidateIssues.length)} issue(s)`,
    );
    process.exit(1);
  }

  // --seed keeps sampleActionKeys reproducible; selection is a stable sort in
  // computeDiff, so the flag is accepted for interface stability.
  const corpus = readCorpus(discoverTranscripts(transcripts));
  const sessions = enrichRepoRemotes(corpus.sessions);
  const meta = buildActionMeta(sessions);
  const classify = await createClassifier();
  const { actions } = buildActionsForReplay(sessions, classify);
  const actionsByKey = new Map<string, ActionForReplay>(
    actions.map((action) => [action.actionKey, action]),
  );

  const diff = computeDiff({ actions, baseline, candidate });

  writeFileSync(join(outDir, 'replay.json'), `${JSON.stringify(diff, null, 2)}\n`);
  writeFileSync(
    join(outDir, 'replay.md'),
    renderReplayMarkdown({
      diff,
      actions,
      baselineContentHash: contentHash(baseline),
      candidateContentHash: contentHash(candidate),
    }),
  );

  const evaluateBaseline = createEvaluator(baseline);
  const evaluateCandidate = createEvaluator(candidate);
  for (const group of diff.groups) {
    const sample = buildGroupSample(group, actionsByKey, meta, evaluateBaseline, evaluateCandidate);
    writeFileSync(
      join(outDir, 'groups', `${group.groupKey}.json`),
      `${JSON.stringify(sample, null, 2)}\n`,
    );
  }

  const wideningGroups = diff.groups.filter((group) => group.direction === 'widening').length;
  const criticalGroups = diff.groups.filter((group) => group.severity === 'critical').length;
  console.error(`wrote ${outDir}/{replay.json,replay.md,groups/*}`);
  console.log(
    `resultHash ${diff.resultHash} changed ${String(diff.stats.changedActions)} widening ${String(wideningGroups)} critical ${String(criticalGroups)}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
