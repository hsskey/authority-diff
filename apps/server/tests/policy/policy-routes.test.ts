import { describe, expect, test } from 'vitest';
import { err, ok } from '@authority/kernel';
import {
  CreatePolicyResponseSchema,
  ErrorEnvelopeSchema,
  ListPoliciesResponseSchema,
  PolicyVersionResponseSchema,
  ValidatePolicyVersionResponseSchema,
} from '@authority/contracts/schema';
import { DEFAULT_POLICY_DOCUMENT } from '@authority/policy';
import { authed, buildPolicyApp, makeModule, samplePolicy, sampleVersion } from './support.ts';

const POLICY_ID = `pol_${'A'.repeat(26)}`;
const VERSION_ID = `pver_${'B'.repeat(26)}`;

const policyError = (code: string) =>
  err({ code, message: code, isRetryable: false, details: null, cause: null });

describe('POST /api/v1/policies', () => {
  test('creates a policy and returns 201 with the policy and its draft version 1', async () => {
    const app = buildPolicyApp(
      makeModule({
        createPolicy: () =>
          Promise.resolve(
            ok({
              policy: samplePolicy({ name: 'alpha' }),
              initialVersion: sampleVersion({ status: 'draft' }),
            }),
          ),
      }),
    );
    const res = await app.request(
      '/api/v1/policies',
      authed({ method: 'POST', body: JSON.stringify({ name: 'alpha', template: 'default' }) }),
    );
    expect(res.status).toBe(201);
    const body = CreatePolicyResponseSchema.parse(await res.json());
    expect(body.policy.name).toBe('alpha');
    expect(body.initialVersion).toMatchObject({ policyId: body.policy.id, status: 'draft' });
  });

  test.each([
    ['policy.name_conflict', 409],
    ['policy.organization_policy_exists', 409],
  ] as const)('maps %s to %d', async (code, status) => {
    const app = buildPolicyApp(
      makeModule({ createPolicy: () => Promise.resolve(policyError(code)) }),
    );
    const res = await app.request(
      '/api/v1/policies',
      authed({ method: 'POST', body: JSON.stringify({ name: 'dup', template: 'empty' }) }),
    );
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe(code);
  });

  test('rejects a malformed body with 422', async () => {
    const app = buildPolicyApp(makeModule());
    const res = await app.request(
      '/api/v1/policies',
      authed({ method: 'POST', body: JSON.stringify({ name: '', template: 'nope' }) }),
    );
    expect(res.status).toBe(422);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe(
      'validation.invalid_request',
    );
  });
});

describe('GET /api/v1/policies', () => {
  test('returns a page with items and nextCursor', async () => {
    const app = buildPolicyApp(
      makeModule({
        listPolicies: () => Promise.resolve(ok({ items: [samplePolicy()], nextCursor: null })),
      }),
    );
    const res = await app.request('/api/v1/policies', authed());
    expect(res.status).toBe(200);
    const body = ListPoliciesResponseSchema.parse(await res.json());
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  test('rejects an out-of-range limit with 422', async () => {
    const app = buildPolicyApp(makeModule());
    const res = await app.request('/api/v1/policies?limit=999', authed());
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/policies/:policyId/versions', () => {
  test('creates a draft version and returns 201', async () => {
    let receivedBase = '';
    const app = buildPolicyApp(
      makeModule({
        createDraftVersion: (_policyId, baseVersionId) => {
          receivedBase = baseVersionId;
          return Promise.resolve(ok(sampleVersion({ versionNumber: 2 })));
        },
      }),
    );
    const res = await app.request(
      `/api/v1/policies/${POLICY_ID}/versions`,
      authed({ method: 'POST', body: JSON.stringify({ baseVersionId: VERSION_ID }) }),
    );
    expect(res.status).toBe(201);
    expect(receivedBase).toBe(VERSION_ID);
    expect(PolicyVersionResponseSchema.parse(await res.json()).versionNumber).toBe(2);
  });

  test.each([
    ['policy.version_not_found', 404],
    ['policy.draft_exists', 409],
  ] as const)('maps %s to %d', async (code, status) => {
    const app = buildPolicyApp(
      makeModule({ createDraftVersion: () => Promise.resolve(policyError(code)) }),
    );
    const res = await app.request(
      `/api/v1/policies/${POLICY_ID}/versions`,
      authed({ method: 'POST', body: JSON.stringify({ baseVersionId: VERSION_ID }) }),
    );
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe(code);
  });
});

describe('GET /api/v1/policy-versions/:id', () => {
  test('returns the version with an ETag of its content hash', async () => {
    const version = sampleVersion({ contentHash: 'c'.repeat(64) });
    const app = buildPolicyApp(makeModule({ getVersion: () => Promise.resolve(ok(version)) }));
    const res = await app.request(`/api/v1/policy-versions/${VERSION_ID}`, authed());
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('c'.repeat(64));
    expect(PolicyVersionResponseSchema.parse(await res.json()).id).toBe(VERSION_ID);
  });

  test('maps a missing version to 404', async () => {
    const app = buildPolicyApp(
      makeModule({ getVersion: () => Promise.resolve(policyError('policy.version_not_found')) }),
    );
    const res = await app.request(`/api/v1/policy-versions/${VERSION_ID}`, authed());
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/policy-versions/:id', () => {
  test('forwards the If-Match hash and returns the updated version', async () => {
    let receivedIfMatch = '';
    const app = buildPolicyApp(
      makeModule({
        updateDraftDocument: (_id, ifMatch) => {
          receivedIfMatch = ifMatch;
          return Promise.resolve(ok(sampleVersion({ contentHash: 'd'.repeat(64) })));
        },
      }),
    );
    const res = await app.request(
      `/api/v1/policy-versions/${VERSION_ID}`,
      authed({
        method: 'PUT',
        headers: { 'If-Match': 'a'.repeat(64) },
        body: JSON.stringify({ document: DEFAULT_POLICY_DOCUMENT }),
      }),
    );
    expect(res.status).toBe(200);
    expect(receivedIfMatch).toBe('a'.repeat(64));
    expect(res.headers.get('ETag')).toBe('d'.repeat(64));
  });

  test('requires an If-Match header (428)', async () => {
    const app = buildPolicyApp(makeModule());
    const res = await app.request(
      `/api/v1/policy-versions/${VERSION_ID}`,
      authed({ method: 'PUT', body: JSON.stringify({ document: DEFAULT_POLICY_DOCUMENT }) }),
    );
    expect(res.status).toBe(428);
  });

  test.each([
    ['policy.content_conflict', 412],
    ['policy.version_not_draft', 409],
  ] as const)('maps %s to %d', async (code, status) => {
    const app = buildPolicyApp(
      makeModule({ updateDraftDocument: () => Promise.resolve(policyError(code)) }),
    );
    const res = await app.request(
      `/api/v1/policy-versions/${VERSION_ID}`,
      authed({
        method: 'PUT',
        headers: { 'If-Match': 'a'.repeat(64) },
        body: JSON.stringify({ document: DEFAULT_POLICY_DOCUMENT }),
      }),
    );
    expect(res.status).toBe(status);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe(code);
  });

  test('rejects an invalid document with 422', async () => {
    const app = buildPolicyApp(makeModule());
    const res = await app.request(
      `/api/v1/policy-versions/${VERSION_ID}`,
      authed({
        method: 'PUT',
        headers: { 'If-Match': 'a'.repeat(64) },
        body: JSON.stringify({ document: { schemaVersion: 2 } }),
      }),
    );
    expect(res.status).toBe(422);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('policy.document_invalid');
  });
});

describe('POST /api/v1/policy-versions/:id/validations', () => {
  test('returns the validation result', async () => {
    const app = buildPolicyApp(
      makeModule({ validateVersion: () => Promise.resolve(ok({ isValid: true, issues: [] })) }),
    );
    const res = await app.request(
      `/api/v1/policy-versions/${VERSION_ID}/validations`,
      authed({ method: 'POST' }),
    );
    expect(res.status).toBe(200);
    expect(ValidatePolicyVersionResponseSchema.parse(await res.json()).isValid).toBe(true);
  });
});

describe('authentication', () => {
  test('rejects a request without a bearer token', async () => {
    const app = buildPolicyApp(makeModule());
    const res = await app.request('/api/v1/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'alpha', template: 'default' }),
    });
    expect(res.status).toBe(401);
  });
});
