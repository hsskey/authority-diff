import type { Hono } from 'hono';
import { ImportTraceRequestSchema, ImportTraceResponseSchema } from '@authority/contracts/schema';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from '../env.ts';
import { respondError, traceBatchTooLarge, validationInvalidRequest } from '../errors.ts';

const MAX_TOOL_CALLS = 1000;

function toolCallCount(body: unknown): number | null {
  if (typeof body !== 'object' || body === null || !('toolCalls' in body)) {
    return null;
  }
  const toolCalls = body.toolCalls;
  return Array.isArray(toolCalls) ? toolCalls.length : null;
}

export function registerTraceImportsRoutes(app: Hono<AppEnv>, trace: TraceModule): void {
  app.post('/api/v1/trace-imports', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);

    const count = toolCallCount(body);
    if (count !== null && count > MAX_TOOL_CALLS) {
      return respondError(c, traceBatchTooLarge());
    }

    const parsed = ImportTraceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(c, validationInvalidRequest({ issues: parsed.error.issues }));
    }

    const result = await trace.importTrace(parsed.data);
    if (!result.ok) {
      return respondError(c, result.error);
    }

    return c.json(ImportTraceResponseSchema.parse(result.value), 201);
  });
}
