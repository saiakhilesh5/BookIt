import http from 'node:http';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSockets } from './sockets/index.js';
import { initQueues } from './jobs/queue.js';
import { startAllWorkers } from './jobs/index.js';
import { initMail } from './services/mail.service.js';
import { logger } from './utils/logger.js';

const RUN_WORKERS = process.env.RUN_WORKERS !== 'false';

async function main() {
  await connectDB();
  await initQueues();
  await initMail();

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);

  // In dev the API process also runs background workers; in production
  // `npm run worker` runs them as a separate deployment for horizontal scale.
  if (RUN_WORKERS) await startAllWorkers();

  server.listen(env.PORT, () => {
    logger.info(`BookIt API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down`);
    server.close();
    if (RUN_WORKERS) await new Promise((r) => setTimeout(r, 300));
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
