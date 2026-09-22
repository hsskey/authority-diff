import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema, prefixedId } from '@authority/kernel';
import { createFixedClock, createMemoryLogger, createSequentialIdGenerator } from '../testing.ts';

describe('createFixedClock', () => {
  test('now always returns the fixed timestamp', () => {
    const fixed = IsoTimestampSchema.parse('2026-09-22T00:00:00.000Z');
    const clock = createFixedClock(fixed);
    expect(clock.now()).toBe(fixed);
  });
});

describe('createSequentialIdGenerator', () => {
  test('emits ascending ids the prefixedId validator accepts', () => {
    const generator = createSequentialIdGenerator();
    const first = generator.next('req');
    const second = generator.next('req');
    expect(prefixedId('req', 'RequestId').safeParse(first).success).toBe(true);
    expect(first).toBe('req_00000000000000000000000001');
    expect(second).toBe('req_00000000000000000000000002');
  });
});

describe('createMemoryLogger', () => {
  test('records each call with its level, message, and fields', () => {
    const logger = createMemoryLogger();
    logger.info('started', { port: 8787 });
    logger.error('failed');
    expect(logger.records).toEqual([
      { level: 'info', msg: 'started', fields: { port: 8787 } },
      { level: 'error', msg: 'failed', fields: undefined },
    ]);
  });
});
