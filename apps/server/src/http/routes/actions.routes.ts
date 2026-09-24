import type { Hono } from 'hono';
import {
  ActionResponseSchema,
  ReclassifyActionsRequestSchema,
  ReclassifyActionsResponseSchema,
} from '@authority/contracts/schema';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from '../env.ts';
import { respondError, traceActionNotFound, validationInvalidRequest } from '../errors.ts';

export function registerActionsRoutes(app: Hono<AppEnv>, trace: TraceModule): void {
  app.post('/api/v1/actions/reclassify', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = ReclassifyActionsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }

    const result = await trace.reclassifyActions({
      from: parsed.data.windowFrom,
      to: parsed.data.windowTo,
    });
    return c.json(ReclassifyActionsResponseSchema.parse(result));
  });

  app.get('/api/v1/actions/:actionKey', async (c) => {
    const actions = await trace.reader.getActions([c.req.param('actionKey')]);
    const action = actions[0];
    if (action === undefined) {
      return respondError(c, traceActionNotFound());
    }
    // This list/get path does not take a policyVersionId, so decision is always null.
    return c.json(ActionResponseSchema.parse({ ...action, decision: null }));
  });
}
