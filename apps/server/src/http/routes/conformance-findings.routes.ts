import type { Hono } from 'hono';
import { ListConformanceFindingsResponseSchema } from '@authority/contracts/schema';
import type { ReplayModule } from '@authority/replay';
import type { AppEnv } from '../env.ts';

export function registerConformanceFindingsRoutes(app: Hono<AppEnv>, replay: ReplayModule): void {
  app.get('/api/v1/conformance-findings', async (c) => {
    const findings = await replay.listConformanceFindings();
    return c.json(ListConformanceFindingsResponseSchema.parse(findings));
  });
}
