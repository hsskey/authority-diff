import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import { createSequentialIdGenerator } from '@authority/platform/testing';
import type { AppEnv } from '../src/http/env.ts';
import { createAuthMiddleware } from '../src/http/middleware/auth.ts';
import { createRequestIdMiddleware } from '../src/http/middleware/request-id.ts';
import { testConfig } from './support/harness.ts';

const TOKEN = 'the-real-token';

function guardedApp() {
  const app = new Hono<AppEnv>();
  app.use('*', createRequestIdMiddleware(createSequentialIdGenerator()));
  app.use('/guarded', createAuthMiddleware(testConfig(TOKEN)));
  app.get('/guarded', (c) => c.json({ ok: true }));
  return app;
}

describe('auth middleware', () => {
  test('rejects a request with no authorization header as token_missing', async () => {
    const res = await guardedApp().request('/guarded');
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: { code: 'auth.token_missing' } });
  });

  test('rejects a bearer token that does not match as token_invalid', async () => {
    const res = await guardedApp().request('/guarded', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: { code: 'auth.token_invalid' } });
  });

  test('rejects a non-bearer authorization header as token_missing', async () => {
    const res = await guardedApp().request('/guarded', {
      headers: { Authorization: TOKEN },
    });
    const body: unknown = await res.json();
    expect(res.status).toBe(401);
    expect(body).toMatchObject({ error: { code: 'auth.token_missing' } });
  });

  test('passes a request bearing the configured token', async () => {
    const res = await guardedApp().request('/guarded', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const body: unknown = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
