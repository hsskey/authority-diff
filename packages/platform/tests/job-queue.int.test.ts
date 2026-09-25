import { describe, expect, test } from 'vitest';
import { createDatabase, createPgBossJobQueue, parseConfig } from '../index.ts';
import { createMemoryLogger } from '../testing.ts';
import { expectOk } from './support/result.ts';

// Matches the isolated test database in docker-compose.test.yml.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';

const config = expectOk(
  parseConfig({
    AUTHORITY_DB_URL: TEST_DB_URL,
    AUTHORITY_AUTH_TOKEN: 'test-token',
    AUTHORITY_DB_POOL_MAX: '2',
  }),
);

describe('createPgBossJobQueue (integration)', () => {
  test('a sent job reaches its worker with the payload', async () => {
    const queue = createPgBossJobQueue(config, createMemoryLogger());
    await queue.start();
    try {
      const received = new Promise<unknown>((resolve) => {
        void queue.work('platform-test.echo', (payload) => {
          resolve(payload);
          return Promise.resolve();
        });
      });

      await queue.send('platform-test.echo', { replayRunId: 'rpl_1' });

      expect(await received).toEqual({ replayRunId: 'rpl_1' });
    } finally {
      await queue.stop();
    }
  });

  test('schedule stores the cron in UTC in the pgboss schema', async () => {
    const queue = createPgBossJobQueue(config, createMemoryLogger());
    const database = createDatabase(config);
    await queue.start();
    try {
      await queue.schedule('platform-test.daily', '0 1 * * *');

      const rows = await database.db.execute(
        "select cron, timezone from pgboss.schedule where name = 'platform-test.daily'",
      );

      expect(rows.map((row) => [row.cron, row.timezone])).toEqual([['0 1 * * *', 'UTC']]);
    } finally {
      await queue.stop();
      await database.close();
    }
  });
});
