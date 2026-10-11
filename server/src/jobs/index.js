import { startWorker } from './queue.js';
import { deliverEmail } from '../services/mail.service.js';
import { expireHeldBooking, sweepExpiredHolds } from '../services/booking.service.js';
import { logger } from '../utils/logger.js';

export async function startAllWorkers() {
  await startWorker('email', ({ data }) => deliverEmail(data));
  await startWorker('hold-expiry', ({ data }) => expireHeldBooking(data.bookingId));

  // Safety net: catches holds whose delayed jobs were lost (e.g. restarts).
  const sweep = setInterval(async () => {
    try {
      const count = await sweepExpiredHolds();
      if (count > 0) logger.info({ count }, 'Swept expired seat holds');
    } catch (err) {
      logger.error({ err }, 'Hold sweep failed');
    }
  }, 60_000);
  sweep.unref?.();
}
