import { describe, expect, expectTypeOf, test } from 'vitest';
import type { Operation } from '@authority/action/schema';
import {
  PolicyDocumentSchema,
  PolicySchema,
  PolicyVersionSchema,
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

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const HASH = 'a'.repeat(64);
const TS = '2026-01-02T03:04:05.006Z';

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
      (operation: Operation, environment: EnvironmentProfile) => Zone
    >();
    expectTypeOf<EvaluateAction>().toEqualTypeOf<
      (operations: readonly Operation[], document: PolicyDocument) => Decision | null
    >();
    expectTypeOf<ValidatePolicyDocument>().toEqualTypeOf<
      (document: PolicyDocument) => readonly PolicyIssue[]
    >();
  });
});

describe('policy storage schema round-trip', () => {
  test('accepts a Policy', () => {
    const value = { id: `pol_${ULID}`, name: 'default', createdAt: TS };
    expect(PolicySchema.parse(value)).toEqual(value);
  });

  test('accepts a draft Policy Version and rejects an unknown status', () => {
    const value = {
      id: `pver_${ULID}`,
      policyId: `pol_${ULID}`,
      versionNumber: 1,
      status: 'draft',
      document: baselinePolicyFixture,
      contentHash: HASH,
      baseVersionId: null,
      createdAt: TS,
      updatedAt: TS,
    };
    expect(PolicyVersionSchema.parse(value)).toEqual(value);
    expect(PolicyVersionSchema.safeParse({ ...value, status: 'active' }).success).toBe(false);
  });
});
