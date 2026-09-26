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
    findLatestActivation(asOf: IsoTimestamp): Promise<Result<PolicyActivation | null, AppError>>;
    listActivationsBetween(
      from: IsoTimestamp,
      to: IsoTimestamp,
    ): Promise<Result<readonly PolicyActivation[], AppError>>;
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
 * Requests a conformance Replay Run over the previous UTC day for the Policy
 * Version declared at the start of that day. A day on which a different version
 * was declared is skipped, since one version cannot stand for the whole day.
 * So is a day whose starting version is ambiguous: declarations share a
 * millisecond timestamp and their ids are not ordered by time, so a different
 * version declared in the same millisecond as the starting one cannot be ordered
 * before or after it.
 * It only requests the run; the run is the same one `POST /replay-runs` would
 * create for that version and window.
 */
export function createConformanceDailyJob(deps: ConformanceDailyDeps): JobHandler {
  const { activations, replay, clock, logger } = deps;
  return async () => {
    const window = previousUtcDay(clock.now());
    const declared = await activations.findLatestActivation(window.windowFrom);
    if (!declared.ok) {
      logger.error('conformance_daily_failed', { errorCode: declared.error.code });
      return;
    }
    if (declared.value === null) {
      logger.info('conformance_daily_skipped', { reason: 'no_policy_activation', ...window });
      return;
    }
    const policyVersionId = declared.value.policyVersionId;
    // The listing excludes its start, so starting one millisecond before the
    // starting declaration also returns declarations made in its millisecond.
    const listFrom = IsoTimestampSchema.parse(
      new Date(Date.parse(declared.value.createdAt) - 1).toISOString(),
    );
    const during = await activations.listActivationsBetween(listFrom, window.windowTo);
    if (!during.ok) {
      logger.error('conformance_daily_failed', { errorCode: during.error.code });
      return;
    }
    const switched = during.value.find(
      (activation) => activation.policyVersionId !== policyVersionId,
    );
    if (switched !== undefined) {
      logger.warn('conformance_daily_skipped', {
        reason: 'policy_activation_changed',
        policyVersionId,
        declaredPolicyVersionId: switched.policyVersionId,
        declaredAt: switched.createdAt,
        ...window,
      });
      return;
    }
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
