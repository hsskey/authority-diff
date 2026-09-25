import type { PolicyDocument, PolicyDocumentV2 } from '../../schema.ts';

/** Raises a document to schemaVersion 2 by giving every Rule a null Mandate Exception; a schemaVersion 2 document is returned unchanged. */
export function upgradePolicyDocument(document: PolicyDocument): PolicyDocumentV2 {
  if (document.schemaVersion === 2) {
    return document;
  }
  return {
    schemaVersion: 2,
    environment: document.environment,
    rules: document.rules.map((rule) => ({ ...rule, mandateException: null })),
  };
}
