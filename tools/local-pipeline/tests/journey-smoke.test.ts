import { describe, expect, test } from 'vitest';
import { compareFigures } from '../journey-smoke.ts';

const expected = new Map([
  ['policy-a.deny', '3'],
  ['adoption.resultHash', 'aaaaaaaa…bbbb'],
]);

describe('compareFigures', () => {
  test.each([
    ['equal figures', [...expected], []],
    [
      'a different value',
      [
        ['policy-a.deny', '4'],
        ['adoption.resultHash', 'aaaaaaaa…bbbb'],
      ],
      ['policy-a.deny: expected 3, got 4'],
    ],
    [
      'a missing and an extra key',
      [
        ['policy-a.deny', '3'],
        ['audit.checked', '3'],
      ],
      [
        'adoption.resultHash: expected aaaaaaaa…bbbb, got (none)',
        'audit.checked: expected (none), got 3',
      ],
    ],
  ] as const)('reports %s', (_name, actual, failures) => {
    expect(compareFigures(expected, new Map(actual))).toEqual(failures);
  });
});
