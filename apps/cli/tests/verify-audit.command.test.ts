import { createServer } from 'node:http';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { runVerifyAudit } from '../src/commands/verify-audit.command.ts';
import { restoreEnv, setEnv, snapshotEnv } from './support/env.config.ts';

async function withStubServer(
  status: number,
  body: unknown,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('stub server did not bind a TCP port');
  }
  await run(`http://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('authority verify-audit', () => {
  const savedEnv = snapshotEnv();

  afterEach(() => {
    restoreEnv(savedEnv);
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  test.each([
    [
      'an intact chain',
      200,
      { isIntact: true, checkedCount: 3, firstBrokenSequence: null },
      undefined,
    ],
    ['a broken chain', 200, { isIntact: false, checkedCount: 2, firstBrokenSequence: 2 }, 1],
    ['a failed request', 500, { error: 'internal' }, 1],
  ])('reports %s through the exit code', async (_case, status, body, expectedExitCode) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await withStubServer(status, body, async (url) => {
      setEnv({ AUTHORITY_CLI_TOKEN: 'test-token', AUTHORITY_CLI_SERVER_URL: url });
      await runVerifyAudit();
    });

    expect(process.exitCode).toBe(expectedExitCode);
  });
});
