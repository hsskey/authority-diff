import type { JobQueue } from '@authority/kernel';
import { REPLAY_RUN_JOB } from '@authority/replay';
import type { ReplayModule } from '@authority/replay';

export function registerReplayRunJob(queue: JobQueue, replay: ReplayModule): Promise<void> {
  return queue.work(REPLAY_RUN_JOB, replay.runReplayJob);
}
