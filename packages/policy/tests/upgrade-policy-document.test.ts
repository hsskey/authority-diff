import { describe, expect, test } from 'vitest';
import { PolicyDocumentSchema } from '../schema.ts';
import { DEFAULT_POLICY_DOCUMENT, upgradePolicyDocument } from '../evaluate.ts';
import baselinePolicyFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };

const BASELINE = PolicyDocumentSchema.parse(baselinePolicyFixture);

describe('upgradePolicyDocument', () => {
  test('raises a schemaVersion 1 document by giving every Rule a null Mandate Exception', () => {
    expect(upgradePolicyDocument(BASELINE)).toEqual({
      ...baselinePolicyFixture,
      schemaVersion: 2,
      rules: baselinePolicyFixture.rules.map((rule) => ({ ...rule, mandateException: null })),
    });
  });

  test('leaves the schemaVersion 1 input unchanged', () => {
    upgradePolicyDocument(BASELINE);
    expect(BASELINE).toEqual(baselinePolicyFixture);
  });

  test('returns a schemaVersion 2 document as it is', () => {
    expect(upgradePolicyDocument(DEFAULT_POLICY_DOCUMENT)).toBe(DEFAULT_POLICY_DOCUMENT);
  });
});
