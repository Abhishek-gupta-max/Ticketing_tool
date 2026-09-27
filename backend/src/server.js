import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pingDatabase, closePool } from './config/database.js';
import { createApp } from './app.js';
import { startJobs, stopJobs } from './jobs/index.js';

async function main() {
  try {
    const db = await pingDatabase();
    logger.info('Database connected', { database: db.db, version: db.version });
  } catch (err) {
    logger.error('Cannot connect to the database. Check DB_* settings in backend/.env', { code: err.code });
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`API listening on http://localhost:${env.PORT}/api/v1`, { env: env.NODE_ENV }));
  server.keepAliveTimeout = 65000;
  if (env.JOBS_ENABLED) startJobs();

  const shutdown = (signal) => {
    logger.info('Shutting down', { signal });
    stopJobs();
    server.close(async () => {
      await closePool();
      logger.info('Server stopped');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error('Unhandled promise rejection', { error: err?.message, stack: err?.stack }));
}

main();
