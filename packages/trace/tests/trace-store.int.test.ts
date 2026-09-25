import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  createDatabase,
  createSystemClock,
  createUlidGenerator,
  parseConfig,
} from '@authority/platform';
import type { Database } from '@authority/platform';
import { IsoTimestampSchema } from '@authority/kernel';
import { deriveActionKey, parseTranscript } from '@authority/trace/client';
import type { ParsedSession } from '@authority/trace/schema';
import { createTraceModule, type TraceModule } from '../index.ts';

// Matches docker-compose.test.yml, run via `pnpm test:int`.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';

const ids = createUlidGenerator();

let database: Database;
let module: TraceModule;

beforeAll(() => {
  const config = parseConfig({
    AUTHORITY_DB_URL: TEST_DB_URL,
    AUTHORITY_AUTH_TOKEN: 'test-token',
    AUTHORITY_DB_POOL_MAX: '4',
  });
  if (!config.ok) {
    throw new Error('test config failed to parse');
  }
  database = createDatabase(config.value);
  module = createTraceModule({
    database,
    clock: createSystemClock(),
    idGenerator: createUlidGenerator(),
  });
});

afterAll(async () => {
  await database.close();
});

/**
 * One Bash read whose successful result quotes a runtime block marker. It
 * occurs before every review test window (from 2025-12-01) in the shared
 * database, so their replays never see it.
 */
function markerQuotingSession(sessionExternalId: string): ParsedSession {
  return parseTranscript({
    sessionExternalId,
    lines: [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2025-06-01T03:04:05.000Z',
        cwd: '/Users/synth/proj',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'read-1', name: 'Bash', input: { command: 'cat notes.md' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        timestamp: '2025-06-01T03:04:06.000Z',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'read-1',
              is_error: false,
              content: 'notes.md:3: <tool_use_error>Blocked: sleep 99</tool_use_error>',
            },
          ],
        },
      }),
    ],
  });
}

describe('re-importing a stored Action', () => {
  test('refreshes a misclassified observedOutcome and keeps every other stored field', async () => {
    const sessionExternalId = ids.next('session');
    const current = markerQuotingSession(sessionExternalId);
    const misclassified: ParsedSession = {
      ...current,
      toolCalls: current.toolCalls.map((call) => ({
        ...call,
        observedOutcome: 'blocked_by_runtime' as const,
      })),
    };
    const actionKey = deriveActionKey({
      runtime: 'claude_code',
      sessionExternalId,
      toolUseId: 'read-1',
      sequence: 0,
    });
    await module.importTrace(misclassified);
    const [stored] = await module.reader.getActions([actionKey]);

    await module.importTrace(current);

    expect(await module.reader.getActions([actionKey])).toEqual([
      { ...stored, observedOutcome: 'executed' },
    ]);
  });

  test('counts the refreshed Action as a duplicate, not a new row', async () => {
    const current = markerQuotingSession(ids.next('session'));
    await module.importTrace({
      ...current,
      toolCalls: current.toolCalls.map((call) => ({
        ...call,
        observedOutcome: 'rejected_by_human' as const,
      })),
    });

    const result = await module.importTrace(current);

    expect(result).toMatchObject({ ok: true, value: { acceptedCount: 0, duplicateCount: 1 } });
  });
});

describe('listing observation times', () => {
  // A window no other test writes into, since the database is shared.
  const WINDOW = {
    from: IsoTimestampSchema.parse('2031-03-01T00:00:00.000Z'),
    to: IsoTimestampSchema.parse('2031-03-07T23:59:59.999Z'),
  };

  function hookObservation(sessionExternalId: string, occurredAt: string) {
    return {
      event: 'pre_tool_use' as const,
      sessionExternalId,
      toolUseId: null,
      toolName: 'Bash',
      toolInputHash: null,
      hookDecision: null,
      permissionMode: null,
      cwd: null,
      runtimeVersion: null,
      occurredAt: IsoTimestampSchema.parse(occurredAt),
    };
  }

  test('returns each distinct time inside the window once, ascending', async () => {
    const session = `synthetic-times-${ids.next('ses')}`;
    await module.ingestObservations({
      runtime: 'claude_code',
      observations: [
        hookObservation(session, '2031-03-05T00:00:00.000Z'),
        hookObservation(`${session}-other`, '2031-03-05T00:00:00.000Z'),
        hookObservation(session, '2031-03-01T00:00:00.000Z'),
        hookObservation(session, '2031-03-08T00:00:00.000Z'),
      ],
    });

    const times = await module.reader.listObservationTimes(WINDOW);

    expect(times).toEqual(['2031-03-01T00:00:00.000Z', '2031-03-05T00:00:00.000Z']);
  });
});
