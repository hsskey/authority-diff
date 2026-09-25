import { serve } from '@hono/node-server';
import {
  createDatabase,
  createLogger,
  createPgBossJobQueue,
  createUlidGenerator,
  loadConfig,
} from '@authority/platform';
import { createApp } from './http/app.ts';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const idGenerator = createUlidGenerator();
  const db = createDatabase(config);
  const jobQueue = createPgBossJobQueue(config, logger);

  let app;
  try {
    await jobQueue.start();
    const created = createApp({ config, logger, idGenerator, db, jobQueue });
    await created.jobsRegistered;
    app = created.app;
  } catch (cause) {
    logger.error('server_start_failed', { cause });
    await Promise.allSettled([jobQueue.stop(), db.close()]);
    process.exit(1);
  }

  const server = serve({ fetch: app.fetch, port: config.server.port }, (info) => {
    logger.info('server_listening', { port: info.port });
  });

  const shutdown = (): void => {
    logger.info('server_shutting_down');
    server.close(() => {
      void jobQueue
        .stop()
        .then(() => db.close())
        .then(
          () => process.exit(0),
          () => process.exit(1),
        );
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

await main();
