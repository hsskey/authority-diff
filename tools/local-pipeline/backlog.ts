import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLASSIFIER_VERSION, createClassifier } from '@authority/action';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { buildActionsForReplay } from '@authority/trace/client';
import { parseArgs } from './lib/args.ts';
import { computeBacklog, type Backlog } from './lib/backlog.ts';
import { readCorpus } from './lib/corpus.ts';
import { enrichRepoRemotes } from './lib/enrich.ts';
import { createMasks, readLegend, writeLegend } from './lib/evidence-masks.ts';
import { discoverTranscripts } from './measure.ts';

const USAGE = 'usage: pnpm dev:backlog <transcript-directory> [--legend <file>] [--out <dir>]';

function pct(part: number, whole: number): string {
  return whole === 0 ? '0.0%' : `${((part * 100) / whole).toFixed(1)}%`;
}

function table(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const line = (cells: readonly (string | number)[]): string =>
    `| ${cells.map((cell) => (typeof cell === 'number' ? cell.toLocaleString('en-US') : cell)).join(' | ')} |`;
  const align = header.map((_, index) => (index === 0 ? '---' : '---:'));
  return [line(header), line(align), ...rows.map(line)].join('\n');
}

function render(backlog: Backlog, maskProgram: (name: string) => string): string {
  return [
    `Evaluated Actions ${backlog.evaluatedActions.toLocaleString('en-US')}, \`none\` Actions ${backlog.noneActions.toLocaleString('en-US')}; Operations ${backlog.operations.toLocaleString('en-US')}, \`none\` Operations ${backlog.noneOperations.toLocaleString('en-US')}.`,
    '',
    table(
      ['signal', '`none` Operations', '`none` Actions', 'sole-cause Actions'],
      backlog.noneSignals.map((row) => [
        `\`${row.key}\``,
        row.noneOperations,
        row.noneActions,
        row.soleActions,
      ]),
    ),
    '',
    table(
      ['program', 'Operations', '`none` Operations', '`none` share', 'sole-cause Actions'],
      backlog.programs.map((row) => [
        `\`${row.key === '' ? '(empty name)' : maskProgram(row.key)}\``,
        row.operations,
        row.noneOperations,
        pct(row.noneOperations, row.operations),
        row.soleActions,
      ]),
    ),
    '',
    table(
      ['target kind', 'Operations', 'share', 'full', 'partial', 'none'],
      backlog.targetKinds.map((row) => [
        `\`${row.key}\``,
        row.operations,
        pct(row.operations, backlog.operations),
        row.full,
        row.partial,
        row.none,
      ]),
    ),
    '',
    table(
      [
        'candidate',
        'matched Operations',
        '`none` Operations',
        '`none` Actions',
        'Actions leaving `none`',
      ],
      backlog.candidates.map((row) => [
        `\`${row.key}\``,
        row.matchedOperations,
        row.noneOperations,
        row.noneActions,
        row.gainActions,
      ]),
    ),
    '',
    `All candidates together: ${backlog.candidatesCombinedGainActions.toLocaleString('en-US')} Actions leave \`none\`.`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const root = positionals[0];
  if (root === undefined || statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    console.error(USAGE);
    process.exit(2);
  }
  const legendPath = resolve(flags.get('legend') || join('.local', 'evidence-legend.json'));
  const masks = createMasks(readLegend(legendPath));

  const files = discoverTranscripts(root);
  const sessions = enrichRepoRemotes(readCorpus(files).sessions);
  const { actions } = buildActionsForReplay(sessions, await createClassifier());
  const backlog = computeBacklog(actions);
  const resultHash = sha256Hex(canonicalJson(backlog));

  const outDir = resolve(flags.get('out') || join('.local', 'backlog'));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'backlog.json'), `${JSON.stringify(backlog, null, 2)}\n`);
  writeFileSync(
    join(outDir, 'backlog.md'),
    render(backlog, (name) => (name === '(no program)' ? name : masks.program(name))),
  );
  writeLegend(legendPath, masks.legend);
  console.log(
    `snapshot ${basename(resolve(root))} (${files.length} files, ${actions.length} Actions); classifier ${CLASSIFIER_VERSION}; resultHash ${resultHash}`,
  );
  console.log(`wrote ${outDir}/{backlog.json,backlog.md}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
