import { Hono } from 'hono';
import { err } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { createSequentialIdGenerator } from '@authority/platform/testing';
import { DEFAULT_POLICY_DOCUMENT } from '@authority/policy';
import type { PolicyModule } from '@authority/policy';
import { PolicySchema, PolicyVersionSchema } from '@authority/policy/schema';
import type { Policy, PolicyVersion } from '@authority/policy/schema';
import { createAuthMiddleware } from '../../src/http/middleware/auth.ts';
import { createRequestIdMiddleware } from '../../src/http/middleware/request-id.ts';
import { registerPolicyRoutes } from '../../src/modules/policy.wiring.ts';
import type { AppEnv } from '../../src/http/env.ts';
import { testConfig } from '../support/harness.ts';

export const TOKEN = 'test-token';

const POLICY_ID = `pol_${'A'.repeat(26)}`;
const VERSION_ID = `pver_${'B'.repeat(26)}`;

export function samplePolicy(overrides: Partial<Policy> = {}): Policy {
  return PolicySchema.parse({
    id: POLICY_ID,
    name: 'alpha',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

export function sampleVersion(overrides: Partial<PolicyVersion> = {}): PolicyVersion {
  return PolicyVersionSchema.parse({
    id: VERSION_ID,
    policyId: POLICY_ID,
    versionNumber: 1,
    status: 'draft',
    document: DEFAULT_POLICY_DOCUMENT,
    contentHash: 'a'.repeat(64),
    baseVersionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

// A fake so the route mapping is tested without a database; each test overrides
// the one method it exercises. Unconfigured methods fail loudly.
export function makeModule(overrides: Partial<PolicyModule> = {}): PolicyModule {
  const unconfigured = <T>(): Promise<Result<T, AppError>> =>
    Promise.resolve(
      err({
        code: 'internal.unexpected',
        message: 'module method not configured for this test',
        isRetryable: false,
        details: null,
        cause: null,
      }),
    );
  return {
    createPolicy: () => unconfigured(),
    listPolicies: () => unconfigured(),
    getVersion: () => unconfigured(),
    createDraftVersion: () => unconfigured(),
    updateDraftDocument: () => unconfigured(),
    transitionVersion: () => unconfigured(),
    getBaseline: () => unconfigured(),
    seedAcceptedPolicy: () => unconfigured(),
    validateVersion: () => unconfigured(),
    ...overrides,
  };
}

export function buildPolicyApp(policy: PolicyModule): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', createRequestIdMiddleware(createSequentialIdGenerator()));
  app.use('/api/v1/*', createAuthMiddleware(testConfig()));
  registerPolicyRoutes(app, policy);
  return app;
}

type AuthedInit = { method?: string; body?: string; headers?: Record<string, string> };

export function authed(init: AuthedInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  };
}
