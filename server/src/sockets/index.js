import { Server } from 'socket.io';
import { env, isProd } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { setIo } from './emitter.js';
import { Event } from '../models/Event.js';

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Multi-instance fan-out via the Redis adapter when Redis is configured.
  if (env.REDIS_URL) {
    Promise.all([import('ioredis'), import('@socket.io/redis-adapter')])
      .then(([{ default: Redis }, { pubClient, subClient }]) => {
        const pub = new Redis(env.REDIS_URL);
        const sub = pub.duplicate();
        io.adapter(pubClient(pub), subClient(sub));
        logger.info('Socket.IO Redis adapter enabled');
      })
      .catch((err) => logger.warn({ err }, 'Redis adapter unavailable, running single-instance'));
  }

  // Best-effort identity: attach the user when a valid access token is supplied.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
    } catch {
      /* anonymous socket */
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.data.userId) socket.join(`user:${socket.data.userId}`);

    socket.on('event:subscribe', async ({ eventId } = {}) => {
      if (typeof eventId !== 'string' || !/^[a-f\d]{24}$/i.test(eventId)) return;
      socket.join(`event:${eventId}`);
      try {
        const event = await Event.findById(eventId).select('tiers');
        if (event) {
          socket.emit('availability', {
            eventId,
            tiers: event.tiers.map((t) => ({
              id: String(t._id),
              name: t.name,
              price: t.price,
              capacity: t.capacity,
              sold: t.sold,
              held: t.held,
              available: t.available,
            })),
            at: new Date().toISOString(),
          });
        }
      } catch {
        /* event may have been deleted */
      }
    });

    socket.on('event:unsubscribe', ({ eventId } = {}) => {
      if (typeof eventId === 'string') socket.leave(`event:${eventId}`);
    });
  });

  setIo(io);
  logger.info('Socket.IO initialized');
  return io;
}
