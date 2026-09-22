import { createMiddleware } from 'hono/factory';
import type { Logger } from '@authority/kernel';
import type { AppEnv } from '../env.ts';

export function createRequestLogMiddleware(logger: Logger) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const start = Date.now();
    await next();
    logger.info('http_request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      route: c.req.path,
      status: c.res.status,
      latencyMs: Date.now() - start,
    });
  });
}
