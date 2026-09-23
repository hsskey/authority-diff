/**
 * Operation drafts and finalization.
 *
 * Classification builds {@link OperationDraft}s without indices; `finalize`
 * assigns sequential indices and enforces the 2,000-character fragment cap
 * (adding the `fragment_truncated` signal) from the frozen Operation contract.
 */
import type { Analyzability, Capability, Operation, Target } from '../../schema.ts';
import type { ShellWord } from '../shell/ast.ts';
import { hasFlag } from './command.ts';

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

/**
 * Downgrades a publish or push draft to a partial `execute` when a help or
 * dry-run flag means the command transmits nothing, keeping its Target and
 * adding the `help` or `dry_run` signal.
 */
export function unlessNoEffect(
  op: OperationDraft,
  args: readonly ShellWord[],
  dryRunFlags: readonly string[] = ['--dry-run'],
): OperationDraft {
  const signal = hasFlag(args, '--help', '-h')
    ? 'help'
    : hasFlag(args, ...dryRunFlags)
      ? 'dry_run'
      : null;
  if (signal === null) return op;
  return draft('execute', op.target, 'partial', op.program, op.fragment, [...op.signals, signal]);
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
