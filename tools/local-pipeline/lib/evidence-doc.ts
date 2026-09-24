/**
 * Evidence documents keep every measured table and stat line between
 * `<!-- remeasure:<name> -->` and `<!-- /remeasure:<name> -->`; prose outside
 * those blocks is written by people. A measurement document's first line is
 * the stamp (corpus snapshot, classifier version, resultHash).
 */

const BLOCK_RE = /<!-- remeasure:([a-z0-9-]+) -->\n([\s\S]*?)<!-- \/remeasure:\1 -->/g;
const MARKER_LINE_RE = /^<!-- \/?remeasure:[a-z0-9-]+ -->$/;
const PREVIOUS_HEADING_RE = /^## Previous version/m;
const STAMP_VERSION_RE = /; classifier (\S+);/;

export function blockNames(doc: string): string[] {
  return [...doc.matchAll(BLOCK_RE)].map((match) => match[1] ?? '');
}

/**
 * Replaces the body of every block. The document and `blocks` must name the
 * same blocks, so a renamed or forgotten block fails instead of going stale.
 */
export function replaceBlocks(doc: string, blocks: ReadonlyMap<string, string>): string {
  const inDoc = blockNames(doc);
  const missing = [...blocks.keys()].filter((name) => !inDoc.includes(name));
  const unrendered = inDoc.filter((name) => !blocks.has(name));
  if (missing.length > 0 || unrendered.length > 0) {
    throw new Error(
      `block mismatch: missing in document [${missing.join(', ')}], not rendered [${unrendered.join(', ')}]`,
    );
  }
  return doc.replace(BLOCK_RE, (_match, name: string) => {
    const body = blocks.get(name) ?? '';
    return `<!-- remeasure:${name} -->\n${body.endsWith('\n') ? body : `${body}\n`}<!-- /remeasure:${name} -->`;
  });
}

export function stampVersion(doc: string): string | null {
  const firstLine = doc.slice(0, doc.indexOf('\n'));
  return STAMP_VERSION_RE.exec(firstLine)?.[1] ?? null;
}

function splitMain(doc: string): { stamp: string; main: string; previous: string } {
  const newline = doc.indexOf('\n');
  const stamp = doc.slice(0, newline);
  const body = doc.slice(newline + 1);
  const previousAt = body.search(PREVIOUS_HEADING_RE);
  return previousAt === -1
    ? { stamp, main: body, previous: '' }
    : { stamp, main: body.slice(0, previousAt), previous: body.slice(previousAt) };
}

/** The main sections without the title and block markers, one heading level down. */
function archive(main: string): string {
  const lines = main.replace(/^\n+/, '').split('\n');
  const withoutTitle = lines[0]?.startsWith('# ') === true ? lines.slice(1) : lines;
  return withoutTitle
    .filter((line) => !MARKER_LINE_RE.test(line))
    .map((line) => (/^#{2,5} /.test(line) ? `#${line}` : line))
    .join('\n')
    .replace(/^\n+/, '');
}

/**
 * Freezes the current main sections as the newest "Previous version" section
 * when the classifier version changed, so a document never mixes versions.
 * The main sections keep their prose for a person to revise.
 */
export function archiveMainSections(doc: string, previousVersion: string): string {
  const { stamp, main, previous } = splitMain(doc);
  const archived = `## Previous version: classifier ${previousVersion} (not re-run)\n\n${archive(main).replace(/\n*$/, '\n')}`;
  return `${stamp}\n${main.replace(/\n*$/, '\n\n')}${archived}${previous === '' ? '' : `\n${previous}`}`;
}

export function replaceStamp(doc: string, stamp: string): string {
  return `${stamp}${doc.slice(doc.indexOf('\n'))}`;
}

/** Lines in the main sections outside any block that carry a digit: prose a person re-checks. */
export function proseLinesWithDigits(doc: string): string[] {
  const { main } = splitMain(doc);
  return main
    .replace(BLOCK_RE, '')
    .split('\n')
    .filter((line) => /\d/.test(line));
}
