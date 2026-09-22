import { describe, expect, test } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDatabase, narrowTransaction, parseConfig } from '../index.ts';
import { expectOk } from './support/result.ts';

const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';

const testConfig = () =>
  expectOk(
    parseConfig({
      AUTHORITY_DB_URL: TEST_DB_URL,
      AUTHORITY_AUTH_TOKEN: 'test-token',
      AUTHORITY_DB_POOL_MAX: '2',
    }),
  );

describe('transactionRunner (integration)', () => {
  test('rolls back every insert when one fails', async () => {
    const database = createDatabase(testConfig());
    try {
      await database.db.execute(
        sql`create table if not exists rollback_probe (id integer primary key)`,
      );
      await database.db.execute(sql`delete from rollback_probe`);

      await expect(
        database.transactionRunner.run(async (tx) => {
          const drizzleTx = narrowTransaction(tx);
          await drizzleTx.execute(sql`insert into rollback_probe (id) values (1)`);
          await drizzleTx.execute(sql`insert into rollback_probe (id) values (1)`);
        }),
      ).rejects.toThrow();

      const rows = await database.db.execute(sql`select count(*)::int as n from rollback_probe`);
      expect(rows[0]?.n).toBe(0);
    } finally {
      await database.db.execute(sql`drop table if exists rollback_probe`);
      await database.close();
    }
  });
});
