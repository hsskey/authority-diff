import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema, prefixedId } from '@authority/kernel';
import {
  createFixedClock,
  createMemoryJobQueue,
  createMemoryLogger,
  createSequentialIdGenerator,
} from '../testing.ts';

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

describe('createMemoryJobQueue', () => {
  test('runs a job sent before its worker once the worker is registered', async () => {
    const queue = createMemoryJobQueue();
    const received: unknown[] = [];
    await queue.send('echo', { n: 1 });

    await queue.work('echo', (payload) => {
      received.push(payload);
      return Promise.resolve();
    });
    await queue.drain();

    expect(received).toEqual([{ n: 1 }]);
  });

  test('drain waits for jobs sent by a running job', async () => {
    const queue = createMemoryJobQueue();
    const received: unknown[] = [];
    await queue.work('first', () => queue.send('second', { n: 2 }));
    await queue.work('second', async (payload) => {
      await Promise.resolve();
      received.push(payload);
    });

    await queue.send('first', {});
    await queue.drain();

    expect(received).toEqual([{ n: 2 }]);
  });

  test('drain rethrows the error a job threw', async () => {
    const queue = createMemoryJobQueue();
    const failure = new Error('handler failed');
    await queue.work('failing', () => Promise.reject(failure));

    await queue.send('failing', {});

    await expect(queue.drain()).rejects.toBe(failure);
  });
});
