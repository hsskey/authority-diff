import { describe, expect, test } from 'vitest';
import { err, ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { createPolicyModule, DEFAULT_POLICY_DOCUMENT } from '../index.ts';
import type { CreatePolicyInput, PolicyRepository } from '../index.ts';
import { PolicySchema, PolicyVersionSchema } from '../schema.ts';
import type { Policy, PolicyVersion } from '../schema.ts';
import { expectErr } from './support/result.ts';

const POLICY_ID = `pol_${'A'.repeat(26)}`;

const existingPolicy: Policy = PolicySchema.parse({
  id: POLICY_ID,
  name: 'org-default',
  createdAt: '2026-01-01T00:00:00.000Z',
});

const draftVersion: PolicyVersion = PolicyVersionSchema.parse({
  id: `pver_${'B'.repeat(26)}`,
  policyId: POLICY_ID,
  versionNumber: 1,
  status: 'draft',
  document: DEFAULT_POLICY_DOCUMENT,
  contentHash: 'a'.repeat(64),
  baseVersionId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const INPUT: CreatePolicyInput = { name: 'org-default', template: 'default' };

// A store stub: each test configures the reads it needs and records the one
// write the module may forward. Unconfigured methods fail loudly.
function makeRepository(
  overrides: Partial<PolicyRepository> = {},
): PolicyRepository & { readonly createdWith: CreatePolicyInput[] } {
  const createdWith: CreatePolicyInput[] = [];
  const unconfigured = <T>(): Promise<Result<T, AppError>> =>
    Promise.resolve(
      err({
        code: 'internal.unexpected',
        message: 'store method not configured for this test',
        isRetryable: false,
        details: null,
        cause: null,
      }),
    );
  return {
    createdWith,
    createPolicy: (input) => {
      createdWith.push(input);
      return Promise.resolve(ok({ policy: existingPolicy, initialVersion: draftVersion }));
    },
    listPolicies: () => unconfigured(),
    listVersions: () => unconfigured(),
    getVersion: () => unconfigured(),
    createDraftVersion: () => unconfigured(),
    updateDraftDocument: () => unconfigured(),
    transitionVersion: () => unconfigured(),
    getBaseline: () => unconfigured(),
    hasAcceptedVersion: () => unconfigured(),
    seedAcceptedPolicy: () => unconfigured(),
    ...overrides,
  };
}

describe('createPolicyModule.createPolicy', () => {
  test('forwards the request to the store when the organization has no Policy', async () => {
    const repository = makeRepository({
      listPolicies: () => Promise.resolve(ok({ items: [], nextCursor: null })),
    });

    await createPolicyModule(repository).createPolicy(INPUT);

    expect(repository.createdWith).toEqual([INPUT]);
  });

  test('refuses a second Policy and names the existing one', async () => {
    const repository = makeRepository({
      listPolicies: () => Promise.resolve(ok({ items: [existingPolicy], nextCursor: null })),
    });

    const error = expectErr(await createPolicyModule(repository).createPolicy(INPUT));

    expect(error).toMatchObject({
      code: 'policy.organization_policy_exists',
      details: { policyId: POLICY_ID },
    });
  });

  test('does not write to the store when a Policy already exists', async () => {
    const repository = makeRepository({
      listPolicies: () => Promise.resolve(ok({ items: [existingPolicy], nextCursor: null })),
    });

    await createPolicyModule(repository).createPolicy(INPUT);

    expect(repository.createdWith).toEqual([]);
  });
});
