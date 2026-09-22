import type { Hono } from 'hono';
import {
  CreateRuntimeObservationsRequestSchema,
  CreateRuntimeObservationsResponseSchema,
} from '@authority/contracts/schema';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from '../env.ts';
import { respondError, validationInvalidRequest } from '../errors.ts';

export function registerRuntimeObservationsRoutes(app: Hono<AppEnv>, trace: TraceModule): void {
  app.post('/api/v1/runtime-observations', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = CreateRuntimeObservationsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }

    const counts = await trace.ingestObservations(parsed.data);
    return c.json(CreateRuntimeObservationsResponseSchema.parse(counts), 201);
  });
}
