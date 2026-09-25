import type {
  AppError,
  Clock,
  IsoTimestamp,
  JobHandler,
  JobQueue,
  Logger,
  Result,
} from '@authority/kernel';
import { IsoTimestampSchema } from '@authority/kernel';
import type { PolicyActivation } from '@authority/policy/schema';
import type { ReplayModule } from '@authority/replay';

export const CONFORMANCE_DAILY_JOB = 'conformance.daily';
export const CONFORMANCE_DAILY_CRON = '0 1 * * *';

const DAY_MS = 86_400_000;

export interface ConformanceDailyDeps {
  readonly activations: {
    findLatestActivation(): Promise<Result<PolicyActivation | null, AppError>>;
  };
  readonly replay: Pick<ReplayModule, 'requestConformanceReplay'>;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** The whole UTC day before `now`; the window bounds are inclusive. */
export function previousUtcDay(now: IsoTimestamp): {
  windowFrom: IsoTimestamp;
  windowTo: IsoTimestamp;
} {
  const today = Math.floor(Date.parse(now) / DAY_MS) * DAY_MS;
  return {
    windowFrom: IsoTimestampSchema.parse(new Date(today - DAY_MS).toISOString()),
    windowTo: IsoTimestampSchema.parse(new Date(today - 1).toISOString()),
  };
}

/**
 * Requests a conformance Replay Run of the latest declared Policy Version over
 * the previous UTC day. It only requests the run; the run is the same one
 * `POST /replay-runs` would create for that version and window.
 */
export function createConformanceDailyJob(deps: ConformanceDailyDeps): JobHandler {
  const { activations, replay, clock, logger } = deps;
  return async () => {
    const latest = await activations.findLatestActivation();
    if (!latest.ok) {
      logger.error('conformance_daily_failed', { errorCode: latest.error.code });
      return;
    }
    if (latest.value === null) {
      logger.info('conformance_daily_skipped', { reason: 'no_policy_activation' });
      return;
    }
    const policyVersionId = latest.value.policyVersionId;
    const window = previousUtcDay(clock.now());
    const requested = await replay.requestConformanceReplay({
      candidateVersionId: policyVersionId,
      ...window,
    });
    if (!requested.ok) {
      logger.warn('conformance_daily_not_requested', {
        policyVersionId,
        errorCode: requested.error.code,
      });
      return;
    }
    logger.info('conformance_daily_requested', {
      policyVersionId,
      replayRunId: requested.value.run.id,
      reused: requested.value.reused,
    });
  };
}

export async function registerConformanceDailyJob(
  queue: JobQueue,
  deps: ConformanceDailyDeps,
): Promise<void> {
  await queue.work(CONFORMANCE_DAILY_JOB, createConformanceDailyJob(deps));
  await queue.schedule(CONFORMANCE_DAILY_JOB, CONFORMANCE_DAILY_CRON);
}
