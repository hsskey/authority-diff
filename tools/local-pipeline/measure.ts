import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClassifier } from '@authority/action';
import { buildActionsForReplay, deriveActionKey, parseTranscript } from '@authority/trace/client';
import type { ParsedSession } from '@authority/trace/schema';
import { computeMetrics, type ActionMeta } from './lib/aggregate.ts';
import { renderMeasureMarkdown, selectSamples } from './lib/report.ts';

export function discoverTranscripts(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found.sort();
}

export function parseSessions(files: readonly string[]): ParsedSession[] {
  return files.map((file) =>
    parseTranscript({
      sessionExternalId: basename(file, '.jsonl'),
      lines: readFileSync(file, 'utf8').split('\n'),
    }),
  );
}

export function buildActionMeta(sessions: readonly ParsedSession[]): Map<string, ActionMeta> {
  const meta = new Map<string, ActionMeta>();
  for (const session of sessions) {
    for (const toolCall of session.toolCalls) {
      const actionKey = deriveActionKey({
        runtime: session.runtime,
        sessionExternalId: session.sessionExternalId,
        toolUseId: toolCall.toolUseId,
        sequence: toolCall.sequence,
      });
      if (!meta.has(actionKey)) {
        meta.set(actionKey, { toolName: toolCall.toolName, isSidechain: toolCall.isSidechain });
      }
    }
  }
  return meta;
}

async function main(): Promise<void> {
  const root = process.argv[2];
  if (root === undefined) {
    console.error('usage: pnpm dev:measure <transcript-directory>');
    process.exit(2);
  }
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    console.error(`not a directory: ${root}`);
    process.exit(2);
  }

  const sessions = parseSessions(discoverTranscripts(root));
  const meta = buildActionMeta(sessions);
  const classify = await createClassifier();
  const startedAt = Date.now();
  const { actions, duplicateCount } = buildActionsForReplay(sessions, classify);
  const classifyMs = Date.now() - startedAt;

  const metrics = computeMetrics({ sessions, actions, duplicateCount, meta, classifyMs });
  const samples = selectSamples(actions, meta);

  const outDir = join(process.cwd(), '.local', 'measure');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'measure.md'), renderMeasureMarkdown(metrics));
  writeFileSync(join(outDir, 'samples-full.json'), `${JSON.stringify(samples.full, null, 2)}\n`);
  writeFileSync(
    join(outDir, 'samples-none.json'),
    `${JSON.stringify({ records: samples.none, topPrograms: samples.noneTopPrograms }, null, 2)}\n`,
  );

  const none = metrics.analyzabilityByAction;
  const noneRatio =
    none.full + none.partial + none.none === 0
      ? 0
      : none.none / (none.full + none.partial + none.none);
  console.log(`sessions ${metrics.sessions}`);
  console.log(
    `actions ${metrics.actionsAfterDedup} (evaluated ${metrics.evaluatedActions}, excluded ${metrics.excludedActions}, duplicates ${metrics.duplicateCount})`,
  );
  console.log(
    `bash ${(metrics.bashRatio * 100).toFixed(1)}%  none-by-action ${(noneRatio * 100).toFixed(1)}%`,
  );
  console.log(`classify ${metrics.classifyActionsPerSecond.toFixed(1)} actions/sec`);
  console.log(`wrote ${outDir}/{measure.md,samples-full.json,samples-none.json}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
