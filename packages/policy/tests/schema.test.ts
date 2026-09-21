import { describe, expect, expectTypeOf, test } from 'vitest';
import type { Capability, Operation, Target } from '@authority/action/schema';
import {
  PolicyDocumentSchema,
  type Decision,
  type EnvironmentProfile,
  type EvaluateAction,
  type PolicyDocument,
  type PolicyIssue,
  type ResolveZone,
  type ValidatePolicyDocument,
  type Zone,
} from '../schema.ts';
import baselinePolicyFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };

describe('policy schema', () => {
  test('accepts a valid synthetic Policy Document', () => {
    expect(PolicyDocumentSchema.safeParse(baselinePolicyFixture).success).toBe(true);
  });

  test('rejects a Rule with no Capabilities', () => {
    const firstRule = baselinePolicyFixture.rules[0];
    expect(
      PolicyDocumentSchema.safeParse({
        ...baselinePolicyFixture,
        rules: [
          {
            ...firstRule,
            match: {
              ...firstRule?.match,
              capabilities: [],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('rejects schemaVersion 2', () => {
    expect(
      PolicyDocumentSchema.safeParse({
        ...baselinePolicyFixture,
        schemaVersion: 2,
      }).success,
    ).toBe(false);
  });

  test('exports policy contract signatures', () => {
    expectTypeOf<ResolveZone>().toEqualTypeOf<
      (target: Target, capability: Capability, environment: EnvironmentProfile) => Zone
    >();
    expectTypeOf<EvaluateAction>().toEqualTypeOf<
      (operations: readonly Operation[], document: PolicyDocument) => Decision | null
    >();
    expectTypeOf<ValidatePolicyDocument>().toEqualTypeOf<
      (document: PolicyDocument) => readonly PolicyIssue[]
    >();
  });
});
