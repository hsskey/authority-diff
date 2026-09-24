import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INVARIANT_DOCS = ['docs/design.md', 'docs/cutline.md'] as const;

export type DocShape = {
  readonly headings: readonly string[];
  readonly numbers: readonly string[];
  readonly tableRowCounts: readonly number[];
};

export type DocInvarianceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly string[] };

const HEADING_RE = /^(#{1,6})\s+(?:(\d+(?:\.\d+)*)\.?(?:\s|$))?/;
const NUMBER_RE = /\d{1,3}(?:,\d{3})+|\d+/g;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}/;

export function extractDocShape(markdown: string): DocShape {
  const lines = markdown.split('\n');
  const headings: string[] = [];
  const numbers: string[] = [];
  const tableRowCounts: number[] = [];
  let tableRows = 0;
  let inTable = false;

  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    if (heading?.[1] !== undefined && line.startsWith('#')) {
      headings.push(heading[2] === undefined ? heading[1] : `${heading[1]} ${heading[2]}`);
    }
    for (const token of line.match(NUMBER_RE) ?? []) {
      numbers.push(token);
    }
    if (TABLE_ROW_RE.test(line)) {
      inTable = true;
      if (!TABLE_SEP_RE.test(line)) {
        tableRows += 1;
      }
    } else if (inTable) {
      tableRowCounts.push(tableRows);
      tableRows = 0;
      inTable = false;
    }
  }
  if (inTable) {
    tableRowCounts.push(tableRows);
  }

  return {
    headings,
    numbers: [...numbers].sort((left, right) => left.localeCompare(right, 'en', { numeric: true })),
    tableRowCounts,
  };
}

function sameList(
  left: readonly string[] | readonly number[],
  right: readonly string[] | readonly number[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function compareDocShapes(
  before: DocShape,
  after: DocShape,
  path: string,
): DocInvarianceResult {
  const failures: string[] = [];
  if (!sameList(before.headings, after.headings)) {
    failures.push(`${path}: heading list changed`);
  }
  if (!sameList(before.numbers, after.numbers)) {
    failures.push(`${path}: extracted numeric set changed`);
  }
  if (!sameList(before.tableRowCounts, after.tableRowCounts)) {
    failures.push(`${path}: table row counts changed`);
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

export function snapshotPathFor(docPath: string, fixtureDir: string): string {
  const name = docPath.replaceAll('/', '__').replace(/\.md$/, '.json');
  return join(fixtureDir, name);
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNumberList(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number');
}

export function parseDocShape(text: string): DocShape {
  const parsed: unknown = JSON.parse(text);
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('headings' in parsed) ||
    !('numbers' in parsed) ||
    !('tableRowCounts' in parsed) ||
    !isStringList(parsed.headings) ||
    !isStringList(parsed.numbers) ||
    !isNumberList(parsed.tableRowCounts)
  ) {
    throw new Error('invalid doc shape snapshot');
  }
  return {
    headings: parsed.headings,
    numbers: parsed.numbers,
    tableRowCounts: parsed.tableRowCounts,
  };
}

export function checkDocInvariance(
  documents: readonly { path: string; text: string; snapshot: DocShape }[],
): DocInvarianceResult {
  const failures = documents.flatMap((doc) => {
    const result = compareDocShapes(doc.snapshot, extractDocShape(doc.text), doc.path);
    return result.ok ? [] : [...result.failures];
  });
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

function repoRoot(): string {
  return join(fileURLToPath(import.meta.url), '../..');
}

export function fixtureDir(root = repoRoot()): string {
  return join(root, 'scripts/fixtures/doc-invariance');
}

function loadDocuments(root: string): { path: string; text: string; snapshot: DocShape }[] {
  const fixtures = fixtureDir(root);
  return INVARIANT_DOCS.map((path) => ({
    path,
    text: readFileSync(join(root, path), 'utf8'),
    snapshot: parseDocShape(readFileSync(snapshotPathFor(path, fixtures), 'utf8')),
  }));
}

function writeSnapshots(root: string): void {
  const fixtures = fixtureDir(root);
  mkdirSync(fixtures, { recursive: true });
  for (const path of INVARIANT_DOCS) {
    const shape = extractDocShape(readFileSync(join(root, path), 'utf8'));
    writeFileSync(snapshotPathFor(path, fixtures), `${JSON.stringify(shape, null, 2)}\n`);
  }
}

function main(): void {
  const root = repoRoot();
  if (process.argv.includes('--write-snapshots')) {
    writeSnapshots(root);
    return;
  }
  const result = checkDocInvariance(loadDocuments(root));
  if (result.ok) {
    return;
  }
  for (const failure of result.failures) {
    process.stderr.write(`${failure}\n`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
