import type { Clock, IdGenerator, JobQueue, Logger } from '@authority/kernel';
import type { Database } from '@authority/platform';
import { createPolicyRepository } from '@authority/policy';
import type { ReplayModule } from '@authority/replay';
import { registerConformanceDailyJob } from './conformance-daily.job.ts';
import { registerReplayRunJob } from './replay-run.job.ts';

export interface JobsDeps {
  readonly queue: JobQueue;
  readonly replay: ReplayModule;
  readonly database: Database;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
}

export async function registerJobs(deps: JobsDeps): Promise<void> {
  await registerReplayRunJob(deps.queue, deps.replay);
  await registerConformanceDailyJob(deps.queue, {
    activations: createPolicyRepository({
      db: deps.database.db,
      clock: deps.clock,
      idGenerator: deps.idGenerator,
    }),
    replay: deps.replay,
    clock: deps.clock,
    logger: deps.logger,
  });
}
