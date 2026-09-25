import type { IsoTimestamp } from './schemas.ts';

export interface Clock {
  now(): IsoTimestamp;
}

export interface IdGenerator {
  next(prefix: string): string;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface Transaction {
  readonly __brand: 'authority.transaction';
}

export interface TransactionRunner {
  run<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

export type JobPayload = Readonly<Record<string, unknown>>;

/** A handler receives the payload as sent and validates it; a thrown error lets the queue retry. */
export type JobHandler = (payload: unknown) => Promise<void>;

export interface JobQueue {
  send(name: string, payload: JobPayload): Promise<void>;
  work(name: string, handler: JobHandler): Promise<void>;
  /**
   * Sends `name` with an empty payload on each UTC `cron` occurrence; occurrences
   * missed while no process ran are sent once.
   */
  schedule(name: string, cron: string): Promise<void>;
}
