import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { sha256Hex } from '@authority/kernel/hash';
import { runSpoolFlush } from '../src/commands/spool-flush.command.ts';
import { makeTempHome } from './support/harness.ts';
import { isRecord, readNullableString } from './support/record.ts';
import { restoreEnv, setEnv, snapshotEnv } from './support/env.config.ts';

// A synthetic spool line in exactly the shape the hook writer appends.
function observationLine(sessionId: string): string {
  return JSON.stringify({
    event: 'permission_request',
    timestamp: new Date().toISOString(),
    sessionId,
    toolName: 'Bash',
    toolInputHash: sha256Hex(sessionId),
    cwd: '/tmp/project',
    runtimeVersion: '2.1.0',
  });
}

function spoolDir(home: string): string {
  const directory = join(home, '.authority', 'spool');
  mkdirSync(directory, { recursive: true });
  return directory;
}

interface StubServer {
  readonly url: string;
  readonly receivedSessionIds: () => string[];
  readonly receivedObservations: () => unknown[];
  readonly close: () => Promise<void>;
}

// Accepts every runtime-observations POST with 201 and records which session ids
// actually reached the server, so a test can prove the good files really drained.
async function startStubServer(): Promise<StubServer> {
  const received: string[] = [];
  const observations: unknown[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
    });
    req.on('end', () => {
      try {
        const body: unknown = JSON.parse(raw);
        if (isRecord(body) && Array.isArray(body.observations)) {
          for (const observation of body.observations) {
            observations.push(observation);
            if (isRecord(observation)) {
              const id = readNullableString(observation, 'sessionExternalId');
              if (id !== null) {
                received.push(id);
              }
            }
          }
        }
      } catch {
        // A malformed POST body would be a CLI defect; leave it unrecorded.
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ acceptedCount: 0, duplicateCount: 0 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('stub server did not bind a TCP port');
  }
  const { port } = address;
  return {
    url: `http://127.0.0.1:${port}`,
    receivedSessionIds: () => [...received],
    receivedObservations: () => [...observations],
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe('authority spool-flush fail-open', () => {
  let stub: StubServer;
  const savedEnv = snapshotEnv();

  beforeEach(async () => {
    stub = await startStubServer();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await stub.close();
    restoreEnv(savedEnv);
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  test('a single poisoned line or file never aborts the flush', async () => {
    const home = makeTempHome();
    const directory = spoolDir(home);

    // Sorted order is a, b, c, d. b holds two poison lines the fixed reader must
    // skip; c is a `.jsonl`-named directory whose readFileSync throws EISDIR.
    // Both preceded a good file (a) and precede a good file (d): before the fix
    // either poison propagated out of the loop and d never drained.
    writeFileSync(join(directory, 'a-good.jsonl'), `${observationLine('sess-a')}\n`);
    writeFileSync(
      join(directory, 'b-mixed.jsonl'),
      [
        '{"event":"permission_request"', // truncated JSON -> JSON.parse would throw
        JSON.stringify({
          event: 'permission_request',
          timestamp: 'not-a-timestamp', // valid JSON, invalid IsoTimestamp
          sessionId: 'sess-b-bad-ts',
          toolName: 'Bash',
          toolInputHash: 'h',
          cwd: '/w',
          runtimeVersion: '1',
        }),
        observationLine('sess-b'), // the one line that must survive and post
      ].join('\n') + '\n',
    );
    mkdirSync(join(directory, 'c-baddir.jsonl')); // readFileSync -> EISDIR
    writeFileSync(join(directory, 'd-good.jsonl'), `${observationLine('sess-d')}\n`);

    setEnv({
      HOME: home,
      AUTHORITY_CLI_TOKEN: 'test-token',
      AUTHORITY_CLI_SERVER_URL: stub.url,
    });

    const stdout: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      stdout.push(line);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // 1. The command completes without throwing (before the fix a poison line or
    //    the EISDIR directory rejected out of the loop).
    await expect(runSpoolFlush()).resolves.toBeUndefined();

    const summary: unknown = JSON.parse(stdout.join('\n'));
    if (!isRecord(summary)) {
      throw new Error(`expected a summary object, got: ${stdout.join('\n')}`);
    }
    expect(summary.sentFiles).toBe(3); // a, b, d
    expect(summary.failedFiles).toBe(1); // c (the bad directory)
    expect(process.exitCode).toBe(1); // failedFiles > 0

    // 2. Every good file drained: renamed to .sent, original gone.
    for (const name of ['a-good.jsonl', 'b-mixed.jsonl', 'd-good.jsonl']) {
      expect(existsSync(join(directory, name))).toBe(false);
      expect(existsSync(join(directory, `${name}.sent`))).toBe(true);
    }

    // 3. The bad directory is counted failed and left untouched for a later retry.
    expect(statSync(join(directory, 'c-baddir.jsonl')).isDirectory()).toBe(true);
    expect(existsSync(join(directory, 'c-baddir.jsonl.sent'))).toBe(false);

    // 4. The good observations actually reached the server, poison lines dropped.
    const received = stub.receivedSessionIds().sort();
    expect(received).toEqual(['sess-a', 'sess-b', 'sess-d']);
  });

  test('forwards pre_tool_use and permission_request lines with toolUseId and hookDecision', async () => {
    const home = makeTempHome();
    const timestamp = new Date().toISOString();
    const line = (event: string, hookDecision: string | null) =>
      JSON.stringify({
        event,
        timestamp,
        sessionId: 'sess-joined',
        toolName: 'Bash',
        toolInputHash: sha256Hex('input'),
        toolUseId: 'toolu_joined',
        hookDecision,
        cwd: '/tmp/project',
        runtimeVersion: '2.1.0',
      });
    writeFileSync(
      join(spoolDir(home), 'a.jsonl'),
      `${line('pre_tool_use', null)}\n${line('permission_request', 'allow')}\n`,
    );
    setEnv({ HOME: home, AUTHORITY_CLI_TOKEN: 'test-token', AUTHORITY_CLI_SERVER_URL: stub.url });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runSpoolFlush();

    expect(stub.receivedObservations()).toEqual([
      {
        event: 'pre_tool_use',
        sessionExternalId: 'sess-joined',
        toolUseId: 'toolu_joined',
        toolName: 'Bash',
        toolInputHash: sha256Hex('input'),
        hookDecision: null,
        cwd: '/tmp/project',
        runtimeVersion: '2.1.0',
        occurredAt: timestamp,
      },
      {
        event: 'permission_request',
        sessionExternalId: 'sess-joined',
        toolUseId: 'toolu_joined',
        toolName: 'Bash',
        toolInputHash: sha256Hex('input'),
        hookDecision: 'allow',
        cwd: '/tmp/project',
        runtimeVersion: '2.1.0',
        occurredAt: timestamp,
      },
    ]);
  });
});
