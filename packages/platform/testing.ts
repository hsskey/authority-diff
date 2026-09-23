import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Clock, IdGenerator, IsoTimestamp, Logger } from '@authority/kernel';

export function createFixedClock(fixed: IsoTimestamp): Clock {
  return { now: () => fixed };
}

export function createSequentialIdGenerator(): IdGenerator {
  let counter = 0;
  return {
    next: (prefix: string) => {
      counter += 1;
      return `${prefix}_${String(counter).padStart(26, '0')}`;
    },
  };
}

export interface LogRecord {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly msg: string;
  readonly fields: Record<string, unknown> | undefined;
}

export interface MemoryLogger extends Logger {
  readonly records: readonly LogRecord[];
}

export function createMemoryLogger(): MemoryLogger {
  const records: LogRecord[] = [];
  const record = (level: LogRecord['level']) => (msg: string, fields?: Record<string, unknown>) => {
    records.push({ level, msg, fields });
  };
  return {
    records,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}

// Drops every table and applies the migrations, leaving the current schema with no rows.
export async function resetTestDatabase(
  db: PostgresJsDatabase,
  migrationsFolder: string,
): Promise<void> {
  await db.execute('drop schema if exists drizzle cascade');
  await db.execute('drop schema if exists public cascade');
  await db.execute('create schema public');
  await migrate(db, { migrationsFolder });
}
