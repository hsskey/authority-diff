import { PgBoss } from 'pg-boss';
import type { JobQueue, Logger } from '@authority/kernel';
import type { Config } from './config.ts';

export interface PgBossJobQueue extends JobQueue {
  /** Creates or migrates the `pgboss` schema, then starts polling and scheduling. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** The only pg-boss import: jobs live in the `pgboss` schema of the application database. */
export function createPgBossJobQueue(config: Config, logger: Logger): PgBossJobQueue {
  const boss = new PgBoss({ connectionString: config.db.url.reveal() });
  boss.on('error', (cause) => {
    logger.error('job_queue_error', { cause });
  });
  const created = new Set<string>();
  const ensureQueue = async (name: string): Promise<void> => {
    if (!created.has(name)) {
      await boss.createQueue(name, {
        retryLimit: 5,
        retryDelay: 2,
        retryBackoff: true,
        retryDelayMax: 60,
      });
      created.add(name);
    }
  };
  return {
    start: async () => {
      await boss.start();
    },
    stop: () => boss.stop({ graceful: true }),
    async send(name, payload) {
      await ensureQueue(name);
      await boss.send(name, payload);
    },
    async work(name, handler) {
      await ensureQueue(name);
      await boss.work<unknown>(name, async (jobs) => {
        for (const job of jobs) {
          await handler(job.data);
        }
      });
    },
    async schedule(name, cron) {
      await ensureQueue(name);
      await boss.schedule(name, cron, {}, { tz: 'UTC', missed: 'once' });
    },
  };
}
