import type { PolicyDocument } from '../../schema.ts';

// The `empty` template (POST /policies). A valid schemaVersion 1 document with
// no environment facts and no rules; every Action falls through to the default
// Effect `ask`.
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
