import type { Hono } from 'hono';
import type { AppError } from '@authority/kernel';
import { Sha256Schema } from '@authority/kernel';
import { DiffGroupSamplesResponseSchema } from '@authority/contracts/schema';
import type { ReplayModule } from '@authority/replay';
import { ReplayRunIdSchema } from '@authority/replay/schema';
import type { AppEnv } from '../env.ts';
import { respondReplayError } from './replay-runs.routes.ts';

function groupNotFound(): AppError {
  return {
    code: 'replay.group_not_found',
    message: 'no diff group for the given run and group key',
    isRetryable: false,
    details: null,
    cause: null,
  };
}

export function registerDiffGroupsRoutes(app: Hono<AppEnv>, replay: ReplayModule): void {
  app.get('/api/v1/diff-groups/:runId/:groupKey/samples', async (c) => {
    const runId = ReplayRunIdSchema.safeParse(c.req.param('runId'));
    const groupKey = Sha256Schema.safeParse(c.req.param('groupKey'));
    if (!runId.success || !groupKey.success) {
      return respondReplayError(c, groupNotFound());
    }

    const result = await replay.getSamples(runId.data, groupKey.data);
    if (!result.ok) {
      return respondReplayError(c, result.error);
    }
    return c.json(DiffGroupSamplesResponseSchema.parse({ items: result.value }));
  });
}
