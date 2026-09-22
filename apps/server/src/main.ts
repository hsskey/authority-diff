import { serve } from '@hono/node-server';
import { createDatabase, createLogger, createUlidGenerator, loadConfig } from '@authority/platform';
import { createApp } from './http/app.ts';

function main(): void {
  const config = loadConfig();
  const logger = createLogger(config);
  const idGenerator = createUlidGenerator();
  const db = createDatabase(config);
  const app = createApp({ config, logger, idGenerator, db });

  const server = serve({ fetch: app.fetch, port: config.server.port }, (info) => {
    logger.info('server_listening', { port: info.port });
  });

  const shutdown = (): void => {
    logger.info('server_shutting_down');
    server.close(() => {
      void db.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
