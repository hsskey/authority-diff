import { describe, test, expect, expectTypeOf } from 'vitest';
import { z } from 'zod';
import { ok, err, prefixedId, IsoTimestampSchema } from '../index.ts';
import { canonicalJson, sha256Hex } from '../hash.ts';

describe('canonicalJson', () => {
  test('produces the same string for objects that differ only in key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  test('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  test('serializes negative zero as zero', () => {
    expect(canonicalJson(-0)).toBe('0');
  });

  test.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ] as const)('rejects non-finite number %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(/invariant failed/);
  });

  test.each([
    ['Date', new Date('2024-01-01T00:00:00.000Z')],
    ['Map', new Map([['a', 1]])],
    [
      'class instance',
      new (class Thing {
        x = 1;
      })(),
    ],
  ] as const)('rejects %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(/invariant failed/);
  });

  test.each([
    ['top-level undefined', undefined],
    ['nested object undefined', { a: undefined }],
    ['nested array undefined', [1, undefined]],
  ] as const)('rejects %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(/invariant failed/);
  });

  test('rejects sparse arrays', () => {
    const sparse: number[] = [];
    sparse[0] = 1;
    sparse[2] = 3;
    expect(() => canonicalJson(sparse)).toThrow(/invariant failed/);
  });

  test.each([
    ['bigint', 1n],
    ['function', () => {}],
    ['symbol', Symbol('x')],
  ] as const)('rejects %s', (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(/invariant failed/);
  });
});

describe('sha256Hex', () => {
  test('matches the known vector for "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('prefixedId', () => {
  const schema = prefixedId('act', 'ActionId');

  test('accepts a well-formed id', () => {
    expect(schema.safeParse('act_0123456789ABCDEFGHJKMNPQRS').success).toBe(true);
  });

  test('rejects a different prefix', () => {
    expect(schema.safeParse('xyz_0123456789ABCDEFGHJKMNPQRS').success).toBe(false);
  });

  test('rejects a wrong length', () => {
    expect(schema.safeParse('act_0123').success).toBe(false);
  });

  test('distinct brands are not equal types', () => {
    const ActionIdSchema = prefixedId('act', 'ActionId');
    const SessionIdSchema = prefixedId('ses', 'SessionId');
    type ActionId = z.infer<typeof ActionIdSchema>;
    type SessionId = z.infer<typeof SessionIdSchema>;

    expect(ActionIdSchema.safeParse('act_0123456789ABCDEFGHJKMNPQRS').success).toBe(true);
    expect(SessionIdSchema.safeParse('ses_0123456789ABCDEFGHJKMNPQRS').success).toBe(true);
    expectTypeOf<ActionId>().branded.toEqualTypeOf<ActionId>();
    type BrandsAreDistinct = [ActionId] extends [SessionId]
      ? [SessionId] extends [ActionId]
        ? false
        : true
      : true;
    expectTypeOf<BrandsAreDistinct>().toEqualTypeOf<true>();
  });
});

describe('IsoTimestampSchema', () => {
  test('accepts exactly three millisecond digits', () => {
    expect(IsoTimestampSchema.safeParse('2024-01-01T00:00:00.000Z').success).toBe(true);
    expect(IsoTimestampSchema.safeParse('2024-06-15T12:30:45.123Z').success).toBe(true);
  });

  test('rejects missing fractional seconds', () => {
    expect(IsoTimestampSchema.safeParse('2024-01-01T00:00:00Z').success).toBe(false);
  });

  test('rejects six-digit fractional seconds', () => {
    expect(IsoTimestampSchema.safeParse('2024-01-01T00:00:00.123456Z').success).toBe(false);
  });

  test('accepted values sort in time order', () => {
    const timestamps = [
      '2024-01-01T00:00:00.000Z',
      '2024-01-01T00:00:00.500Z',
      '2024-01-01T00:00:01.000Z',
      '2024-06-15T12:30:45.999Z',
    ];
    for (const ts of timestamps) {
      expect(IsoTimestampSchema.safeParse(ts).success).toBe(true);
    }
    const sorted = [...timestamps].sort();
    expect(sorted).toEqual(timestamps);
  });
});

describe('Result', () => {
  test('ok and err form a discriminable union', () => {
    const good = ok(1);
    const bad = err('nope');
    expect(good.ok ? good.value : null).toBe(1);
    expect(bad.ok ? null : bad.error).toBe('nope');
  });
});
