import type { PolicyDocumentV2 } from '../../schema.ts';

// No environment facts and no rules, so every Action falls through to the default Effect `ask`.
export const EMPTY_POLICY_DOCUMENT: PolicyDocumentV2 = {
  schemaVersion: 2,
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
