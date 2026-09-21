/**
 * Public entry point for Replay diff computation.
 *
 * `computeDiffWith` is the deterministic core: it owns grouping, severity,
 * sorting, and hashing, and receives injected evaluators so it can be developed
 * and tested independently of the Policy evaluation package. Tests reach the
 * package only through this entry point; the core is exported here as the
 * authorized testing seam.
 *
 * The public `computeDiff: ComputeDiff` wrapper compiles the two Policy
 * Documents with `createEvaluator` from `@authority/policy/evaluate` and
 * delegates to `computeDiffWith`. That entry point is produced by the Policy
 * lane in parallel; the wrapper is wired once that package lands so the real
 * integration is exercised, rather than faking the dependency here.
 */
export { computeDiffWith, deriveTargetKey, renderHeadline } from './lib/domain/compute-diff.ts';
