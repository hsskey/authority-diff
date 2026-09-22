import { describe, expect, test } from 'vitest';
import { createDatabase, parseConfig } from '../index.ts';
import { expectErr, expectOk } from './support/result.ts';

// Matches the isolated test database in docker-compose.test.yml.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';
const UNREACHABLE_DB_URL = 'postgres://authority:authority@localhost:55399/authority_test';

const configForUrl = (url: string) =>
  expectOk(
    parseConfig({
      AUTHORITY_DB_URL: url,
      AUTHORITY_AUTH_TOKEN: 'test-token',
      AUTHORITY_DB_POOL_MAX: '2',
    }),
  );

describe('createDatabase (integration)', () => {
  test('ping succeeds against the running database', async () => {
    const database = createDatabase(configForUrl(TEST_DB_URL));
    try {
      expect(expectOk(await database.ping())).toBe(true);
    } finally {
      await database.close();
    }
  });

  test('ping reports the database as unavailable when it cannot connect', async () => {
    const database = createDatabase(configForUrl(UNREACHABLE_DB_URL));
    try {
      const error = expectErr(await database.ping());
      expect(error.code).toBe('platform.database_unavailable');
      expect(error.isRetryable).toBe(true);
    } finally {
      await database.close();
    }
  });
});
