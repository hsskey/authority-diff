import type { Hono } from 'hono';
import { IsoTimestampSchema } from '@authority/kernel';
import type { Clock } from '@authority/kernel';
import {
  ActivityOverviewQuerySchema,
  ActivityOverviewResponseSchema,
} from '@authority/contracts/schema';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from '../env.ts';
import { respondError, validationInvalidRequest } from '../errors.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export function registerActivityOverviewRoutes(
  app: Hono<AppEnv>,
  trace: TraceModule,
  clock: Clock,
): void {
  app.get('/api/v1/activity-overview', async (c) => {
    const query = ActivityOverviewQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return respondError(c, validationInvalidRequest({ issues: query.error.issues }));
    }
    const { windowDays } = query.data;
    const to = clock.now();
    const from = IsoTimestampSchema.parse(
      new Date(Date.parse(to) - windowDays * DAY_MS).toISOString(),
    );
    const overview = await trace.getActivityOverview({ from, to });
    return c.json(
      ActivityOverviewResponseSchema.parse({
        ...overview,
        windowDays,
        windowFrom: from,
        windowTo: to,
      }),
    );
  });
}
