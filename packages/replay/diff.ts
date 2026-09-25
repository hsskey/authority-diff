import { createEvaluator } from '@authority/policy/evaluate';
import type { ComputeAdoption, ComputeDiff } from './schema.ts';
import { computeAdoptionWith } from './lib/domain/compute-adoption.ts';
import { computeConformanceWith } from './lib/domain/compute-conformance.ts';
import { computeDiffWith, renderHeadline } from './lib/domain/compute-diff.ts';
import { deriveDisposition } from './lib/domain/derive-disposition.ts';
import { findObservationGaps } from './lib/domain/find-observation-gaps.ts';
import { deriveTargetKey } from './lib/domain/group-summary.ts';
import { pairPermissionRequests } from './lib/domain/pair-permission-requests.ts';

/**
 * Public entry point for Replay diff computation.
 *
 * `computeDiffWith` is the deterministic core: it owns grouping, severity,
 * sorting, and hashing, and receives injected evaluators. `computeAdoptionWith`
 * is its baseline-less counterpart for the Initial Adoption preview. Tests
 * reach the package only through this entry point; the cores and their helpers
 * are exported here as the authorized testing seam.
 */
export {
  computeAdoptionWith,
  computeConformanceWith,
  computeDiffWith,
  deriveDisposition,
  deriveTargetKey,
  findObservationGaps,
  pairPermissionRequests,
  renderHeadline,
};

/**
 * Computes the deterministic diff between two Policy Documents. Compiles each
 * document once with `createEvaluator` and delegates to `computeDiffWith`; see
 * the ComputeDiff TSDoc in schema.ts for the frozen output contract.
 */
export const computeDiff: ComputeDiff = ({ actions, baseline, candidate }) =>
  computeDiffWith(createEvaluator(baseline), createEvaluator(candidate), actions);

/**
 * Applies one candidate Policy Document to past Actions with no baseline.
 * Compiles the document once and delegates to `computeAdoptionWith`; see the
 * ComputeAdoption TSDoc in schema.ts for the frozen output contract.
 */
export const computeAdoption: ComputeAdoption = ({ actions, candidate }) =>
  computeAdoptionWith(createEvaluator(candidate), actions);
