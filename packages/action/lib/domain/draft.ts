/**
 * Operation drafts and finalization.
 *
 * Classification builds {@link OperationDraft}s without indices; `finalize`
 * assigns sequential indices and enforces the 2,000-character fragment cap
 * (adding the `fragment_truncated` signal) from the frozen Operation contract.
 */
import type { Analyzability, Capability, Operation, Target } from '../../schema.ts';

/** An Operation before its `index` is assigned. */
export interface OperationDraft {
  readonly capability: Capability;
  readonly target: Target;
  readonly analyzability: Analyzability;
  readonly program: string | null;
  readonly fragment: string;
  readonly signals: readonly string[];
}

const FRAGMENT_MAX = 2000;

export function draft(
  capability: Capability,
  target: Target,
  analyzability: Analyzability,
  program: string | null,
  fragment: string,
  signals: readonly string[] = [],
): OperationDraft {
  return { capability, target, analyzability, program, fragment, signals };
}

/** Assigns indices and applies the fragment length cap. */
export function finalize(drafts: readonly OperationDraft[]): Operation[] {
  return drafts.map((d, index) => {
    if (d.fragment.length <= FRAGMENT_MAX) {
      return { index, ...d, signals: [...d.signals] };
    }
    return {
      index,
      capability: d.capability,
      target: d.target,
      analyzability: d.analyzability,
      program: d.program,
      fragment: d.fragment.slice(0, FRAGMENT_MAX),
      signals: [...d.signals, 'fragment_truncated'],
    };
  });
}
