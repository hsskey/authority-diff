import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverTranscripts, parseSessions } from '../measure.ts';

const fixtures = join(import.meta.dirname, 'fixtures');

describe('discoverTranscripts', () => {
  it('finds .jsonl transcripts under the root', () => {
    expect(discoverTranscripts(fixtures).map((file) => basename(file))).toEqual([
      'synthetic-session.jsonl',
    ]);
  });
});

describe('parseSessions', () => {
  it('parses each transcript into a session keyed by the file stem', () => {
    const sessions = parseSessions(discoverTranscripts(fixtures));
    expect(sessions.map((session) => session.sessionExternalId)).toEqual(['synthetic-session']);
  });
});
