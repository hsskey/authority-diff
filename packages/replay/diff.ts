import { createEvaluator } from '@authority/policy/evaluate';
import type { ComputeDiff } from './schema.ts';
import { computeConformanceWith } from './lib/domain/compute-conformance.ts';
import { computeDiffWith, deriveTargetKey, renderHeadline } from './lib/domain/compute-diff.ts';
import { deriveDisposition } from './lib/domain/derive-disposition.ts';

/**
 * Public entry point for Replay diff computation.
 *
 * `computeDiffWith` is the deterministic core: it owns grouping, severity,
 * sorting, and hashing, and receives injected evaluators. Tests reach the
 * package only through this entry point; the core and its helpers are exported
 * here as the authorized testing seam.
 */
export {
  computeConformanceWith,
  computeDiffWith,
  deriveDisposition,
  deriveTargetKey,
  renderHeadline,
};

/**
 * Computes the deterministic diff between two Policy Documents. Compiles each
 * document once with `createEvaluator` and delegates to `computeDiffWith`; see
 * the ComputeDiff TSDoc in schema.ts for the frozen output contract.
 */
export const computeDiff: ComputeDiff = ({ actions, baseline, candidate }) =>
  computeDiffWith(createEvaluator(baseline), createEvaluator(candidate), actions);
