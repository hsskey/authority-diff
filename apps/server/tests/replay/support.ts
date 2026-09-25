import { Hono } from 'hono';
import { err } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { createSequentialIdGenerator } from '@authority/platform/testing';
import type { ReplayModule } from '@authority/replay';
import { AdoptionGroupSchema, ReplayRunSchema } from '@authority/replay/schema';
import type { AdoptionGroup, ReplayRun } from '@authority/replay/schema';
import { createAuthMiddleware } from '../../src/http/middleware/auth.ts';
import { createRequestIdMiddleware } from '../../src/http/middleware/request-id.ts';
import { registerAdoptionGroupsRoutes } from '../../src/http/routes/adoption-groups.routes.ts';
import { registerReplayRunsRoutes } from '../../src/http/routes/replay-runs.routes.ts';
import type { AppEnv } from '../../src/http/env.ts';
import { testConfig } from '../support/harness.ts';

export const TOKEN = 'test-token';
export const RUN_ID = `rpl_${'A'.repeat(26)}`;
export const VERSION_ID = `pver_${'B'.repeat(26)}`;
export const GROUP_KEY = 'd'.repeat(64);
const TS = '2026-01-02T03:04:05.006Z';

export function sampleAdoptionRun(overrides: Partial<ReplayRun> = {}): ReplayRun {
  return ReplayRunSchema.parse({
    id: RUN_ID,
    kind: 'adoption',
    baselineVersionId: null,
    candidateVersionId: VERSION_ID,
    windowFrom: TS,
    windowTo: TS,
    status: 'queued',
    classifierVersion: 'test-classifier',
    inputsHash: 'a'.repeat(64),
    resultHash: null,
    stats: null,
    errorCode: null,
    createdAt: TS,
    startedAt: null,
    completedAt: null,
    ...overrides,
  });
}

export function sampleAdoptionGroup(overrides: Partial<AdoptionGroup> = {}): AdoptionGroup {
  return AdoptionGroupSchema.parse({
    groupKey: GROUP_KEY,
    effect: 'deny',
    capability: 'read',
    zone: 'credentials',
    program: null,
    programSummary: [{ program: 'cat', count: 1 }],
    distinctProgramCount: 1,
    actionCount: 1,
    sessionCount: 1,
    analyzabilityNoneCount: 0,
    firstOccurredAt: TS,
    lastOccurredAt: TS,
    decidingRuleIds: ['deny_credentials_access'],
    targetSummary: [{ key: '~/.synthetic-credentials', count: 1 }],
    headline: "This policy gives 'deny' to 1 read Action in the credentials Zone.",
    sampleActionKeys: ['b'.repeat(64)],
    ...overrides,
  });
}

// A fake so the route mapping is tested without a database; each test overrides
// the one method it exercises. Unconfigured methods fail loudly.
export function makeModule(overrides: Partial<ReplayModule> = {}): ReplayModule {
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
    requestReplay: () => unconfigured(),
    requestConformanceReplay: () => unconfigured(),
    requestAdoptionReplay: () => unconfigured(),
    listConformanceFindings: () => Promise.resolve({ run: null, items: [] }),
    getConformanceFinding: () => unconfigured(),
    acknowledgeConformanceFinding: () => unconfigured(),
    getRun: () => Promise.resolve(null),
    listDiffGroups: () => unconfigured(),
    getSamples: () => unconfigured(),
    listAdoptionGroups: () => unconfigured(),
    getAdoptionSamples: () => unconfigured(),
    getAuthorityMap: () =>
      Promise.resolve({ run: null, cells: [], analyzability: { full: 0, partial: 0, none: 0 } }),
    recoverInterruptedRuns: () => Promise.resolve(),
    runReplay: () => Promise.resolve(),
    runReplayJob: () => Promise.resolve(),
    ...overrides,
  };
}

export function buildReplayApp(replay: ReplayModule): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', createRequestIdMiddleware(createSequentialIdGenerator()));
  app.use('/api/v1/*', createAuthMiddleware(testConfig()));
  registerReplayRunsRoutes(app, replay);
  registerAdoptionGroupsRoutes(app, replay);
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
