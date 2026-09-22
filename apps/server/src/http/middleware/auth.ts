import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { Config } from '@authority/platform';
import type { AppEnv } from '../env.ts';
import { authTokenInvalid, authTokenMissing, respondError } from '../errors.ts';

const BEARER_PREFIX = 'Bearer ';

export function createAuthMiddleware(config: Config) {
  const expected = Buffer.from(config.auth.token.reveal(), 'utf8');
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
      return respondError(c, authTokenMissing());
    }
    const provided = Buffer.from(header.slice(BEARER_PREFIX.length), 'utf8');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return respondError(c, authTokenInvalid());
    }
    await next();
    return;
  });
}
