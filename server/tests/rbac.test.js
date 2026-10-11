import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { initTestDb, teardownTestDb, makeApp, createUser, auth } from './setup.js';

let app;
let user, organizerA, organizerB, admin;
let eventByA;

const eventBody = (overrides = {}) => ({
  title: 'RBAC Test Event',
  description: 'An event used to verify role-based access control rules.',
  category: 'Tech',
  city: 'Test City',
  venue: 'Test Venue',
  startsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  endsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
  images: [],
  tiers: [{ name: 'General', price: 30, capacity: 25 }],
  submit: true,
  ...overrides,
});

beforeAll(async () => {
  await initTestDb();
  app = makeApp();
  user = await createUser({ email: 'rbac-user@test.dev' });
  organizerA = await createUser({ name: 'Org A', email: 'rbac-org-a@test.dev', role: 'organizer' });
  organizerB = await createUser({ name: 'Org B', email: 'rbac-org-b@test.dev', role: 'organizer' });
  admin = await createUser({ name: 'Admin', email: 'rbac-admin@test.dev', role: 'admin' });

  const res = await request(app)
    .post('/api/v1/events')
    .set(auth(organizerA))
    .send(eventBody({ title: 'Event by A' }));
  eventByA = res.body.data;
});

afterAll(teardownTestDb);

describe('RBAC', () => {
  it('blocks anonymous users from creating events', async () => {
    const res = await request(app).post('/api/v1/events').send(eventBody());
    expect(res.status).toBe(401);
  });

  it('blocks plain users from creating events', async () => {
    const res = await request(app).post('/api/v1/events').set(auth(user)).send(eventBody());
    expect(res.status).toBe(403);
  });

  it('lets organizers create events (pending review)', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .set(auth(organizerB))
      .send(eventBody({ title: 'Event by B' }));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });

  it('blocks an organizer from editing another organizer’s event', async () => {
    const res = await request(app)
      .patch(`/api/v1/events/${eventByA.id}`)
      .set(auth(organizerB))
      .send({ title: 'Hijacked' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_OWNER');
  });

  it('lets the owner edit their own event', async () => {
    const res = await request(app)
      .patch(`/api/v1/events/${eventByA.id}`)
      .set(auth(organizerA))
      .send({ title: 'Renamed by owner' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed by owner');
  });

  it('lets an admin edit any event', async () => {
    const res = await request(app)
      .patch(`/api/v1/events/${eventByA.id}`)
      .set(auth(admin))
      .send({ title: 'Renamed by admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed by admin');
  });

  it('blocks users and organizers from admin endpoints', async () => {
    expect((await request(app).get('/api/v1/admin/stats').set(auth(user))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/stats').set(auth(organizerA))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/users').set(auth(organizerA))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/audit-logs').set(auth(user))).status).toBe(403);
  });

  it('lets admins see platform stats and pending events', async () => {
    const stats = await request(app).get('/api/v1/admin/stats').set(auth(admin));
    expect(stats.status).toBe(200);
    expect(stats.body.data).toHaveProperty('users');
    expect(stats.body.data).toHaveProperty('bookings');

    const pending = await request(app).get('/api/v1/admin/events/pending').set(auth(admin));
    expect(pending.status).toBe(200);
    expect(Array.isArray(pending.body.data)).toBe(true);
  });

  it('lets an admin approve a pending event so it becomes bookable', async () => {
    const created = await request(app)
      .post('/api/v1/events')
      .set(auth(organizerB))
      .send(eventBody({ title: 'Needs Approval' }));
    const eventId = created.body.data.id;

    const approve = await request(app)
      .patch(`/api/v1/admin/events/${eventId}/approve`)
      .set(auth(admin));
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('published');
  });

  it('blocks a user from changing roles via admin endpoints', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/role`)
      .set(auth(user))
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('lets an admin change a user role and it takes effect immediately', async () => {
    const promote = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/role`)
      .set(auth(admin))
      .send({ role: 'organizer' });
    expect(promote.status).toBe(200);

    // The promoted user can now create events.
    const create = await request(app)
      .post('/api/v1/events')
      .set(auth(user))
      .send(eventBody({ title: 'Promoted User Event' }));
    expect(create.status).toBe(201);
  });
});
