import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseTranscript } from '@authority/trace/client';
import type { ParsedSession } from '@authority/trace/schema';

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

function main(): void {
  const root = process.argv[2];
  if (root === undefined) {
    console.error('usage: pnpm dev:measure <projects-dir>');
    process.exit(2);
  }
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory() !== true) {
    console.error(`not a directory: ${root}`);
    process.exit(2);
  }
  const files = discoverTranscripts(root);
  const sessions = parseSessions(files);
  console.log(`transcripts ${files.length}`);
  console.log(`sessions ${sessions.length}`);
  console.log(
    'measure report pending: classifier (@authority/action) and the final measure contract',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
