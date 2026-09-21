import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseTranscript } from '../client.ts';
import { devTranscriptDir } from './dev-transcript-source.config.ts';

// Runs only when AUTHORITY_DEV_TRANSCRIPT_DIR points at real local transcripts;
// skipped in CI. It asserts the parser never throws on real data and that fewer
// than 5% of lines are unparseable. No transcript content is asserted.
const suite = devTranscriptDir === undefined ? describe.skip : describe;

suite('local real transcripts', () => {
  test('parses every real transcript without throwing and under 5% unparsed', () => {
    const dir = devTranscriptDir;
    if (dir === undefined) {
      return;
    }
    const entries = readdirSync(dir, { recursive: true });
    const files = entries
      .map((entry) => (typeof entry === 'string' ? entry : entry.toString()))
      .filter((name) => name.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThan(0);

    let totalLines = 0;
    let unparsedLines = 0;
    for (const file of files) {
      const path = join(dir, file);
      const lines = readFileSync(path, 'utf8').split('\n');
      const parsed = parseTranscript({ sessionExternalId: basename(file, '.jsonl'), lines });
      totalLines += parsed.totalLineCount;
      unparsedLines += parsed.unparsedLineCount;
    }

    expect(totalLines).toBeGreaterThan(0);
    expect(unparsedLines / totalLines).toBeLessThan(0.05);
  });
});
