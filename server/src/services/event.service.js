import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { ApiError } from '../utils/ApiError.js';
import { cached, cacheDeletePrefix } from '../utils/cache.js';
import { publicize } from '../utils/serialize.js';
import { emitAvailability } from '../sockets/emitter.js';
import { enqueueEmail } from './mail.service.js';
import { audit } from './audit.service.js';
import { sweepExpiredHolds } from './booking.service.js';
import { promoteWaitlist } from './waitlist.service.js';

const SORTS = {
  date_asc: { startsAt: 1 },
  date_desc: { startsAt: -1 },
  price_asc: { 'tiers.price': 1 },
  price_desc: { 'tiers.price': -1 },
  newest: { createdAt: -1 },
  popular: { views: -1 },
};

function buildFilter(q) {
  const filter = { status: 'published' };
  if (q.category) filter.category = q.category;
  if (q.city) filter['location.city'] = { $regex: `^${q.city}$`, $options: 'i' };
  if (q.from || q.to) {
    filter.startsAt = {};
    if (q.from) filter.startsAt.$gte = q.from;
    if (q.to) filter.startsAt.$lte = q.to;
  }
  if (q.minPrice != null || q.maxPrice != null) {
    const price = {};
    if (q.minPrice != null) price.$gte = q.minPrice;
    if (q.maxPrice != null) price.$lte = q.maxPrice;
    filter.tiers = { $elemMatch: { price } };
  }
  if (q.q) {
    filter.$and = [
      ...(filter.$and || []),
      { $text: { $search: q.q } },
    ];
  }
  return filter;
}

export async function listEvents(query) {
  const filter = buildFilter(query);
  const { page, limit, sort } = query;

  return cached(`events:list:${JSON.stringify(query)}`, 15_000, async () => {
    const [items, total] = await Promise.all([
      Event.find(filter)
        .sort(query.q ? { score: { $meta: 'textScore' }, ...SORTS[sort] } : SORTS[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-__v')
        .populate({ path: 'organizer', select: 'name' })
        .lean(),
      Event.countDocuments(filter),
    ]);
    return { items: publicize(items), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  });
}

export async function getEvent(id, { viewer = null } = {}) {
  await sweepExpiredHolds();

  const event = await Event.findById(id).populate({ path: 'organizer', select: 'name createdAt' });
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');

  const isOwner = viewer && (viewer._id.equals(event.organizer?._id) || viewer.role === 'admin');
  if (event.status !== 'published' && !isOwner) {
    throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  }

  if (!isOwner) {
    Event.updateOne({ _id: id }, { $inc: { views: 1 } }).exec().catch(() => {});
  }

  const response = event.toJSON();
  response.isOwner = Boolean(isOwner);
  response.tiers = response.tiers.map((t) => ({
    ...t,
    id: t.id ?? t._id,
    _id: undefined,
  }));

  // Waitlist size per tier for the detail page
  const { Waitlist } = await import('../models/Waitlist.js');
  const waiting = await Waitlist.aggregate([
    { $match: { event: event._id, status: 'waiting' } },
    { $group: { _id: '$tierId', count: { $sum: 1 } } },
  ]);
  const waitMap = new Map(waiting.map((w) => [String(w._id), w.count]));
  response.tiers = response.tiers.map((t) => ({ ...t, waitlistCount: waitMap.get(String(t.id)) ?? 0 }));
  return response;
}

export async function listMeta() {
  return cached('events:meta', 60_000, async () => {
    const [categories, cities, counts] = await Promise.all([
      Event.distinct('category', { status: 'published' }),
      Event.distinct('location.city', { status: 'published' }),
      Event.countDocuments({ status: 'published', startsAt: { $gte: new Date() } }),
    ]);
    return { categories, cities: cities.sort(), totalUpcoming: counts };
  });
}

export async function featuredEvents(limit = 6) {
  return cached(`events:featured:${limit}`, 30_000, async () => {
    const items = await Event.find({ status: 'published', startsAt: { $gte: new Date() } })
      .sort({ views: -1, startsAt: 1 })
      .limit(limit)
      .select('title category images location startsAt tiers status views')
      .lean();
    return publicize(items);
  });
}

// ---------------------------------------------------------------------------
// Organizer CRUD
// ---------------------------------------------------------------------------

function toTierDocs(tiers) {
  return tiers.map((t) => ({
    name: t.name,
    price: t.price,
    capacity: t.capacity,
    sold: 0,
    held: 0,
    available: t.capacity,
  }));
}

export async function createEvent({ organizer, body }) {
  const { tiers, submit, city, venue, ...rest } = body;
  const event = await Event.create({
    ...rest,
    location: { city, venue },
    organizer: organizer._id,
    status: submit ? 'pending' : 'draft',
    tiers: toTierDocs(tiers),
  });
  cacheDeletePrefix('events:');
  await audit({ actor: organizer, action: 'event.created', entityType: 'Event', entityId: event._id, meta: { status: event.status } });
  return event;
}

export async function updateEvent({ eventId, organizer, body, ip }) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  if (!event.organizer.equals(organizer._id) && organizer.role !== 'admin') {
    throw ApiError.forbidden('You do not own this event', 'NOT_OWNER');
  }
  if (event.status === 'cancelled') throw ApiError.conflict('Cancelled events cannot be edited', 'EVENT_CANCELLED');

  const { tiers, submit, city, venue, ...rest } = body;
  if (city != null || venue != null) {
    const loc = event.location?.toObject?.() ?? { ...event.location };
    if (city != null) loc.city = city;
    if (venue != null) loc.venue = venue;
    event.location = loc;
  }

  // Tier updates must respect seats already sold/held.
  if (tiers) {
    const incomingById = new Map(tiers.map((t) => [t.id, t]));
    const newTiers = [];
    for (const tier of event.tiers) {
      const incoming = incomingById.get(String(tier._id));
      if (!incoming) {
        // Removing a tier: only allowed when nothing sold or held on it.
        if (tier.sold > 0 || tier.held > 0) {
          throw ApiError.conflict(`Tier "${tier.name}" has active sales and cannot be removed`, 'TIER_IN_USE');
        }
        continue;
      }
      const soldHeld = tier.sold + tier.held;
      if (incoming.capacity < soldHeld) {
        throw ApiError.conflict(
          `Capacity for "${incoming.name}" cannot go below ${soldHeld} (already sold or held)`,
          'CAPACITY_TOO_LOW',
        );
      }
      newTiers.push({
        _id: tier._id,
        name: incoming.name,
        price: incoming.price,
        capacity: incoming.capacity,
        sold: tier.sold,
        held: tier.held,
        available: incoming.capacity - soldHeld,
      });
      incomingById.delete(String(tier._id));
    }
    for (const fresh of incomingById.values()) {
      newTiers.push({ name: fresh.name, price: fresh.price, capacity: fresh.capacity, sold: 0, held: 0, available: fresh.capacity });
    }
    if (newTiers.length === 0) throw ApiError.badRequest('Event needs at least one tier', 'NO_TIERS');
    event.tiers = newTiers;
  }

  Object.assign(event, rest);
  if (submit != null) {
    if (submit && (event.status === 'draft' || event.status === 'rejected')) event.status = 'pending';
    if (!submit && event.status === 'pending') event.status = 'draft';
  }

  await event.save();
  cacheDeletePrefix('events:');
  emitAvailability(event);
  await audit({ actor: organizer, action: 'event.updated', entityType: 'Event', entityId: event._id, ip });

  // Free seats + waiting fans => immediate promotion.
  await promoteWaitlist(event._id, null).catch(() => {});
  return event;
}

export async function cancelEvent({ eventId, actor, ip }) {
  const event = await Event.findById(eventId).populate('organizer', 'name email');
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  if (!event.organizer._id.equals(actor._id) && actor.role !== 'admin') {
    throw ApiError.forbidden('You do not own this event', 'NOT_OWNER');
  }
  if (event.status === 'cancelled') throw ApiError.conflict('Event is already cancelled', 'ALREADY_CANCELLED');

  event.status = 'cancelled';
  await event.save();

  // Release every active hold and refund every confirmed booking.
  const active = await Booking.find({ event: event._id, status: { $in: ['held', 'confirmed'] } }).populate('user', 'name email');
  for (const booking of active) {
    if (booking.status === 'held') {
      await Booking.updateOne({ _id: booking._id, status: 'held' }, { $set: { status: 'cancelled' }, $unset: { holdExpiresAt: 1 } });
    } else {
      await Booking.updateOne(
        { _id: booking._id, status: 'confirmed' },
        { $set: { status: 'refunded', 'payment.refundedAt': new Date() } },
      );
    }
    if (booking.user) {
      enqueueEmail({
        to: booking.user._id,
        toEmail: booking.user.email,
        template: 'event_cancelled',
        payload: {
          name: booking.user.name,
          eventTitle: event.title,
          totalAmount: booking.totalAmount,
          refunded: true,
        },
      }).catch(() => {});
    }
  }

  cacheDeletePrefix('events:');
  emitAvailability(event);
  await audit({ actor, action: 'event.cancelled', entityType: 'Event', entityId: event._id, meta: { affectedBookings: active.length }, ip });
  return event;
}

// ---------------------------------------------------------------------------
// Organizer reads
// ---------------------------------------------------------------------------

export async function listMyEvents(organizerId) {
  await sweepExpiredHolds();
  const events = await Event.find({ organizer: organizerId }).sort({ createdAt: -1 }).lean();

  const stats = await Booking.aggregate([
    { $match: { event: { $in: events.map((e) => e._id) } } },
    {
      $group: {
        _id: { event: '$event', status: '$status' },
        count: { $sum: 1 },
        tickets: { $sum: '$quantity' },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$totalAmount', 0] } },
      },
    },
  ]);

  const byEvent = new Map();
  for (const s of stats) {
    const key = String(s._id.event);
    if (!byEvent.has(key)) byEvent.set(key, { bookings: 0, ticketsSold: 0, revenue: 0, activeHolds: 0 });
    const agg = byEvent.get(key);
    agg.bookings += s.count;
    if (s._id.status === 'confirmed') {
      agg.ticketsSold += s.tickets;
      agg.revenue += s.revenue;
    }
    if (s._id.status === 'held') agg.activeHolds += s.tickets;
  }

  return publicize(events.map((e) => {
    const totalCapacity = e.tiers.reduce((sum, t) => sum + t.capacity, 0);
    const sold = e.tiers.reduce((sum, t) => sum + t.sold, 0);
    return { ...e, stats: { totalCapacity, sold, ...(byEvent.get(String(e._id)) ?? { bookings: 0, ticketsSold: 0, revenue: 0, activeHolds: 0 }) } };
  }));
}

export async function eventStats({ eventId, organizer }) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  if (!event.organizer.equals(organizer._id) && organizer.role !== 'admin') {
    throw ApiError.forbidden('You do not own this event', 'NOT_OWNER');
  }
  await sweepExpiredHolds(eventId);

  const [byStatus, byDay, byTier] = await Promise.all([
    Booking.aggregate([
      { $match: { event: event._id } },
      { $group: { _id: '$status', count: { $sum: 1 }, tickets: { $sum: '$quantity' }, revenue: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$totalAmount', 0] } } } },
    ]),
    Booking.aggregate([
      { $match: { event: event._id, status: 'confirmed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          tickets: { $sum: '$quantity' },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { event: event._id } },
      { $group: { _id: '$tierId', tierName: { $first: '$tierName' }, tickets: { $sum: '$quantity' }, revenue: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$totalAmount', 0] } } } },
      { $sort: { tickets: -1 } },
    ]),
  ]);

  const revenue = byStatus.find((s) => s._id === 'confirmed')?.revenue ?? 0;
  return {
    event: {
      id: String(event._id),
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      capacity: event.tiers.reduce((s, t) => s + t.capacity, 0),
    },
    totals: {
      revenue: Math.round(revenue * 100) / 100,
      confirmed: byStatus.find((s) => s._id === 'confirmed')?.tickets ?? 0,
      held: byStatus.find((s) => s._id === 'held')?.tickets ?? 0,
      cancelled: byStatus.find((s) => s._id === 'cancelled')?.count ?? 0,
      refunded: byStatus.find((s) => s._id === 'refunded')?.count ?? 0,
      bookings: byStatus.reduce((s, x) => s + x.count, 0),
    },
    tiers: event.tiers.map((t) => ({
      name: t.name,
      capacity: t.capacity,
      sold: t.sold,
      held: t.held,
      available: t.available,
    })),
    byDay,
    byTier,
  };
}
