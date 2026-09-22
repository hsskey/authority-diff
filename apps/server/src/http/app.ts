import { Hono } from 'hono';
import type { AppEnv, ServerDeps } from './env.ts';
import { internalUnexpected, respondError } from './errors.ts';
import { createAuthMiddleware } from './middleware/auth.ts';
import { createRequestIdMiddleware } from './middleware/request-id.ts';
import { createRequestLogMiddleware } from './middleware/request-log.ts';
import { registerHealthRoutes } from './routes/health.ts';

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

  return app;
}
