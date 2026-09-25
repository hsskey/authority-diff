import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  Clock,
  IdGenerator,
  IsoTimestamp,
  JobHandler,
  JobPayload,
  JobQueue,
  Logger,
} from '@authority/kernel';

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

export async function countRowsByRun(
  db: PostgresJsDatabase,
  table: string,
  replayRunId: string,
): Promise<number> {
  const rows = await db.execute(
    sql`select count(*)::int as n from ${sql.identifier(table)} where replay_run_id = ${replayRunId}`,
  );
  return Number(rows[0]?.n);
}

export interface MemoryJobQueue extends JobQueue {
  readonly schedules: readonly { readonly name: string; readonly cron: string }[];
  /** Resolves once no job is running, including jobs sent by handlers; rethrows the first handler error. */
  drain(): Promise<void>;
}

// Runs a job in process as soon as its queue has a worker; a job sent earlier waits for work().
export function createMemoryJobQueue(): MemoryJobQueue {
  const handlers = new Map<string, JobHandler>();
  const waiting = new Map<string, JobPayload[]>();
  const running = new Set<Promise<void>>();
  const failures: unknown[] = [];
  const schedules: { name: string; cron: string }[] = [];
  const run = (handler: JobHandler, payload: JobPayload): void => {
    const job: Promise<void> = handler(payload)
      .catch((cause: unknown) => {
        failures.push(cause);
      })
      .finally(() => running.delete(job));
    running.add(job);
  };
  return {
    schedules,
    send(name, payload) {
      const handler = handlers.get(name);
      if (handler === undefined) {
        waiting.set(name, [...(waiting.get(name) ?? []), payload]);
      } else {
        run(handler, payload);
      }
      return Promise.resolve();
    },
    work(name, handler) {
      handlers.set(name, handler);
      for (const payload of waiting.get(name) ?? []) {
        run(handler, payload);
      }
      waiting.delete(name);
      return Promise.resolve();
    },
    schedule(name, cron) {
      schedules.push({ name, cron });
      return Promise.resolve();
    },
    async drain() {
      while (running.size > 0) {
        await Promise.all(running);
      }
      const [failure] = failures.splice(0);
      if (failure !== undefined) {
        throw failure;
      }
    },
  };
}
