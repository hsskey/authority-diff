import type { Gate, GateBlocker, GateBlockerCode, ReviewKind, Verdict } from '#schema';

export interface GateInput {
  readonly kind: ReviewKind;
  readonly replayCompleted: boolean;
  readonly replayFailed: boolean;
  /**
   * One entry per group the kind puts under review: a change review's Widening
   * groups, or an adoption review's ask and deny groups. `null` is unreviewed.
   */
  readonly verdicts: readonly (Verdict | null)[];
}

type VerdictBlocker = 'unreviewed' | 'investigate' | 'unexpected';

const VERDICT_BLOCKERS: readonly VerdictBlocker[] = ['unreviewed', 'investigate', 'unexpected'];

const BLOCKER_CODE: Record<ReviewKind, Record<VerdictBlocker, GateBlockerCode>> = {
  change: {
    unreviewed: 'widening_unreviewed',
    investigate: 'widening_investigate',
    unexpected: 'widening_unexpected',
  },
  adoption: {
    unreviewed: 'adoption_unreviewed',
    investigate: 'adoption_investigate',
    unexpected: 'adoption_unexpected',
  },
};

function blockerOf(verdict: Verdict | null): VerdictBlocker | null {
  if (verdict === null) {
    return 'unreviewed';
  }
  return verdict === 'expected' ? null : verdict;
}

/**
 * The acceptance gate over a review's replay and group Verdicts. Returns
 * `isOpen: true` only when no blocker applies. `replay_incomplete` and
 * `replay_failed` are shared by both kinds. A change review is blocked by its
 * Widening groups (`widening_*`; Narrowing groups never block) and an adoption
 * review by every ask and deny group (`adoption_*`); in both, only an
 * `expected` Verdict passes (docs/cutline.md section 6).
 */
export function computeGate(input: GateInput): Gate {
  if (input.replayFailed) {
    return { isOpen: false, blockers: [{ code: 'replay_failed', count: 1 }] };
  }
  if (!input.replayCompleted) {
    return { isOpen: false, blockers: [{ code: 'replay_incomplete', count: 1 }] };
  }

  const counts = new Map<VerdictBlocker, number>();
  for (const verdict of input.verdicts) {
    const blocker = blockerOf(verdict);
    if (blocker !== null) {
      counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
    }
  }
  const blockers: GateBlocker[] = VERDICT_BLOCKERS.flatMap((blocker) => {
    const count = counts.get(blocker) ?? 0;
    return count > 0 ? [{ code: BLOCKER_CODE[input.kind][blocker], count }] : [];
  });

  return { isOpen: blockers.length === 0, blockers };
}
