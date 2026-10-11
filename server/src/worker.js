// Standalone worker process for production deployments:
//   RUN_WORKERS is irrelevant here — this process only runs jobs.
import { connectDB, disconnectDB } from './config/db.js';
import { initQueues } from './jobs/queue.js';
import { startAllWorkers } from './jobs/index.js';
import { initMail } from './services/mail.service.js';
import { logger } from './utils/logger.js';

async function main() {
  await connectDB();
  await initQueues();
  await initMail();
  await startAllWorkers();
  logger.info('BookIt worker running (email, hold-expiry, sweep)');
  setInterval(() => logger.debug('worker heartbeat'), 5 * 60_000).unref?.();
}

main().catch((err) => {
  logger.error({ err }, 'Fatal worker startup error');
  process.exit(1);
});

process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});
