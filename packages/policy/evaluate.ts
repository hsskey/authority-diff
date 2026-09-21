// Public entry for policy evaluation. See packages/policy/schema.ts for the
// contract these implement.
export { resolveZone } from './lib/domain/resolve-zone.ts';
export { createEvaluator, evaluateAction } from './lib/domain/evaluate-action.ts';
export { validatePolicyDocument } from './lib/domain/validate-policy-document.ts';
export { REVERSIBILITY_TABLE } from './lib/domain/reversibility.ts';
export { DEFAULT_POLICY_DOCUMENT } from './lib/domain/default-policy-document.ts';
