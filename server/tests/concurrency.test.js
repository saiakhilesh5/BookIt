import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { initTestDb, teardownTestDb, makeApp, createUser, auth, createPublishedEvent, validCard } from './setup.js';
import { User } from '../src/models/User.js';
import { Event } from '../src/models/Event.js';
import { Booking } from '../src/models/Booking.js';

let app;
let organizer;
let event;
let tierId;
const SEATS = 10;
const RIVALS = 50;

beforeAll(async () => {
  await initTestDb();
  app = makeApp();
  organizer = await createUser({ email: 'conc-org@test.dev', role: 'organizer' });
  event = await createPublishedEvent(organizer._id, [{ name: 'General', price: 40, capacity: SEATS }]);
  tierId = String(event.tiers[0]._id);
});

afterAll(teardownTestDb);

describe('Concurrency — zero overbooking under contention', () => {
  it(`exactly ${SEATS} of ${RIVALS} parallel booking requests succeed`, async () => {
    // RIVALS distinct users, all firing at the same instant.
    // One shared bcrypt hash keeps user creation fast.
    const passwordHash = await User.hashPassword('Password123!');
    const users = [];
    for (let i = 0; i < RIVALS; i++) {
      users.push(
        await User.create({
          name: `Rival ${i + 1}`,
          email: `rival${i}-${Date.now()}@test.dev`,
          passwordHash,
          role: 'user',
        }),
      );
    }

    const stamp = Date.now();
    const responses = await Promise.all(
      users.map((u, i) =>
        request(app)
          .post('/api/v1/bookings')
          .set(auth(u))
          .set('Idempotency-Key', `conc-${stamp}-${i}`)
          .send({ eventId: String(event._id), tierId, quantity: 1 }),
      ),
    );

    const created = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 409);

    expect(created.length).toBe(SEATS);
    expect(rejected.length).toBe(RIVALS - SEATS);
    for (const r of rejected) expect(r.body.error.code).toBe('SEATS_UNAVAILABLE');

    // Exactly one booking per seat — no duplicates, no phantoms.
    const bookings = await Booking.find({ event: event._id, status: 'held' });
    expect(bookings.length).toBe(SEATS);
    expect(new Set(bookings.map((b) => String(b.user))).size).toBe(SEATS);

    // Inventory invariant survives the stampede.
    const tier = (await Event.findById(event._id)).tiers.id(tierId);
    expect(tier.sold).toBe(0);
    expect(tier.held).toBe(SEATS);
    expect(tier.available).toBe(0);
    expect(tier.available + tier.sold + tier.held).toBe(tier.capacity);
  });

  it('keeps the invariant intact when several holds pay concurrently', async () => {
    const bookings = await Booking.find({ event: event._id, status: 'held' }).limit(4);
    const users = await User.find({ _id: { $in: bookings.map((b) => b.user) } });
    const byUser = new Map(users.map((u) => [String(u._id), u]));

    const responses = await Promise.all(
      bookings.map((b) =>
        request(app)
          .post(`/api/v1/bookings/${b._id}/pay`)
          .set(auth(byUser.get(String(b.user))))
          .send({ card: validCard }),
      ),
    );
    for (const r of responses) expect(r.status).toBe(200);

    const tier = (await Event.findById(event._id)).tiers.id(tierId);
    expect(tier.sold).toBe(4);
    expect(tier.held).toBe(SEATS - 4);
    expect(tier.available).toBe(0);
    expect(tier.available + tier.sold + tier.held).toBe(tier.capacity);
  });
});
