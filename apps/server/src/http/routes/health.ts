import type { Hono } from 'hono';
import type { AppEnv, ReadinessProbe } from '../env.ts';
import { respondError } from '../errors.ts';

export function registerHealthRoutes(app: Hono<AppEnv>, db: ReadinessProbe): void {
  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    const ping = await db.ping();
    if (ping.ok) {
      return c.json({ status: 'ok' });
    }
    return respondError(c, ping.error);
  });
}
