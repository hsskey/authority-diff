import { expect } from 'vitest';
import type { Result } from '@authority/kernel';

/** Narrows a Result to its value, failing the test if it is an error. */
export function expectOk<T, E>(result: Result<T, E>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected an ok result');
  }
  return result.value;
}

/** Narrows a Result to its error, failing the test if it is ok. */
export function expectErr<T, E>(result: Result<T, E>): E {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('expected an err result');
  }
  return result.error;
}
