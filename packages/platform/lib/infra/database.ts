import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { err, ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import type { Config } from './config.ts';

export interface Database {
  readonly db: PostgresJsDatabase;
  readonly ping: () => Promise<Result<true, AppError>>;
  readonly close: () => Promise<void>;
}

export function createDatabase(config: Config): Database {
  const sql = postgres(config.db.url.reveal(), { max: config.db.poolMax });
  const db = drizzle(sql);
  return {
    db,
    ping: async (): Promise<Result<true, AppError>> => {
      try {
        await sql`select 1`;
        return ok(true);
      } catch (cause) {
        return err({
          code: 'platform.database_unavailable',
          message: 'the database is unavailable',
          isRetryable: true,
          details: null,
          cause,
        });
      }
    },
    close: async (): Promise<void> => {
      await sql.end({ timeout: 5 });
    },
  };
}
