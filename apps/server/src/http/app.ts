import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createSystemClock } from '@authority/platform';
import { composeModules } from '../composition-root.ts';
import type { AppEnv, ServerDeps } from './env.ts';
import { internalUnexpected, respondError } from './errors.ts';
import { createAuthMiddleware } from './middleware/auth.ts';
import { createRequestIdMiddleware } from './middleware/request-id.ts';
import { createRequestLogMiddleware } from './middleware/request-log.ts';
import { registerAuditRoutes } from './routes/audit.routes.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerJobs } from '../jobs/index.ts';
import { registerReplayModule } from '../modules/replay.wiring.ts';
import { registerReviewModule } from '../modules/review.wiring.ts';

export interface ServerApp {
  readonly app: Hono<AppEnv>;
  /** Settles once every job worker and schedule is registered; the server must not serve before. */
  readonly jobsRegistered: Promise<void>;
}

export function createApp(deps: ServerDeps): ServerApp {
  const app = new Hono<AppEnv>();

  app.use('*', createRequestIdMiddleware(deps.idGenerator));
  app.use('*', createRequestLogMiddleware(deps.logger));

  app.onError((cause, c) => {
    deps.logger.error('unhandled_error', {
      requestId: c.get('requestId'),
      errorCode: 'internal.unexpected',
    });
    return respondError(c, internalUnexpected(cause));
  });

  registerHealthRoutes(app, deps.db);

  app.use('/api/v1/*', createAuthMiddleware(deps.config));

  const trace = composeModules(app, deps.config);

  const clock = createSystemClock();
  const replay = registerReplayModule(app, {
    trace,
    database: deps.db,
    jobQueue: deps.jobQueue,
    clock,
    idGenerator: deps.idGenerator,
    logger: deps.logger,
  });

  registerReviewModule(app, {
    trace,
    database: deps.db,
    jobQueue: deps.jobQueue,
    clock,
    idGenerator: deps.idGenerator,
    logger: deps.logger,
  });

  const jobsRegistered = registerJobs({
    queue: deps.jobQueue,
    replay,
    database: deps.db,
    clock,
    idGenerator: deps.idGenerator,
    logger: deps.logger,
  });

  registerAuditRoutes(app, deps.db);

  app.get('*', serveStatic({ root: '../web/dist' }));

  return { app, jobsRegistered };
}
