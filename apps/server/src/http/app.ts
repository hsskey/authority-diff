import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createSystemClock } from '@authority/platform';
import { createTraceModule } from '@authority/trace';
import type { AppEnv, ServerDeps } from './env.ts';
import { internalUnexpected, respondError } from './errors.ts';
import { createAuthMiddleware } from './middleware/auth.ts';
import { createRequestIdMiddleware } from './middleware/request-id.ts';
import { createRequestLogMiddleware } from './middleware/request-log.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerActionsRoutes } from './routes/actions.routes.ts';
import { registerRuntimeObservationsRoutes } from './routes/runtime-observations.routes.ts';
import { registerTraceImportsRoutes } from './routes/trace-imports.routes.ts';
import { registerReplayModule } from '../modules/replay.wiring.ts';

export function createApp(deps: ServerDeps): Hono<AppEnv> {
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

  const trace = createTraceModule({
    database: deps.db,
    clock: createSystemClock(),
    idGenerator: deps.idGenerator,
  });
  registerTraceImportsRoutes(app, trace);
  registerRuntimeObservationsRoutes(app, trace);
  registerActionsRoutes(app, trace);

  registerReplayModule(app, {
    trace,
    database: deps.db,
    clock: createSystemClock(),
    idGenerator: deps.idGenerator,
  });

  app.get('*', serveStatic({ root: '../web/dist' }));

  return app;
}
