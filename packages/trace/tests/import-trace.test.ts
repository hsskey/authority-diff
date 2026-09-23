import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { createClassifier } from '@authority/action';
import type { ClassifyToolCall } from '@authority/action/schema';
import { parseTranscript } from '@authority/trace/client';
import { createInMemoryTraceStore, createTestTraceModule } from '@authority/trace/testing';
import type { ImportTraceResult } from '@authority/trace';

const here = dirname(fileURLToPath(import.meta.url));

function loadCanarySession(): ReturnType<typeof parseTranscript> {
  const lines = readFileSync(join(here, 'fixtures/canaries.jsonl'), 'utf8').split('\n');
  return parseTranscript({ sessionExternalId: 'canary-session', lines });
}

// Every synthetic secret literal that redaction must scrub before storage.
const CANARY_SECRETS: readonly string[] = [
  'ghp_SYNTHETICCANARY000000000',
  'sk-ant-SYNTHETICCANARY0000',
  'sk-SYNTHETICCANARY0000000',
  'AKIASYNTHETIC0000000',
  'xoxb-SYNTHETIC-CANARY-000',
  'glpat-SYNTHETICCANARY00000',
  'npm_SYNTHETICCANARY000000000000000',
  'SYNTHBEARERTOKEN0001',
  'synthuser:synthpass',
  'syntheticvalue0001',
  'SYNTHKEYLINE0001',
  'eyJSYNTHHEADER0.eyJSYNTHPAYLOAD0.SYNTHSIGNATURE0',
];

function unwrap(
  result: Awaited<ReturnType<ReturnType<typeof createTestTraceModule>['importTrace']>>,
): ImportTraceResult {
  if (!result.ok) {
    throw new Error(`import failed: ${result.error.code}`);
  }
  return result.value;
}

let classify: ClassifyToolCall;

beforeAll(async () => {
  classify = await createClassifier();
});

describe('I5 idempotent import', () => {
  test('re-importing the same batch with the order shuffled stores no duplicate', async () => {
    const module = createTestTraceModule({ classify });
    const session = loadCanarySession();
    const total = session.toolCalls.length;

    const first = unwrap(await module.importTrace(session));
    const shuffled = { ...session, toolCalls: [...session.toolCalls].reverse() };
    const second = unwrap(await module.importTrace(shuffled));

    expect(first.acceptedCount).toBe(total);
    expect(first.duplicateCount).toBe(0);
    expect(second.acceptedCount).toBe(0);
    expect(second.duplicateCount).toBe(total);
    expect(module.store.dump().actions.length).toBe(total);
  });
});

describe('NUL in tool input', () => {
  test('imports a session whose Bash command contained NUL without rejecting it', async () => {
    const module = createTestTraceModule({ classify });
    const session = parseTranscript({
      sessionExternalId: '3866289f-22bc-484f-a410-5d01a4980ca2',
      lines: [
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-01-02T03:04:05.000Z',
          cwd: '/Users/synth/proj',
          gitBranch: 'feature/synthetic',
          version: '9.9.9-synthetic',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'nul-tool',
                name: 'Bash',
                input: { command: 'node -e "console.log(`a\x00b`)"' },
              },
            ],
          },
        }),
      ],
    });
    const result = unwrap(await module.importTrace(session));
    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    const stored = module.store.dump().actions[0];
    expect(stored?.toolInputRedacted.includes('\0')).toBe(false);
    expect(JSON.stringify(stored?.operations).includes('\\u0000')).toBe(false);
  });

  test('returns a 422 Result when storage rejects the import', async () => {
    const base = createInMemoryTraceStore();
    const module = createTestTraceModule({
      classify,
      store: {
        ...base,
        writeImport: () =>
          Promise.reject(
            Object.assign(new Error('unsupported Unicode escape sequence'), {
              cause: { code: '22P05' },
            }),
          ),
      },
    });
    const session = loadCanarySession();
    const result = await module.importTrace(session);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected import to fail');
    }
    expect(result.error.code).toBe('trace.import_rejected');
  });

  test('rethrows a transient storage failure instead of mapping it to 422', async () => {
    const module = createTestTraceModule({
      classify,
      store: {
        ...createInMemoryTraceStore(),
        writeImport: () =>
          Promise.reject(Object.assign(new Error('connection terminated'), { code: 'ECONNRESET' })),
      },
    });
    await expect(module.importTrace(loadCanarySession())).rejects.toThrow('connection terminated');
  });
});

describe('I8 canary', () => {
  let dump: string;
  let storedActionCount: number;

  beforeAll(async () => {
    const module = createTestTraceModule({ classify });
    const result = unwrap(await module.importTrace(loadCanarySession()));
    storedActionCount = result.acceptedCount;
    dump = JSON.stringify(module.store.dump());
  });

  test('the canary batch is actually stored redacted', () => {
    expect(storedActionCount).toBe(12);
    expect(dump.includes('__REDACTED_')).toBe(true);
  });

  test.each(CANARY_SECRETS)('no canary secret survives a full table dump: %s', (secret) => {
    expect(dump.includes(secret)).toBe(false);
  });
});
