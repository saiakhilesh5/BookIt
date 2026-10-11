import { logger } from '../utils/logger.js';

// Singleton Socket.IO server. Services import this module to emit; server.js initializes it.
let io = null;

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

export function emitToEvent(eventId, type, payload) {
  if (!io) return;
  io.to(`event:${eventId}`).emit(type, payload);
}

export function emitToUser(userId, type, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(type, payload);
}

export function emitAvailability(event) {
  if (!io || !event) return;
  emitToEvent(String(event._id ?? event.id), 'availability', {
    eventId: String(event._id ?? event.id),
    tiers: (event.tiers || []).map((t) => ({
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
