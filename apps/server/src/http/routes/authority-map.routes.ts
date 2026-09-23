import type { Hono } from 'hono';
import { AuthorityMapResponseSchema } from '@authority/contracts/schema';
import type { ReplayModule } from '@authority/replay';
import type { AppEnv } from '../env.ts';

export function registerAuthorityMapRoutes(app: Hono<AppEnv>, replay: ReplayModule): void {
  app.get('/api/v1/authority-map', async (c) => {
    const map = await replay.getAuthorityMap();
    return c.json(AuthorityMapResponseSchema.parse(map));
  });
}
