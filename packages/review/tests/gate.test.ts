import { expect, test } from 'vitest';
import { computeGate } from '../index.ts';
import type { Verdict } from '../schema.ts';

test('an incomplete replay is the only blocker', () => {
  const gate = computeGate({ replayCompleted: false, replayFailed: false, wideningVerdicts: [] });
  expect(gate).toEqual({ isOpen: false, blockers: [{ code: 'replay_incomplete', count: 1 }] });
});

test('a failed replay blocks even with no widening groups', () => {
  const gate = computeGate({ replayCompleted: false, replayFailed: true, wideningVerdicts: [] });
  expect(gate).toEqual({ isOpen: false, blockers: [{ code: 'replay_failed', count: 1 }] });
});

test('a completed replay with every widening group expected is open', () => {
  const verdicts: (Verdict | null)[] = ['expected', 'expected'];
  const gate = computeGate({
    replayCompleted: true,
    replayFailed: false,
    wideningVerdicts: verdicts,
  });
  expect(gate).toEqual({ isOpen: true, blockers: [] });
});

test('unreviewed widening groups block acceptance', () => {
  const verdicts: (Verdict | null)[] = ['expected', null, null];
  const gate = computeGate({
    replayCompleted: true,
    replayFailed: false,
    wideningVerdicts: verdicts,
  });
  expect(gate).toEqual({ isOpen: false, blockers: [{ code: 'widening_unreviewed', count: 2 }] });
});

test('investigate and unexpected widening verdicts each block', () => {
  const verdicts: (Verdict | null)[] = ['investigate', 'unexpected', 'unexpected'];
  const gate = computeGate({
    replayCompleted: true,
    replayFailed: false,
    wideningVerdicts: verdicts,
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
  const gate = computeGate({ replayCompleted: true, replayFailed: false, wideningVerdicts: [] });
  expect(gate).toEqual({ isOpen: true, blockers: [] });
});
