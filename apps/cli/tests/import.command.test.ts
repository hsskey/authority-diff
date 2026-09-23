import { createServer, type Server } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { runImport } from '../src/commands/import.command.ts';
import { makeTempHome } from './support/harness.ts';
import { isRecord, readNullableString } from './support/record.ts';
import { restoreEnv, setEnv, snapshotEnv } from './support/env.config.ts';

// A valid ImportTraceResponse body for the sessions the stub accepts.
const OK_BODY = JSON.stringify({
  importId: 'imp_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  acceptedCount: 1,
  duplicateCount: 0,
  rejectedCount: 0,
});

// One assistant tool_use line: the smallest transcript parseTranscript accepts
// as a Session with a single action. cwd points at a path with no git remotes.
function transcriptLine(): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-01-02T03:04:05.000Z',
    cwd: '/Users/synth/proj',
    gitBranch: 'b',
    version: 'v',
    isSidechain: false,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'x' } }],
    },
  });
}

function transcriptDir(home: string): string {
  const directory = join(home, 'transcripts');
  mkdirSync(directory, { recursive: true });
  return directory;
}

interface StubServer {
  readonly url: string;
  readonly acceptedSessionIds: () => string[];
  readonly close: () => Promise<void>;
}

// Per-session behaviour keyed on the posted sessionExternalId: `b-neterr` drops
// the socket so fetch rejects, `c-badbody` answers 200 with a body that fails
// ImportTraceResponseSchema, every other session gets a valid 201. This lets one
// import run exercise both new guards (fetch reject and success-body parse) while
// the good sessions before and after must still drain.
async function startStubServer(): Promise<StubServer> {
  const accepted: string[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
    });
    req.on('end', () => {
      const body: unknown = JSON.parse(raw);
      const id = isRecord(body) ? readNullableString(body, 'sessionExternalId') : null;
      if (id === 'b-neterr') {
        req.socket.destroy(); // fetch rejects with a network error
        return;
      }
      if (id === 'c-badbody') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ nope: true })); // 200 OK, invalid body
        return;
      }
      if (id !== null) {
        accepted.push(id);
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(OK_BODY);
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
    acceptedSessionIds: () => [...accepted],
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

describe('authority import fail-open', () => {
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

  test('a network reject or malformed body for one session never aborts the import', async () => {
    const home = makeTempHome();
    const directory = transcriptDir(home);

    // Sorted order is a, b, c, d. b fails on the network, c returns an invalid
    // success body. Before the fix b's fetch rejection propagated out of the loop
    // and c and d were never posted.
    for (const name of ['a-good', 'b-neterr', 'c-badbody', 'd-good']) {
      writeFileSync(join(directory, `${name}.jsonl`), `${transcriptLine()}\n`);
    }

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

    // 1. The command completes without throwing (before the fix the first
    //    network rejection rejected out of the loop and aborted the whole import).
    const summary = await runImport(directory);
    if (!isRecord(summary)) {
      throw new Error(`expected a summary object, got: ${stdout.join('\n')}`);
    }
    expect(summary.sessions).toBe(4);
    expect(summary.acceptedCount).toBe(2); // a and d
    expect(summary.failedSessions).toBe(2); // b (network) and c (bad body)
    expect(summary.failedSessionIds).toEqual(['b-neterr', 'c-badbody']);
    expect(process.exitCode).toBe(1); // failedSessions > 0

    // 2. Only the two good sessions were accepted; the loop reached d after b failed.
    expect(stub.acceptedSessionIds().sort()).toEqual(['a-good', 'd-good']);
  });
});
