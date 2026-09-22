import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Applies the generated SQL migrations so the replay store's tables exist.
// Integration tests call this to bring an empty database up to the current schema.
export function migrateReplayStore(
  db: PostgresJsDatabase,
  migrationsFolder: string,
): Promise<void> {
  return migrate(db, { migrationsFolder });
}
