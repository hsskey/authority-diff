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
