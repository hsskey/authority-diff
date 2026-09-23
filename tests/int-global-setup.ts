import { fileURLToPath } from 'node:url';
import { createDatabase, parseConfig } from '../packages/platform/index.ts';
import { resetTestDatabase } from '../packages/platform/testing.ts';

// Matches the isolated test database in docker-compose.test.yml.
const TEST_DB_URL = 'postgres://authority:authority@localhost:55433/authority_test';
const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

// Every run starts from an empty database migrated once, before any test file runs.
// Test files must not migrate: concurrent migrations of an empty database race.
export async function setup(): Promise<void> {
  const config = parseConfig({
    AUTHORITY_DB_URL: TEST_DB_URL,
    AUTHORITY_AUTH_TOKEN: 'test-token',
    AUTHORITY_DB_POOL_MAX: '1',
  });
  if (!config.ok) {
    throw new Error('test config failed to parse');
  }
  const database = createDatabase(config.value);
  try {
    await resetTestDatabase(database.db, MIGRATIONS);
  } finally {
    await database.close();
  }
}
