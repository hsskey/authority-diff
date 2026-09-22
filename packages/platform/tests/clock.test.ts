import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import { createSystemClock } from '../index.ts';

describe('createSystemClock', () => {
  test('now returns a value the IsoTimestamp brand accepts', () => {
    const now = createSystemClock().now();
    expect(IsoTimestampSchema.safeParse(now).success).toBe(true);
  });

  test('now returns a millisecond-precision UTC timestamp ending in Z', () => {
    const now = createSystemClock().now();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
