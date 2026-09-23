import { Hono } from 'hono';
import { err, IsoTimestampSchema, ok } from '@authority/kernel';
import type { AppError, Clock, Result } from '@authority/kernel';
import { createSequentialIdGenerator } from '@authority/platform/testing';
import type { TraceModule } from '@authority/trace';
import { StoredAgentActionSchema } from '@authority/trace/schema';
import type { ActivityOverview, StoredAgentAction } from '@authority/trace/schema';
import { createAuthMiddleware } from '../../src/http/middleware/auth.ts';
import { createRequestIdMiddleware } from '../../src/http/middleware/request-id.ts';
import { registerTraceRoutes } from '../../src/modules/trace.wiring.ts';
import type { AppEnv } from '../../src/http/env.ts';
import { testConfig } from '../support/harness.ts';

export const TOKEN = 'test-token';
export const NOW = '2026-01-31T00:00:00.000Z';

const fixedClock: Clock = { now: () => IsoTimestampSchema.parse(NOW) };

const ACTION_KEY = 'a'.repeat(64);

export function sampleAction(overrides: Partial<StoredAgentAction> = {}): StoredAgentAction {
  return StoredAgentActionSchema.parse({
    actionKey: ACTION_KEY,
    sessionExternalId: 'synthetic-session-001',
    operations: [
      {
        index: 0,
        capability: 'write',
        target: {
          kind: 'path',
          path: '~/synthetic-workspace/note.txt',
          isInsideWorkspace: true,
        },
        analyzability: 'full',
        program: null,
        fragment: 'synthetic redacted write',
        signals: [],
      },
    ],
    observedOutcome: 'executed',
    occurredAt: '2026-01-02T03:04:05.006Z',
    toolName: 'SyntheticWrite',
    toolInputRedacted: '{"path":"note.txt"}',
    isInputTruncated: false,
    isSidechain: false,
    classifierVersion: 'test-classifier',
    recordedAt: '2026-01-02T03:04:05.006Z',
    ...overrides,
  });
}

export function emptyOverview(): ActivityOverview {
  return {
    sessionCount: 0,
    actionCount: 0,
    evaluableActionCount: 0,
    capabilityCounts: {
      read: 0,
      write: 0,
      delete: 0,
      execute: 0,
      install: 0,
      fetch: 0,
      send: 0,
      commit: 0,
      push: 0,
      rewrite: 0,
      deploy: 0,
    },
    targetKindCounts: {
      workspace_path: 0,
      other_path: 0,
      vcs_remote: 0,
      host: 0,
      package: 0,
      mcp: 0,
      deploy_target: 0,
      unknown: 0,
    },
    analyzability: { full: 0, partial: 0, none: 0 },
    topPrograms: [],
    topRemoteKeys: [],
  };
}

export function makeModule(overrides: Partial<TraceModule> = {}): TraceModule {
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
    importTrace: () => unconfigured(),
    ingestObservations: () => Promise.resolve({ acceptedCount: 0, duplicateCount: 0 }),
    reclassifyActions: () =>
      Promise.resolve({ reclassifiedCount: 0, classifierVersion: 'test-classifier' }),
    getActivityOverview: () => Promise.resolve(emptyOverview()),
    countActionsBySource: () => Promise.resolve({ transcript: 0, hook: 0, synthetic: 0 }),
    reader: {
      getActions: () => Promise.resolve([]),
      streamActions: () => ({
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ done: true, value: undefined }) };
        },
      }),
      countStaleClassifications: () => Promise.resolve(0),
      listObservationSessions: () => Promise.resolve([]),
      getObservations: () => Promise.resolve([]),
    },
    classifierVersion: 'test-classifier',
    ...overrides,
  };
}

export function buildTraceApp(trace: TraceModule): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', createRequestIdMiddleware(createSequentialIdGenerator()));
  app.use('/api/v1/*', createAuthMiddleware(testConfig()));
  registerTraceRoutes(app, trace, fixedClock);
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

export { ok };
