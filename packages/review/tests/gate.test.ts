import { expect, test } from 'vitest';
import { computeGate } from '../index.ts';
import type { Verdict } from '../schema.ts';

test('an incomplete replay is the only blocker', () => {
  const gate = computeGate({
    kind: 'change',
    replayCompleted: false,
    replayFailed: false,
    verdicts: [],
  });
  expect(gate).toEqual({ isOpen: false, blockers: [{ code: 'replay_incomplete', count: 1 }] });
});

test('a failed replay blocks even with no widening groups', () => {
  const gate = computeGate({
    kind: 'change',
    replayCompleted: false,
    replayFailed: true,
    verdicts: [],
  });
  expect(gate).toEqual({ isOpen: false, blockers: [{ code: 'replay_failed', count: 1 }] });
});

test('a completed replay with every widening group expected is open', () => {
  const verdicts: (Verdict | null)[] = ['expected', 'expected'];
  const gate = computeGate({
    kind: 'change',
    replayCompleted: true,
    replayFailed: false,
    verdicts,
  });
  expect(gate).toEqual({ isOpen: true, blockers: [] });
});

test('unreviewed widening groups block acceptance', () => {
  const verdicts: (Verdict | null)[] = ['expected', null, null];
  const gate = computeGate({
    kind: 'change',
    replayCompleted: true,
    replayFailed: false,
    verdicts,
  });
  expect(gate).toEqual({ isOpen: false, blockers: [{ code: 'widening_unreviewed', count: 2 }] });
});

test('investigate and unexpected widening verdicts each block', () => {
  const verdicts: (Verdict | null)[] = ['investigate', 'unexpected', 'unexpected'];
  const gate = computeGate({
    kind: 'change',
    replayCompleted: true,
    replayFailed: false,
    verdicts,
  });
  expect(gate).toEqual({
    isOpen: false,
    blockers: [
      { code: 'widening_investigate', count: 1 },
      { code: 'widening_unexpected', count: 2 },
    ],
  });
});

test('a completed replay with no widening groups is open (narrowing never blocks)', () => {
  const gate = computeGate({
    kind: 'change',
    replayCompleted: true,
    replayFailed: false,
    verdicts: [],
  });
  expect(gate).toEqual({ isOpen: true, blockers: [] });
});

test.each([
  ['an incomplete replay', false, false, 'replay_incomplete'],
  ['a failed replay', false, true, 'replay_failed'],
])(
  'an adoption review with %s is blocked by the replay alone',
  (_name, completed, failed, code) => {
    const gate = computeGate({
      kind: 'adoption',
      replayCompleted: completed,
      replayFailed: failed,
      verdicts: [null, 'unexpected'],
    });
    expect(gate).toEqual({ isOpen: false, blockers: [{ code, count: 1 }] });
  },
);

test('an adoption review is open only when every ask and deny group is expected', () => {
  const verdicts: (Verdict | null)[] = ['expected', 'expected', 'expected'];
  const gate = computeGate({
    kind: 'adoption',
    replayCompleted: true,
    replayFailed: false,
    verdicts,
  });
  expect(gate).toEqual({ isOpen: true, blockers: [] });
});

test('an adoption review with no ask or deny group is open', () => {
  const gate = computeGate({
    kind: 'adoption',
    replayCompleted: true,
    replayFailed: false,
    verdicts: [],
  });
  expect(gate).toEqual({ isOpen: true, blockers: [] });
});

test('unreviewed, investigate, and unexpected adoption groups each block with their own code and count', () => {
  const verdicts: (Verdict | null)[] = [null, null, null, 'investigate', 'unexpected', 'expected'];
  const gate = computeGate({
    kind: 'adoption',
    replayCompleted: true,
    replayFailed: false,
    verdicts,
  });
  expect(gate).toEqual({
    isOpen: false,
    blockers: [
      { code: 'adoption_unreviewed', count: 3 },
      { code: 'adoption_investigate', count: 1 },
      { code: 'adoption_unexpected', count: 1 },
    ],
  });
});

test('an adoption review never raises a widening blocker', () => {
  const gate = computeGate({
    kind: 'adoption',
    replayCompleted: true,
    replayFailed: false,
    verdicts: [null],
  });
  expect(gate.blockers.map((blocker) => blocker.code)).toEqual(['adoption_unreviewed']);
});
