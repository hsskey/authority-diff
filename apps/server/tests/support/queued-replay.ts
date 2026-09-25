import { createMemoryJobQueue } from '@authority/platform/testing';
import type { MemoryJobQueue } from '@authority/platform/testing';
import { createReplayModule, REPLAY_RUN_JOB } from '@authority/replay';
import type { CreateReplayModuleDeps, ReplayModule } from '@authority/replay';

/** A replay module whose `replay.run` jobs run in process as soon as they are sent. */
export function createQueuedReplayModule(
  deps: Omit<CreateReplayModuleDeps, 'jobQueue'>,
  jobs: MemoryJobQueue = createMemoryJobQueue(),
): ReplayModule {
  const replay = createReplayModule({ ...deps, jobQueue: jobs });
  void jobs.work(REPLAY_RUN_JOB, replay.runReplayJob);
  return replay;
}
