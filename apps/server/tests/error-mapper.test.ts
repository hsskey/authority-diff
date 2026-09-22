import { describe, expect, test } from 'vitest';
import { httpStatusForError, internalUnexpected, toErrorEnvelope } from '../src/http/errors.ts';
import { buildApp } from './support/harness.ts';

describe('httpStatusForError', () => {
  test('maps a known auth code to 401', () => {
    expect(httpStatusForError(internalUnexpected(null))).toBe(500);
    expect(
      httpStatusForError({
        code: 'auth.token_missing',
        message: 'x',
        isRetryable: false,
        details: null,
        cause: null,
      }),
    ).toBe(401);
  });

  test('maps an unknown code to 500', () => {
    expect(
      httpStatusForError({
        code: 'something.unmapped',
        message: 'x',
        isRetryable: false,
        details: null,
        cause: null,
      }),
    ).toBe(500);
  });
});

describe('toErrorEnvelope', () => {
  test('shapes the envelope and never includes the cause', () => {
    const envelope = toErrorEnvelope(internalUnexpected(new Error('secret internals')), 'req_42');
    expect(envelope).toEqual({
      error: {
        code: 'internal.unexpected',
        message: 'an unexpected error occurred',
        isRetryable: false,
        details: null,
        requestId: 'req_42',
      },
    });
    expect(JSON.stringify(envelope)).not.toContain('secret internals');
  });
});

describe('onError mapping', () => {
  test('maps a thrown exception to a 500 internal.unexpected envelope', async () => {
    const app = buildApp();
    app.get('/boom', () => {
      throw new Error('kaboom internals');
    });

    const res = await app.request('/boom');
    const body: unknown = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ error: { code: 'internal.unexpected' } });
    expect(res.headers.get('X-Request-Id')).toMatch(/^req_/);
    expect(JSON.stringify(body)).not.toContain('kaboom internals');
  });
});
