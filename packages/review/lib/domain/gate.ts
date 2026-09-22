import type { Gate, GateBlocker, Verdict } from '../../schema.ts';

export interface GateInput {
  readonly replayCompleted: boolean;
  readonly replayFailed: boolean;
  readonly wideningVerdicts: readonly (Verdict | null)[];
}

/**
 * The acceptance gate over a Change Review's replay and Widening Verdicts.
 * Returns `isOpen: true` only when no blocker applies. The five blockers are
 * `replay_incomplete`, `replay_failed`, `widening_unreviewed`,
 * `widening_investigate`, and `widening_unexpected`; Narrowing groups never
 * block (docs/cutline.md section 6).
 */
export function computeGate(input: GateInput): Gate {
  const blockers: GateBlocker[] = [];

  if (input.replayFailed) {
    blockers.push({ code: 'replay_failed', count: 1 });
    return { isOpen: false, blockers };
  }
  if (!input.replayCompleted) {
    blockers.push({ code: 'replay_incomplete', count: 1 });
    return { isOpen: false, blockers };
  }

  const unreviewed = input.wideningVerdicts.filter((verdict) => verdict === null).length;
  const investigate = input.wideningVerdicts.filter((verdict) => verdict === 'investigate').length;
  const unexpected = input.wideningVerdicts.filter((verdict) => verdict === 'unexpected').length;

  if (unreviewed > 0) {
    blockers.push({ code: 'widening_unreviewed', count: unreviewed });
  }
  if (investigate > 0) {
    blockers.push({ code: 'widening_investigate', count: investigate });
  }
  if (unexpected > 0) {
    blockers.push({ code: 'widening_unexpected', count: unexpected });
  }

  return { isOpen: blockers.length === 0, blockers };
}
