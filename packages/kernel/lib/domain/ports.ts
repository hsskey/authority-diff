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
