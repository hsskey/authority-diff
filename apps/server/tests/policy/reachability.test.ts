import { describe, expect, test } from 'vitest';
import { buildApp } from '../support/harness.ts';
import { authed } from './support.ts';

const BAD_ID = 'not-a-valid-id';

interface Endpoint {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

const ENDPOINTS: readonly Endpoint[] = [
  {
    name: 'POST /api/v1/policies',
    method: 'POST',
    path: '/api/v1/policies',
    body: { name: '', template: 'nope' },
  },
  { name: 'GET /api/v1/policies', method: 'GET', path: '/api/v1/policies?limit=999' },
  {
    name: 'POST /api/v1/policies/:policyId/versions',
    method: 'POST',
    path: `/api/v1/policies/${BAD_ID}/versions`,
  },
  {
    name: 'GET /api/v1/policy-versions/:id',
    method: 'GET',
    path: `/api/v1/policy-versions/${BAD_ID}`,
  },
  {
    name: 'PUT /api/v1/policy-versions/:id',
    method: 'PUT',
    path: `/api/v1/policy-versions/${BAD_ID}`,
  },
  {
    name: 'POST /api/v1/policy-versions/:id/validations',
    method: 'POST',
    path: `/api/v1/policy-versions/${BAD_ID}/validations`,
  },
];

describe('policy routes are wired into the real application', () => {
  test.each(ENDPOINTS)(
    '$name is protected by the auth middleware (401)',
    async ({ method, path, body }) => {
      const app = buildApp();
      const res = await app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(res.status).toBe(401);
    },
  );

  test.each(ENDPOINTS)(
    '$name reaches its handler behind auth, not a no-route 404',
    async ({ method, path, body }) => {
      const app = buildApp();
      const res = await app.request(
        path,
        authed({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
      );
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(422);
    },
  );
});
