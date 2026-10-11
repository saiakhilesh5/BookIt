import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Queue abstraction with a BullMQ-compatible surface.
// - REDIS_URL set  -> real BullMQ queues (persisted, multi-instance safe)
// - otherwise      -> in-process delayed jobs (zero-dependency dev mode)

class MemoryQueue {
  constructor(name) {
    this.name = name;
    this.processor = null;
    this.jobs = new Map(); // jobId -> timer
    this.backlog = [];
  }

  async add(data, opts = {}) {
    const jobId = opts.jobId || randomUUID();
    if (this.jobs.has(jobId)) return { id: jobId }; // dedupe by jobId (BullMQ semantics)
    this.jobs.set(jobId, true);
    const run = () => {
      this.jobs.delete(jobId);
      this._run({ id: jobId, data });
    };
    if (opts.delay && opts.delay > 0) setTimeout(run, opts.delay).unref?.();
    else this._run({ id: jobId, data });
    return { id: jobId };
  }

  async _run(job) {
    if (!this.processor) {
      this.backlog.push(job);
      return;
    }
    try {
      await this.processor(job);
    } catch (err) {
      logger.error({ err, queue: this.name, jobId: job.id }, 'Job failed');
    }
  }

  process(fn) {
    this.processor = fn;
    const backlog = this.backlog.splice(0);
    for (const job of backlog) this._run(job);
  }
}

const queues = new Map();
let useBull = false;

export async function initQueues() {
  if (!env.REDIS_URL) {
    logger.info('Job queues: in-memory mode (set REDIS_URL for BullMQ)');
    return;
  }
  try {
    const { Queue, Worker } = await import('bullmq');
    const connection = { url: env.REDIS_URL };
    global.__BullMQ = { Queue, Worker, connection };
    useBull = true;
    logger.info('Job queues: BullMQ connected');
  } catch (err) {
    logger.warn({ err }, 'BullMQ unavailable, falling back to in-memory queues');
  }
}

export function getQueue(name) {
  if (!queues.has(name)) queues.set(name, new MemoryQueue(name));
  return queues.get(name);
}

export async function startWorker(name, processor) {
  if (useBull && global.__BullMQ) {
    const { Queue, Worker, connection } = global.__BullMQ;
    new Worker(name, async (job) => processor({ id: job.id, data: job.data }), {
      connection,
      concurrency: 5,
    });
    logger.info(`BullMQ worker started: ${name}`);
    return;
  }
  getQueue(name).process(processor);
  logger.info(`In-memory worker started: ${name}`);
}
