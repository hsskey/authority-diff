import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Applies the generated SQL migrations so the policy store's tables exist. In
// V1 the migrations folder holds only the policy tables; ops and integration
// tests call this to bring an empty database up to the current schema.
export function migratePolicyStore(
  db: PostgresJsDatabase,
  migrationsFolder: string,
): Promise<void> {
  return migrate(db, { migrationsFolder });
}
