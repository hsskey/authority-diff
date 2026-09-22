import { describe, expect, test } from 'vitest';
import { buildApp } from '../support/harness.ts';
import { authed } from './support.ts';

interface Endpoint {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

const ENDPOINTS: readonly Endpoint[] = [
  {
    name: 'POST /api/v1/trace-imports',
    method: 'POST',
    path: '/api/v1/trace-imports',
    body: { runtime: 'nope' },
  },
  {
    name: 'POST /api/v1/runtime-observations',
    method: 'POST',
    path: '/api/v1/runtime-observations',
    body: { runtime: 'claude_code' },
  },
  {
    name: 'POST /api/v1/actions/reclassify',
    method: 'POST',
    path: '/api/v1/actions/reclassify',
    body: { windowFrom: 'not-a-date' },
  },
  {
    name: 'GET /api/v1/actions/:actionKey',
    method: 'GET',
    path: `/api/v1/actions/${'a'.repeat(64)}`,
  },
];

describe('trace routes are wired into the real application', () => {
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

  test.each(ENDPOINTS.filter((endpoint) => endpoint.method !== 'GET'))(
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

  test('GET /api/v1/actions/:actionKey reaches its handler behind auth', async () => {
    const app = buildApp();
    const res = await app.request(`/api/v1/actions/${'a'.repeat(64)}`, authed());
    expect(res.status).not.toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
