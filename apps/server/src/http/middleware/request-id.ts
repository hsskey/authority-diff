import { createMiddleware } from 'hono/factory';
import type { IdGenerator } from '@authority/kernel';
import type { AppEnv } from '../env.ts';

export function createRequestIdMiddleware(idGenerator: IdGenerator) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const requestId = idGenerator.next('req');
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    await next();
  });
}
