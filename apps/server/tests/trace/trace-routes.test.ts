import { describe, expect, test } from 'vitest';
import { err } from '@authority/kernel';
import {
  ActionResponseSchema,
  CreateRuntimeObservationsResponseSchema,
  ErrorEnvelopeSchema,
  ImportTraceResponseSchema,
  ReclassifyActionsResponseSchema,
} from '@authority/contracts/schema';
import parsedSessionFixture from '../../../../tests/fixtures/parsed-session.json' with { type: 'json' };
import { authed, buildTraceApp, makeModule, ok, sampleAction } from './support.ts';

const WINDOW = {
  windowFrom: '2026-01-01T00:00:00.000Z',
  windowTo: '2026-01-02T00:00:00.000Z',
};

describe('POST /api/v1/trace-imports', () => {
  test('classifies in the request and returns 201 with the contract shape', async () => {
    const app = buildTraceApp(
      makeModule({
        importTrace: () =>
          Promise.resolve(
            ok({
              importId: 'imp_01ARZ3NDEKTSV4RRFFQ69G5FAV',
              acceptedCount: 3,
              duplicateCount: 0,
              rejectedCount: 0,
            }),
          ),
      }),
    );
    const res = await app.request(
      '/api/v1/trace-imports',
      authed({ method: 'POST', body: JSON.stringify(parsedSessionFixture) }),
    );
    expect(res.status).toBe(201);
    const body = ImportTraceResponseSchema.parse(await res.json());
    expect(body.acceptedCount).toBe(3);
  });

  test('maps a redaction failure to 422', async () => {
    const app = buildTraceApp(
      makeModule({
        importTrace: () =>
          Promise.resolve(
            err({
              code: 'trace.redaction_missing',
              message: 'redaction missing',
              isRetryable: false,
              details: null,
              cause: null,
            }),
          ),
      }),
    );
    const res = await app.request(
      '/api/v1/trace-imports',
      authed({ method: 'POST', body: JSON.stringify(parsedSessionFixture) }),
    );
    expect(res.status).toBe(422);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('trace.redaction_missing');
  });

  test('rejects a batch over 1000 tool calls with 413', async () => {
    const app = buildTraceApp(makeModule());
    const res = await app.request(
      '/api/v1/trace-imports',
      authed({
        method: 'POST',
        body: JSON.stringify({
          ...parsedSessionFixture,
          toolCalls: Array.from({ length: 1001 }, (_, index) => ({
            ...parsedSessionFixture.toolCalls[0],
            toolUseId: `tool-${index}`,
            sequence: index,
          })),
        }),
      }),
    );
    expect(res.status).toBe(413);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('trace.batch_too_large');
  });

  test('rejects a malformed body with 422', async () => {
    const app = buildTraceApp(makeModule());
    const res = await app.request(
      '/api/v1/trace-imports',
      authed({ method: 'POST', body: JSON.stringify({ runtime: 'nope' }) }),
    );
    expect(res.status).toBe(422);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe(
      'validation.invalid_request',
    );
  });
});

describe('POST /api/v1/runtime-observations', () => {
  test('returns 201 with accepted and duplicate counts', async () => {
    const app = buildTraceApp(
      makeModule({
        ingestObservations: () => Promise.resolve({ acceptedCount: 2, duplicateCount: 1 }),
      }),
    );
    const res = await app.request(
      '/api/v1/runtime-observations',
      authed({
        method: 'POST',
        body: JSON.stringify({
          runtime: 'claude_code',
          observations: [
            {
              event: 'permission_request',
              sessionExternalId: 'session-a',
              toolName: 'Bash',
              toolInputHash: 'b'.repeat(64),
              cwd: '~/project',
              runtimeVersion: null,
              occurredAt: '2026-01-02T03:04:05.006Z',
            },
          ],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = CreateRuntimeObservationsResponseSchema.parse(await res.json());
    expect(body.acceptedCount).toBe(2);
    expect(body.duplicateCount).toBe(1);
  });

  test('rejects a malformed body with 422', async () => {
    const app = buildTraceApp(makeModule());
    const res = await app.request(
      '/api/v1/runtime-observations',
      authed({ method: 'POST', body: JSON.stringify({ runtime: 'claude_code' }) }),
    );
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/actions/reclassify', () => {
  test('returns the reclassification summary', async () => {
    const app = buildTraceApp(
      makeModule({
        reclassifyActions: () =>
          Promise.resolve({ reclassifiedCount: 4, classifierVersion: 'classifier-2' }),
      }),
    );
    const res = await app.request(
      '/api/v1/actions/reclassify',
      authed({ method: 'POST', body: JSON.stringify(WINDOW) }),
    );
    expect(res.status).toBe(200);
    const body = ReclassifyActionsResponseSchema.parse(await res.json());
    expect(body.reclassifiedCount).toBe(4);
    expect(body.classifierVersion).toBe('classifier-2');
  });

  test('rejects a malformed body with 422', async () => {
    const app = buildTraceApp(makeModule());
    const res = await app.request(
      '/api/v1/actions/reclassify',
      authed({ method: 'POST', body: JSON.stringify({ windowFrom: 'not-a-date' }) }),
    );
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/actions/:actionKey', () => {
  test('returns the action with a null decision', async () => {
    const action = sampleAction();
    const app = buildTraceApp(
      makeModule({
        reader: {
          getActions: () => Promise.resolve([action]),
          streamActions: () => ({
            [Symbol.asyncIterator]() {
              return { next: () => Promise.resolve({ done: true, value: undefined }) };
            },
          }),
          countStaleClassifications: () => Promise.resolve(0),
          listObservationSessions: () => Promise.resolve([]),
          getObservations: () => Promise.resolve([]),
        },
      }),
    );
    const res = await app.request(`/api/v1/actions/${action.actionKey}`, authed());
    expect(res.status).toBe(200);
    const body = ActionResponseSchema.parse(await res.json());
    expect(body.actionKey).toBe(action.actionKey);
    expect(body.decision).toBeNull();
  });

  test('maps a missing action to 404', async () => {
    const app = buildTraceApp(makeModule());
    const res = await app.request(`/api/v1/actions/${'c'.repeat(64)}`, authed());
    expect(res.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('trace.action_not_found');
  });
});

describe('authentication', () => {
  test('rejects a request without a bearer token', async () => {
    const app = buildTraceApp(makeModule());
    const res = await app.request('/api/v1/trace-imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedSessionFixture),
    });
    expect(res.status).toBe(401);
  });
});
