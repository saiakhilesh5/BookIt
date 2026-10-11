import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Event } from '../src/models/Event.js';
import { Booking } from '../src/models/Booking.js';
import { Waitlist } from '../src/models/Waitlist.js';
import { PromoCode } from '../src/models/PromoCode.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Mail } from '../src/models/Mail.js';
import { signAccessToken } from '../src/utils/tokens.js';

let mongod = null;

// Connect to a real local MongoDB when one is reachable (fast, already running
// in dev and in CI); otherwise fall back to an embedded mongodb-memory-server.
export async function initTestDb() {
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/bookit-test', {
      autoIndex: true,
      serverSelectionTimeoutMS: 1500,
    });
  } catch {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('bookit-test'), { autoIndex: true });
  }
  await mongoose.connection.dropDatabase().catch(() => {});
  // Ensure schema-declared (unique) indexes exist before any test runs.
  await Promise.all(
    [User, Event, Booking, Waitlist, PromoCode, AuditLog, Mail].map((m) => m.init()),
  );
}

export async function teardownTestDb() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

export const makeApp = () => createApp();

export async function createUser({ name = 'Test User', email, role = 'user' } = {}) {
  const passwordHash = await User.hashPassword('Password123!');
  return User.create({
    name,
    email: email ?? `u${Date.now()}${Math.random().toString(36).slice(2, 7)}@test.dev`,
    passwordHash,
    role,
  });
}

export const auth = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });

export async function createPublishedEvent(organizerId, tiers = [{ name: 'General', price: 50, capacity: 10 }]) {
  return Event.create({
    organizer: organizerId,
    title: 'Test Event',
    description: 'A test event with a description long enough for validation.',
    category: 'Music',
    location: { venue: 'Test Venue', city: 'Test City', geo: { type: 'Point', coordinates: [0, 0] } },
    startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
    images: [],
    status: 'published',
    tiers: tiers.map((t) => ({ ...t, sold: 0, held: 0, available: t.capacity })),
  });
}

export const validCard = { number: '4242424242424242', name: 'Test Person', expMonth: 12, expYear: 2035, cvc: '123' };

export async function holdSeatsFor(user, event, tierId, quantity, key) {
  const res = await request(makeApp())
    .post('/api/v1/bookings')
    .set(auth(user))
    .set('Idempotency-Key', key)
    .send({ eventId: String(event._id), tierId: String(tierId), quantity });
  if (res.status !== 201) throw new Error(`hold failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function payFor(user, bookingId, card = validCard) {
  return request(makeApp())
    .post(`/api/v1/bookings/${bookingId}/pay`)
    .set(auth(user))
    .send({ card });
}
