import { describe, expect, test } from 'vitest';
import { makeSecret } from '../index.ts';

describe('makeSecret', () => {
  test('reveal returns the raw value', () => {
    expect(makeSecret('db-url').reveal()).toBe('db-url');
  });

  test('toString renders the redaction placeholder', () => {
    expect(makeSecret('db-url').toString()).toBe('[redacted]');
  });

  test('String coercion renders the redaction placeholder', () => {
    expect(String(makeSecret('super-secret'))).toBe('[redacted]');
  });

  test('JSON serialization redacts the value inside an object', () => {
    expect(JSON.stringify({ token: makeSecret('CANARY-XYZ') })).toBe('{"token":"[redacted]"}');
  });

  test('reveal still returns the value that JSON serialization hides', () => {
    const secret = makeSecret('CANARY-XYZ');
    JSON.stringify(secret);
    expect(secret.reveal()).toBe('CANARY-XYZ');
  });
});
