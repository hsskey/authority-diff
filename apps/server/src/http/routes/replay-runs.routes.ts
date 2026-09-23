import type { Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppError } from '@authority/kernel';
import {
  CreateReplayRunRequestSchema,
  ListDiffGroupsQuerySchema,
  ListDiffGroupsResponseSchema,
  ReplayRunResponseSchema,
} from '@authority/contracts/schema';
import type { ReplayModule } from '@authority/replay';
import { ReplayRunIdSchema } from '@authority/replay/schema';
import type { AppEnv } from '../env.ts';
import {
  httpStatusForError,
  respondError,
  toErrorEnvelope,
  validationInvalidRequest,
} from '../errors.ts';

const REPLAY_STATUS_BY_CODE: Record<string, ContentfulStatusCode> = {
  'replay.source_invalid': 422,
  'replay.classifier_version_mismatch': 409,
  'replay.run_not_found': 404,
  'replay.group_not_found': 404,
};

/** Responds with the replay error's status; the shared mapper does not know these codes. */
export function respondReplayError(c: Context<AppEnv>, error: AppError): Response {
  const requestId = c.get('requestId');
  const status = REPLAY_STATUS_BY_CODE[error.code] ?? httpStatusForError(error);
  return c.json(toErrorEnvelope(error, requestId), status, { 'X-Request-Id': requestId });
}

function runNotFound(): AppError {
  return {
    code: 'replay.run_not_found',
    message: 'no replay run for the given id',
    isRetryable: false,
    details: null,
    cause: null,
  };
}

export function registerReplayRunsRoutes(app: Hono<AppEnv>, replay: ReplayModule): void {
  app.post('/api/v1/replay-runs', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = CreateReplayRunRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }

    const result =
      parsed.data.kind === 'conformance'
        ? await replay.requestConformanceReplay(parsed.data)
        : await replay.requestReplay(parsed.data);
    if (!result.ok) {
      return respondReplayError(c, result.error);
    }
    return c.json(ReplayRunResponseSchema.parse(result.value.run), result.value.reused ? 200 : 202);
  });

  app.get('/api/v1/replay-runs/:id', async (c) => {
    const id = ReplayRunIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReplayError(c, runNotFound());
    }
    const run = await replay.getRun(id.data);
    if (run === null) {
      return respondReplayError(c, runNotFound());
    }
    return c.json(ReplayRunResponseSchema.parse(run));
  });

  app.get('/api/v1/replay-runs/:id/diff-groups', async (c) => {
    const id = ReplayRunIdSchema.safeParse(c.req.param('id'));
    if (!id.success) {
      return respondReplayError(c, runNotFound());
    }
    const query = ListDiffGroupsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return respondError(c, validationInvalidRequest({ issues: query.error.issues }));
    }

    const result = await replay.listDiffGroups(id.data, {
      direction: query.data.direction,
      severity: query.data.severity,
      cursor: query.data.cursor,
      limit: query.data.limit,
    });
    if (!result.ok) {
      return respondReplayError(c, result.error);
    }
    return c.json(ListDiffGroupsResponseSchema.parse(result.value));
  });
}
