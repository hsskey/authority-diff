import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A document declares the numbers it states in one block after its stamp:
 *
 *   <!-- evidence-numbers
 *   adoption.allow: 15,242
 *   -->
 *
 * The classifier version comes from the stamp (`; classifier 0.2.3;`), or from
 * a `classifier` key when the document has no stamp.
 */
const NUMBERS_BLOCK_RE = /^<!-- evidence-numbers\n([\s\S]*?)^-->$/m;
const NUMBER_LINE_RE = /^([A-Za-z0-9'._-]+): (.+)$/;
const STAMP_VERSIONS_RE = /; classifier (\d+\.\d+\.\d+)(?: → (\d+\.\d+\.\d+))?(?:;|$)/;
const PREVIOUS_HEADING_RE = /^## Previous version/;
const SHORT_HASH_RE = /^([0-9a-f]{8})…([0-9a-f]{4})$/;
const VERSION_MENTION_RE = /\bclassifier(?:Version)?:? [*`]*(\d+\.\d+\.\d+)/g;

export interface EvidenceDocument {
  readonly path: string;
  readonly text: string;
}

export type CheckEvidenceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly string[] };

interface MainLine {
  readonly number: number;
  readonly text: string;
}

interface ParsedDocument {
  readonly path: string;
  /** Every version the stamp names; a comparison stamp `0.2.1 → 0.2.2` names two. */
  readonly versions: readonly string[];
  readonly numbers: ReadonlyMap<string, string>;
  /** Lines outside the numbers block and every "Previous version" section. */
  readonly main: readonly MainLine[];
  readonly failures: readonly string[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A short hash `2c4577fa…a8d9` also matches the full sha256 it abbreviates. */
function valuePattern(value: string): string {
  const hash = SHORT_HASH_RE.exec(value);
  return hash === null ? escapeRegExp(value) : `${hash[1]}(?:…|[0-9a-f]{52})${hash[2]}`;
}

function containsValue(lines: readonly MainLine[], value: string): boolean {
  const pattern = new RegExp(`(?<![\\w.,])${valuePattern(value)}(?![\\w]|[.,]\\d)`);
  return lines.some((line) => pattern.test(line.text));
}

/** Reads the evidence-numbers block of a document; a document without one has no numbers. */
export function readEvidenceNumbers(
  path: string,
  text: string,
): { numbers: Map<string, string>; failures: string[] } {
  const numbers = new Map<string, string>();
  const failures: string[] = [];
  const body = NUMBERS_BLOCK_RE.exec(text)?.[1] ?? '';
  for (const line of body.split('\n').filter((entry) => entry.trim() !== '')) {
    const match = NUMBER_LINE_RE.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      failures.push(`${path}: evidence-numbers line is not "key: value": ${line}`);
    } else if (numbers.has(match[1])) {
      failures.push(`${path}: evidence-numbers declares ${match[1]} twice`);
    } else {
      numbers.set(match[1], match[2].trim());
    }
  }
  return { numbers, failures };
}

function parse({ path, text }: EvidenceDocument): ParsedDocument {
  const lines = text.split('\n');
  const stamp = STAMP_VERSIONS_RE.exec(lines[0] ?? '');
  const stampVersions = [stamp?.[1], stamp?.[2]].filter((version) => version !== undefined);
  const block = NUMBERS_BLOCK_RE.exec(text);
  const { numbers, failures } = readEvidenceNumbers(path, text);

  const blockStart = block === null ? -1 : text.slice(0, block.index).split('\n').length - 1;
  const blockEnd = block === null ? -1 : blockStart + block[0].split('\n').length - 1;
  const previousAt = lines.findIndex((line) => PREVIOUS_HEADING_RE.test(line));
  const main = lines
    .map((line, index) => ({ number: index + 1, text: line }))
    .slice(0, previousAt === -1 ? undefined : previousAt)
    .filter(({ number }) => number - 1 < blockStart || number - 1 > blockEnd);

  const declared = numbers.get('classifier');
  if (declared !== undefined && stampVersions.length > 0 && !stampVersions.includes(declared)) {
    failures.push(`${path}: evidence-numbers classifier ${declared} differs from the stamp`);
  }
  const versions =
    stampVersions.length > 0 ? stampVersions : declared === undefined ? [] : [declared];
  if (numbers.size > 0 && versions.length === 0) {
    failures.push(`${path}: evidence-numbers needs a classifier version in the stamp or the block`);
  }
  return { path, versions, numbers, main, failures };
}

function missingValues(doc: ParsedDocument): string[] {
  return [...doc.numbers]
    .filter(([, value]) => !containsValue(doc.main, value))
    .map(
      ([key, value]) =>
        `${doc.path}: ${key} is ${value} in evidence-numbers but not in the main sections`,
    );
}

function mixedVersions(doc: ParsedDocument): string[] {
  if (doc.versions.length === 0) {
    return [];
  }
  return doc.main.flatMap(({ number, text }) =>
    [...text.matchAll(VERSION_MENTION_RE)]
      .map((match) => match[1] ?? '')
      .filter((version) => !doc.versions.includes(version))
      .map(
        (version) =>
          `${doc.path}:${String(number)}: classifier ${version} outside a "Previous version" section of a classifier ${doc.versions.join(' → ')} document`,
      ),
  );
}

/** Numbers belong to the last version a stamp names; each key has one value per version. */
function disagreements(docs: readonly ParsedDocument[]): string[] {
  const seen = new Map<string, { path: string; value: string }>();
  const failures: string[] = [];
  for (const doc of docs) {
    const version = doc.versions.at(-1);
    if (version === undefined) {
      continue;
    }
    for (const [key, value] of doc.numbers) {
      const id = `${version}\0${key}`;
      const first = seen.get(id);
      if (first === undefined) {
        seen.set(id, { path: doc.path, value });
      } else if (first.value !== value) {
        failures.push(
          `${key} on classifier ${version}: ${first.path} says ${first.value}, ${doc.path} says ${value}`,
        );
      }
    }
  }
  return failures;
}

export function checkEvidence(documents: readonly EvidenceDocument[]): CheckEvidenceResult {
  const docs = documents.map(parse);
  const failures = [
    ...docs.flatMap((doc) => [...doc.failures, ...missingValues(doc), ...mixedVersions(doc)]),
    ...disagreements(docs),
  ];
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

function main(): void {
  const root = join(fileURLToPath(import.meta.url), '../..');
  const evidenceDir = join(root, 'docs/evidence');
  const paths = [
    'README.md',
    'README.ko.md',
    ...readdirSync(evidenceDir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => `docs/evidence/${name}`),
  ];
  const result = checkEvidence(
    paths.map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') })),
  );
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
