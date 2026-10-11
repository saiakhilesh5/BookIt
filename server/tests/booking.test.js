import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { initTestDb, teardownTestDb, makeApp, createUser, auth, createPublishedEvent, validCard } from './setup.js';
import { Event } from '../src/models/Event.js';
import { Booking } from '../src/models/Booking.js';

let app;
let booker, organizer;
let event, tierId;

beforeAll(async () => {
  await initTestDb();
  app = makeApp();
  organizer = await createUser({ email: 'booking-org@test.dev', role: 'organizer' });
  booker = await createUser({ email: 'booking-user@test.dev' });
  event = await createPublishedEvent(organizer._id, [{ name: 'General', price: 50, capacity: 10 }]);
  tierId = String(event.tiers[0]._id);
});

afterAll(teardownTestDb);

const tierState = async () => (await Event.findById(event._id)).tiers.id(tierId);

describe('Booking lifecycle', () => {
  let booking;

  it('requires an Idempotency-Key header', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(booker))
      .send({ eventId: String(event._id), tierId, quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('holds seats atomically', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(booker))
      .set('Idempotency-Key', 'lifecycle-key-0001')
      .send({ eventId: String(event._id), tierId, quantity: 2 });

    expect(res.status).toBe(201);
    booking = res.body.data;
    expect(booking.status).toBe('held');
    expect(booking.quantity).toBe(2);
    expect(booking.totalAmount).toBe(100);
    expect(booking.holdExpiresAt).toBeTruthy();

    const tier = await tierState();
    expect(tier.available).toBe(8);
    expect(tier.held).toBe(2);
    expect(tier.sold).toBe(0);
    // Invariant: available + sold + held === capacity, always.
    expect(tier.available + tier.sold + tier.held).toBe(tier.capacity);
  });

  it('replays the original booking when the same idempotency key is retried', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(booker))
      .set('Idempotency-Key', 'lifecycle-key-0001')
      .send({ eventId: String(event._id), tierId, quantity: 2 });

    expect(res.status).toBe(200); // replay, not a new 201
    expect(res.body.data.id).toBe(booking.id);

    const tier = await tierState();
    expect(tier.available).toBe(8); // unchanged — no double hold
    expect(tier.held).toBe(2);
  });

  it('rejects booking more seats than remain available', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set(auth(booker))
      .set('Idempotency-Key', 'lifecycle-key-0002')
      .send({ eventId: String(event._id), tierId, quantity: 9 }); // only 8 left
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEATS_UNAVAILABLE');
  });

  it('rejects a declined card without consuming the hold', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${booking.id}/pay`)
      .set(auth(booker))
      .send({ card: { ...validCard, number: '4000000000000002' } });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('CARD_DECLINED');

    const fresh = await Booking.findById(booking.id);
    expect(fresh.status).toBe('held');
  });

  it('confirms the booking on successful payment', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${booking.id}/pay`)
      .set(auth(booker))
      .send({ card: validCard });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.ticketCode).toMatch(/^BI-/);

    const tier = await tierState();
    expect(tier.sold).toBe(2);
    expect(tier.held).toBe(0);
    expect(tier.available).toBe(8);
  });

  it('serves a PDF ticket with QR code for a confirmed booking', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${booking.id}/ticket`)
      .set(auth(booker))
      .buffer()
      .parse((res2, cb) => {
        const chunks = [];
        res2.on('data', (c) => chunks.push(c));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('verifies a valid ticket code', async () => {
    const code = (await Booking.findById(booking.id)).ticketCode;
    const res = await request(app).get(`/api/v1/bookings/verify/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.status).toBe('confirmed');
  });

  it('cancels (refunds) a confirmed booking and releases the seats', async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set(auth(booker));

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('refunded');
    expect(res.body.data.refunded).toBe(true);

    const tier = await tierState();
    expect(tier.sold).toBe(0);
    expect(tier.held).toBe(0);
    expect(tier.available).toBe(10);
  });

  it('prevents another user from paying for or cancelling someone else’s booking', async () => {
    const stranger = await createUser({ email: 'stranger@test.dev' });
    const held = await request(app)
      .post('/api/v1/bookings')
      .set(auth(booker))
      .set('Idempotency-Key', 'lifecycle-key-0003')
      .send({ eventId: String(event._id), tierId, quantity: 1 });

    const strangerPay = await request(app)
      .post(`/api/v1/bookings/${held.body.data.id}/pay`)
      .set(auth(stranger))
      .send({ card: validCard });
    expect(strangerPay.status).toBe(403);

    const strangerCancel = await request(app)
      .post(`/api/v1/bookings/${held.body.data.id}/cancel`)
      .set(auth(stranger));
    expect(strangerCancel.status).toBe(403);

    // cleanup for later tests
    await request(app).post(`/api/v1/bookings/${held.body.data.id}/cancel`).set(auth(booker));
  });

  it('expires a lapsed hold and gives the seats back (lazy sweep)', async () => {
    const held = await request(app)
      .post('/api/v1/bookings')
      .set(auth(booker))
      .set('Idempotency-Key', 'lifecycle-key-0004')
      .send({ eventId: String(event._id), tierId, quantity: 3 });
    expect(held.status).toBe(201);

    // Simulate the hold lapsing without the delayed job firing.
    await Booking.updateOne(
      { _id: held.body.data.id },
      { $set: { holdExpiresAt: new Date(Date.now() - 1000) } },
    );

    // Any read of the user's bookings sweeps expired holds.
    const mine = await request(app).get('/api/v1/bookings/me').set(auth(booker));
    expect(mine.status).toBe(200);
    const expired = mine.body.data.find((b) => b.id === held.body.data.id);
    expect(expired.status).toBe('expired');

    const tier = await tierState();
    expect(tier.available).toBe(10);
    expect(tier.held).toBe(0);
    expect(tier.sold).toBe(0);
  });

  it('refuses to pay for an expired hold', async () => {
    const held = await request(app)
      .post('/api/v1/bookings')
      .set(auth(booker))
      .set('Idempotency-Key', 'lifecycle-key-0005')
      .send({ eventId: String(event._id), tierId, quantity: 1 });

    await Booking.updateOne(
      { _id: held.body.data.id },
      { $set: { holdExpiresAt: new Date(Date.now() - 1000) } },
    );

    const res = await request(app)
      .post(`/api/v1/bookings/${held.body.data.id}/pay`)
      .set(auth(booker))
      .send({ card: validCard });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('HOLD_EXPIRED');

    // The lazy expiry released the seat before failing the payment.
    const tier = await tierState();
    expect(tier.available).toBe(10);
  });
});

describe('Waitlist promotion', () => {
  let soldOutEvent, soldOutTierId, buyer, waiter;

  beforeAll(async () => {
    buyer = await createUser({ email: 'wl-buyer@test.dev' });
    waiter = await createUser({ email: 'wl-waiter@test.dev' });
    soldOutEvent = await createPublishedEvent(organizer._id, [{ name: 'Solo', price: 20, capacity: 1 }]);
    soldOutTierId = String(soldOutEvent.tiers[0]._id);
  });

  it('fills the last seat, waitlists the next user, and promotes them on cancellation', async () => {
    // Buyer takes the single seat.
    const hold = await request(app)
      .post('/api/v1/bookings')
      .set(auth(buyer))
      .set('Idempotency-Key', 'wl-buyer-key-0001')
      .send({ eventId: String(soldOutEvent._id), tierId: soldOutTierId, quantity: 1 });
    expect(hold.status).toBe(201);

    const pay = await request(app)
      .post(`/api/v1/bookings/${hold.body.data.id}/pay`)
      .set(auth(buyer))
      .send({ card: validCard });
    expect(pay.status).toBe(200);

    // Sold out — a direct booking attempt fails.
    const direct = await request(app)
      .post('/api/v1/bookings')
      .set(auth(waiter))
      .set('Idempotency-Key', 'wl-waiter-key-0001')
      .send({ eventId: String(soldOutEvent._id), tierId: soldOutTierId, quantity: 1 });
    expect(direct.status).toBe(409);

    // ...so they join the waitlist.
    const join = await request(app)
      .post(`/api/v1/events/${soldOutEvent._id}/waitlist`)
      .set(auth(waiter))
      .send({ tierId: soldOutTierId, quantity: 1 });
    expect(join.status).toBe(201);
    expect(join.body.data.position).toBe(1);

    // Waitlist join is rejected while seats are still available for sale.
    const joinWhenOpen = await request(app)
      .post(`/api/v1/events/${event._id}/waitlist`)
      .set(auth(buyer))
      .send({ tierId, quantity: 1 });
    expect(joinWhenOpen.status).toBe(409);
    expect(joinWhenOpen.body.error.code).toBe('NOT_SOLD_OUT');

    // Buyer cancels -> refund -> the waiter is auto-promoted with a fresh hold.
    const cancel = await request(app)
      .post(`/api/v1/bookings/${hold.body.data.id}/cancel`)
      .set(auth(buyer));
    expect(cancel.status).toBe(200);

    const mine = await request(app).get('/api/v1/bookings/me').set(auth(waiter));
    const promoted = mine.body.data.find((b) => b.source === 'waitlist');
    expect(promoted).toBeTruthy();
    expect(promoted.status).toBe('held');
    expect(promoted.quantity).toBe(1);

    const tier = (await Event.findById(soldOutEvent._id)).tiers.id(soldOutTierId);
    expect(tier.available).toBe(0);
    expect(tier.held).toBe(1); // held for the promoted waiter
    expect(tier.available + tier.sold + tier.held).toBe(tier.capacity);
  });
});
