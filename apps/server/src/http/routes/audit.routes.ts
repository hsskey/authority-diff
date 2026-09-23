import type { Hono } from 'hono';
import type { Database } from '@authority/platform';
import { verifyAuditChain } from '@authority/review';
import type { AppEnv } from '../env.ts';

export function registerAuditRoutes(app: Hono<AppEnv>, database: Database): void {
  app.get('/api/v1/audit/verification', async (c) => c.json(await verifyAuditChain(database)));
}
