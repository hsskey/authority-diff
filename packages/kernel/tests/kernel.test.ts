import { describe, test, expect } from 'vitest';
import { ok, err, prefixedId } from '../index.ts';
import { canonicalJson, sha256Hex } from '../hash.ts';

describe('canonicalJson', () => {
  test('produces the same string for objects that differ only in key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  test('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
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
});

describe('Result', () => {
  test('ok and err form a discriminable union', () => {
    const good = ok(1);
    const bad = err('nope');
    expect(good.ok ? good.value : null).toBe(1);
    expect(bad.ok ? null : bad.error).toBe('nope');
  });
});
