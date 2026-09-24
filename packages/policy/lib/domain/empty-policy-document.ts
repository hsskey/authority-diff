import type { PolicyDocument } from '../../schema.ts';

// No environment facts and no rules, so every Action falls through to the default Effect `ask`.
export const EMPTY_POLICY_DOCUMENT: PolicyDocument = {
  schemaVersion: 1,
  environment: {
    credentialPaths: [],
    agentConfigPaths: [],
    trustedRemotes: [],
    publicRemotes: [],
    protectedBranches: [],
    productionMarkers: [],
  },
  rules: [],
};
