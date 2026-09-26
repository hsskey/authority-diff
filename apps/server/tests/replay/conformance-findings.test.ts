import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema, err, ok } from '@authority/kernel';
import {
  ConformanceFindingResponseSchema,
  ErrorEnvelopeSchema,
  ListConformanceFindingsResponseSchema,
  PolicyVersionResponseSchema,
} from '@authority/contracts/schema';
import { DEFAULT_POLICY_DOCUMENT } from '@authority/policy';
import { PolicyVersionIdSchema, PolicyVersionSchema } from '@authority/policy/schema';
import { ConformanceFindingViewSchema, ReplayRunIdSchema } from '@authority/replay/schema';
import { Hono } from 'hono';
import { createSequentialIdGenerator } from '@authority/platform/testing';
import type { ReplayModule } from '@authority/replay';
import type { ReviewModule } from '@authority/review';
import { createAuthMiddleware } from '#src/http/middleware/auth.ts';
import { createRequestIdMiddleware } from '#src/http/middleware/request-id.ts';
import {
  registerConformanceFindingDraftRoutes,
  registerConformanceFindingsRoutes,
} from '#src/http/routes/conformance-findings.routes.ts';
import type { AppEnv } from '#src/http/env.ts';
import { testConfig } from '../support/harness.ts';
import { authed, makeModule } from './support.ts';

const FINDING_KEY = 'ab'.repeat(32);

function sampleFinding() {
  return ConformanceFindingViewSchema.parse({
    findingKey: FINDING_KEY,
    kind: 'over_asked',
    capability: 'push',
    zone: 'public_remote',
    program: 'git',
    actionCount: 1,
    sessionCount: 1,
    firstOccurredAt: '2026-01-02T03:04:05.006Z',
    lastOccurredAt: '2026-01-02T03:04:05.006Z',
    sampleActionKeys: ['c'.repeat(64)],
    status: 'acknowledged',
    note: 'expected',
  });
}

function sampleDraft() {
  return PolicyVersionSchema.parse({
    id: `pver_${'D'.repeat(26)}`,
    policyId: `pol_${'E'.repeat(26)}`,
    versionNumber: 2,
    status: 'draft',
    document: DEFAULT_POLICY_DOCUMENT,
    contentHash: 'f'.repeat(64),
    baseVersionId: `pver_${'A'.repeat(26)}`,
    createdAt: '2026-01-02T03:04:05.006Z',
    updatedAt: '2026-01-02T03:04:05.006Z',
  });
}

function buildApp(
  replay: ReplayModule,
  review?: Pick<ReviewModule, 'createPolicyDraftFromFinding'>,
) {
  const app = new Hono<AppEnv>();
  app.use('*', createRequestIdMiddleware(createSequentialIdGenerator()));
  app.use('/api/v1/*', createAuthMiddleware(testConfig()));
  registerConformanceFindingsRoutes(app, replay);
  if (review !== undefined) {
    registerConformanceFindingDraftRoutes(app, review);
  }
  return app;
}

describe('GET /api/v1/conformance-findings', () => {
  test('returns the observation gaps of the latest run window', async () => {
    const gap = {
      from: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
      to: IsoTimestampSchema.parse('2026-01-03T00:00:00.000Z'),
    };
    const app = buildApp(
      makeModule({
        listConformanceFindings: () =>
          Promise.resolve({
            run: {
              replayRunId: ReplayRunIdSchema.parse(`rpl_${'A'.repeat(26)}`),
              policyVersionId: PolicyVersionIdSchema.parse(`pver_${'B'.repeat(26)}`),
              windowFrom: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
              windowTo: IsoTimestampSchema.parse('2026-01-07T23:59:59.999Z'),
              unpairedPermissionRequests: 0,
              byPermissionMode: [],
              observationGaps: [gap],
            },
            items: [],
          }),
      }),
    );

    const res = await app.request('/api/v1/conformance-findings', authed({ method: 'GET' }));

    expect(
      ListConformanceFindingsResponseSchema.parse(await res.json()).run?.observationGaps,
    ).toEqual([gap]);
  });
});

describe('PUT /api/v1/conformance-findings/:id', () => {
  test('acknowledges the finding and returns it', async () => {
    const received: { findingKey: string; note: string }[] = [];
    const app = buildApp(
      makeModule({
        acknowledgeConformanceFinding: (findingKey, note) => {
          received.push({ findingKey, note });
          return Promise.resolve(ok(sampleFinding()));
        },
      }),
    );

    const res = await app.request(
      `/api/v1/conformance-findings/${FINDING_KEY}`,
      authed({
        method: 'PUT',
        body: JSON.stringify({ status: 'acknowledged', note: 'expected' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(ConformanceFindingResponseSchema.parse(await res.json())).toMatchObject({
      findingKey: FINDING_KEY,
      status: 'acknowledged',
      note: 'expected',
    });
    expect(received).toEqual([{ findingKey: FINDING_KEY, note: 'expected' }]);
  });

  test('maps an unknown finding to 404', async () => {
    const app = buildApp(
      makeModule({
        acknowledgeConformanceFinding: () =>
          Promise.resolve(
            err({
              code: 'replay.finding_not_found',
              message: 'no Conformance Finding for the given finding key',
              isRetryable: false,
              details: null,
              cause: null,
            }),
          ),
      }),
    );

    const res = await app.request(
      `/api/v1/conformance-findings/${FINDING_KEY}`,
      authed({
        method: 'PUT',
        body: JSON.stringify({ status: 'acknowledged', note: '' }),
      }),
    );

    expect(res.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('replay.finding_not_found');
  });

  test('rejects a malformed finding key with 404 without calling the module', async () => {
    const app = buildApp(makeModule());

    const res = await app.request(
      '/api/v1/conformance-findings/not-a-hash',
      authed({
        method: 'PUT',
        body: JSON.stringify({ status: 'acknowledged', note: '' }),
      }),
    );

    expect(res.status).toBe(404);
  });

  test('rejects a body that is not acknowledged with 422', async () => {
    const app = buildApp(makeModule());

    const res = await app.request(
      `/api/v1/conformance-findings/${FINDING_KEY}`,
      authed({
        method: 'PUT',
        body: JSON.stringify({ status: 'open', note: '' }),
      }),
    );

    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/conformance-findings/:id/policy-drafts', () => {
  test('creates a draft Policy Version from the finding', async () => {
    const received: { findingKey: string; effect: string }[] = [];
    const app = buildApp(makeModule(), {
      createPolicyDraftFromFinding: (findingKey, effect) => {
        received.push({ findingKey, effect });
        return Promise.resolve(ok(sampleDraft()));
      },
    });

    const res = await app.request(
      `/api/v1/conformance-findings/${FINDING_KEY}/policy-drafts`,
      authed({
        method: 'POST',
        body: JSON.stringify({ effect: 'ask' }),
      }),
    );

    expect(res.status).toBe(201);
    expect(PolicyVersionResponseSchema.parse(await res.json()).status).toBe('draft');
    expect(received).toEqual([{ findingKey: FINDING_KEY, effect: 'ask' }]);
  });

  test('maps draft_exists to 409', async () => {
    const app = buildApp(makeModule(), {
      createPolicyDraftFromFinding: () =>
        Promise.resolve(
          err({
            code: 'policy.draft_exists',
            message: 'already has an open draft',
            isRetryable: false,
            details: null,
            cause: null,
          }),
        ),
    });

    const res = await app.request(
      `/api/v1/conformance-findings/${FINDING_KEY}/policy-drafts`,
      authed({
        method: 'POST',
        body: JSON.stringify({ effect: 'ask' }),
      }),
    );

    expect(res.status).toBe(409);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('policy.draft_exists');
  });

  test('maps an unknown finding to 404', async () => {
    const app = buildApp(makeModule(), {
      createPolicyDraftFromFinding: () =>
        Promise.resolve(
          err({
            code: 'replay.finding_not_found',
            message: 'no Conformance Finding for the given finding key',
            isRetryable: false,
            details: null,
            cause: null,
          }),
        ),
    });

    const res = await app.request(
      `/api/v1/conformance-findings/${FINDING_KEY}/policy-drafts`,
      authed({
        method: 'POST',
        body: JSON.stringify({ effect: 'ask' }),
      }),
    );

    expect(res.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('replay.finding_not_found');
  });

  test('maps finding_effect_not_allowed to 422', async () => {
    const app = buildApp(makeModule(), {
      createPolicyDraftFromFinding: () =>
        Promise.resolve(
          err({
            code: 'replay.finding_effect_not_allowed',
            message:
              'a violation is a target for fixing the runtime configuration, not for relaxing the policy',
            isRetryable: false,
            details: null,
            cause: null,
          }),
        ),
    });

    const res = await app.request(
      `/api/v1/conformance-findings/${FINDING_KEY}/policy-drafts`,
      authed({
        method: 'POST',
        body: JSON.stringify({ effect: 'allow' }),
      }),
    );

    expect(res.status).toBe(422);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe(
      'replay.finding_effect_not_allowed',
    );
  });
});
