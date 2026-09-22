import { describe, expect, test } from 'vitest';
import { buildApp, okProbe, probeThatFails } from './support/harness.ts';

describe('health endpoints', () => {
  test('healthz reports liveness with a request id header', async () => {
    const res = await buildApp().request('/healthz');
    const body: unknown = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
    expect(res.headers.get('X-Request-Id')).toMatch(/^req_/);
  });

  test('readyz reports ready when the database ping succeeds', async () => {
    const res = await buildApp({ db: okProbe }).request('/readyz');
    const body: unknown = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  test('readyz returns 503 when the database ping fails', async () => {
    const db = probeThatFails({
      code: 'platform.database_unavailable',
      message: 'the database is unavailable',
      isRetryable: true,
      details: null,
      cause: null,
    });
    const res = await buildApp({ db }).request('/readyz');
    const body: unknown = await res.json();
    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: {
        code: 'platform.database_unavailable',
        message: 'the database is unavailable',
        isRetryable: true,
        details: null,
        requestId: 'req_00000000000000000000000001',
      },
    });
  });
});
