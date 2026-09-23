import { describe, expect, test } from 'vitest';
import { err, ok } from '@authority/kernel';
import {
  AdoptionGroupSamplesResponseSchema,
  ErrorEnvelopeSchema,
  ListAdoptionGroupsResponseSchema,
  ReplayRunResponseSchema,
} from '@authority/contracts/schema';
import type { ListAdoptionGroupsInput, RequestAdoptionReplayInput } from '@authority/replay';
import {
  authed,
  buildReplayApp,
  GROUP_KEY,
  makeModule,
  RUN_ID,
  sampleAdoptionGroup,
  sampleAdoptionRun,
  VERSION_ID,
} from './support.ts';

const WINDOW = { windowFrom: '2026-01-01T00:00:00.000Z', windowTo: '2026-01-02T00:00:00.000Z' };

describe('POST /api/v1/replay-runs with kind adoption', () => {
  test('dispatches to the adoption run and returns 202 with the run', async () => {
    const received: RequestAdoptionReplayInput[] = [];
    const app = buildReplayApp(
      makeModule({
        requestAdoptionReplay: (input) => {
          received.push(input);
          return Promise.resolve(
            ok({ run: sampleAdoptionRun(), reused: false, execution: Promise.resolve() }),
          );
        },
      }),
    );

    const res = await app.request(
      '/api/v1/replay-runs',
      authed({
        method: 'POST',
        body: JSON.stringify({ kind: 'adoption', candidateVersionId: VERSION_ID, ...WINDOW }),
      }),
    );

    expect(res.status).toBe(202);
    const body = ReplayRunResponseSchema.parse(await res.json());
    expect([body.kind, body.baselineVersionId]).toEqual(['adoption', null]);
    expect(received).toMatchObject([{ candidateVersionId: VERSION_ID, ...WINDOW }]);
  });

  test('returns 200 when a completed run with the same inputs is reused', async () => {
    const app = buildReplayApp(
      makeModule({
        requestAdoptionReplay: () =>
          Promise.resolve(
            ok({ run: sampleAdoptionRun({ status: 'completed' }), reused: true, execution: null }),
          ),
      }),
    );

    const res = await app.request(
      '/api/v1/replay-runs',
      authed({
        method: 'POST',
        body: JSON.stringify({ kind: 'adoption', candidateVersionId: VERSION_ID, ...WINDOW }),
      }),
    );

    expect(res.status).toBe(200);
  });

  test('maps an unknown candidate version to 422', async () => {
    const app = buildReplayApp(
      makeModule({
        requestAdoptionReplay: () =>
          Promise.resolve(
            err({
              code: 'replay.source_invalid',
              message: 'no policy version',
              isRetryable: false,
              details: null,
              cause: null,
            }),
          ),
      }),
    );

    const res = await app.request(
      '/api/v1/replay-runs',
      authed({
        method: 'POST',
        body: JSON.stringify({ kind: 'adoption', candidateVersionId: VERSION_ID, ...WINDOW }),
      }),
    );

    expect(res.status).toBe(422);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('replay.source_invalid');
  });
});

describe('GET /api/v1/replay-runs/:id/adoption-groups', () => {
  test('passes the effect filter, cursor, and limit through and returns the page', async () => {
    const received: ListAdoptionGroupsInput[] = [];
    const app = buildReplayApp(
      makeModule({
        listAdoptionGroups: (_id, input) => {
          received.push(input);
          return Promise.resolve(ok({ items: [sampleAdoptionGroup()], nextCursor: null }));
        },
      }),
    );

    const res = await app.request(
      `/api/v1/replay-runs/${RUN_ID}/adoption-groups?effect=deny&limit=5&cursor=${GROUP_KEY}`,
      authed(),
    );

    expect(res.status).toBe(200);
    const body = ListAdoptionGroupsResponseSchema.parse(await res.json());
    expect(body.items.map((group) => group.groupKey)).toEqual([GROUP_KEY]);
    expect(received).toEqual([{ effect: 'deny', cursor: GROUP_KEY, limit: 5 }]);
  });

  test('rejects an effect outside ask and deny with 422', async () => {
    const app = buildReplayApp(makeModule());

    const res = await app.request(
      `/api/v1/replay-runs/${RUN_ID}/adoption-groups?effect=allow`,
      authed(),
    );

    expect(res.status).toBe(422);
  });

  test('maps an unknown run to 404', async () => {
    const app = buildReplayApp(
      makeModule({
        listAdoptionGroups: (id) =>
          Promise.resolve(
            err({
              code: 'replay.run_not_found',
              message: `no replay run ${id}`,
              isRetryable: false,
              details: null,
              cause: null,
            }),
          ),
      }),
    );

    const res = await app.request(`/api/v1/replay-runs/${RUN_ID}/adoption-groups`, authed());

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/adoption-groups/:runId/:groupKey/samples', () => {
  test('returns the candidate-only samples of the group', async () => {
    const app = buildReplayApp(
      makeModule({
        getAdoptionSamples: () => Promise.resolve(ok([])),
      }),
    );

    const res = await app.request(
      `/api/v1/adoption-groups/${RUN_ID}/${GROUP_KEY}/samples`,
      authed(),
    );

    expect(res.status).toBe(200);
    expect(AdoptionGroupSamplesResponseSchema.parse(await res.json())).toEqual({ items: [] });
  });

  test('maps a malformed group key to 404 without calling the module', async () => {
    const app = buildReplayApp(makeModule());

    const res = await app.request(`/api/v1/adoption-groups/${RUN_ID}/not-a-hash/samples`, authed());

    expect(res.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('replay.group_not_found');
  });
});
