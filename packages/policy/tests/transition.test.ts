import { describe, expect, test } from 'vitest';
import { nextStatus } from '../index.ts';
import { expectErr, expectOk } from './support/result.ts';

describe('nextStatus', () => {
  test.each([
    ['draft', 'submit', 'in_review'],
    ['in_review', 'accept', 'accepted'],
    ['in_review', 'reject', 'rejected'],
    ['in_review', 'withdraw', 'draft'],
  ] as const)('%s --%s--> %s', (from, transition, to) => {
    expect(expectOk(nextStatus(from, transition))).toBe(to);
  });

  test.each([
    ['accepted', 'submit'],
    ['rejected', 'accept'],
    ['draft', 'accept'],
    ['draft', 'reject'],
    ['draft', 'withdraw'],
    ['in_review', 'submit'],
    ['accepted', 'withdraw'],
  ] as const)('%s cannot %s', (from, transition) => {
    const error = expectErr(nextStatus(from, transition));
    expect(error.code).toBe('policy.transition_not_allowed');
  });
});
