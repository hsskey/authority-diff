import type { Hono } from 'hono';
import { AuthorityMapQuerySchema, AuthorityMapResponseSchema } from '@authority/contracts/schema';
import type { ReplayModule } from '@authority/replay';
import type { AppEnv } from '../env.ts';
import { respondError, validationInvalidRequest } from '../errors.ts';

export function registerAuthorityMapRoutes(app: Hono<AppEnv>, replay: ReplayModule): void {
  app.get('/api/v1/authority-map', async (c) => {
    const query = AuthorityMapQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return respondError(c, validationInvalidRequest({ issues: query.error.issues }));
    }

    const map = await replay.getAuthorityMap();
    return c.json(AuthorityMapResponseSchema.parse(map));
  });
}
