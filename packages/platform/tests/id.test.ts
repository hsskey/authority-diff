import { describe, expect, test } from 'vitest';
import { prefixedId } from '@authority/kernel';
import { createUlidGenerator } from '../index.ts';

describe('createUlidGenerator', () => {
  test('next produces an id the prefixedId validator accepts', () => {
    const id = createUlidGenerator().next('req');
    expect(prefixedId('req', 'RequestId').safeParse(id).success).toBe(true);
  });

  test('next honors the requested prefix', () => {
    const id = createUlidGenerator().next('act');
    expect(prefixedId('act', 'ActionId').safeParse(id).success).toBe(true);
  });

  test('an id built for one prefix is rejected under another prefix', () => {
    const id = createUlidGenerator().next('req');
    expect(prefixedId('act', 'ActionId').safeParse(id).success).toBe(false);
  });

  test('generated ids are unique across a batch', () => {
    const generator = createUlidGenerator();
    const ids = new Set(Array.from({ length: 1000 }, () => generator.next('req')));
    expect(ids.size).toBe(1000);
  });
});
