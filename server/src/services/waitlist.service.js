import { Waitlist } from '../models/Waitlist.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { getQueue } from '../jobs/queue.js';
import { emitAvailability, emitToUser } from '../sockets/emitter.js';
import { enqueueEmail } from './mail.service.js';
import { audit } from './audit.service.js';
import { cacheDeletePrefix } from '../utils/cache.js';

export async function joinWaitlist({ userId, eventId, tierId, quantity }) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  if (event.status !== 'published') throw ApiError.conflict('Event is not open', 'EVENT_NOT_BOOKABLE');
  const tier = event.tiers.id(tierId);
  if (!tier) throw ApiError.notFound('Ticket tier not found', 'TIER_NOT_FOUND');
  if (tier.available >= quantity) {
    throw ApiError.conflict('Seats are still available — no waitlist needed', 'NOT_SOLD_OUT');
  }

  const entry = await Waitlist.findOneAndUpdate(
    { user: userId, event: eventId, tierId },
    { $set: { quantity, status: 'waiting' }, $unset: { promotedAt: 1 } },
    { upsert: true, new: true },
  );

  const position = await Waitlist.countDocuments({
    event: eventId,
    tierId,
    status: 'waiting',
    createdAt: { $lt: entry.createdAt },
  });

  return { entry: entry.toJSON(), position: position + 1 };
}

export async function leaveWaitlist({ userId, eventId, tierId }) {
  const entry = await Waitlist.findOneAndUpdate(
    { user: userId, event: eventId, tierId, status: 'waiting' },
    { $set: { status: 'removed' } },
    { new: true },
  );
  if (!entry) throw ApiError.notFound('No active waitlist entry found', 'NOT_ON_WAITLIST');
  return entry;
}

export async function myWaitlist(userId) {
  await sweepPromotable();
  return Waitlist.find({ user: userId, status: 'waiting' })
    .sort({ createdAt: -1 })
    .populate({ path: 'event', select: 'title startsAt images location category tiers' });
}

// If seats are free and someone is waiting, they should not wait for the next
// trigger — promote eagerly (e.g. after a capacity increase or event publish).
async function sweepPromotable() {
  const candidates = await Waitlist.aggregate([
    {
      $lookup: {
        from: 'events',
        localField: 'event',
        foreignField: '_id',
        as: 'eventDoc',
      },
    },
    { $unwind: '$eventDoc' },
    {
      $match: {
        status: 'waiting',
        'eventDoc.status': 'published',
        $expr: {
          $gt: [
            {
              $reduce: {
                input: {
                  $filter: {
                    input: '$eventDoc.tiers',
                    as: 't',
                    cond: { $eq: ['$$t._id', '$tierId'] },
                  },
                },
                initialValue: 0,
                in: '$$this.available',
              },
            },
            0,
          ],
        },
      },
    },
    { $limit: 20 },
  ]);
  for (const c of candidates) await promoteWaitlist(c.event, c.tierId);
}

// Strict FIFO promotion: the head of the queue gets first refusal. If the head
// needs more seats than are free, nobody is skipped — the queue keeps its order.
export async function promoteWaitlist(eventId, tierId = null) {
  const tierIds = tierId
    ? [tierId]
    : (await Waitlist.distinct('tierId', { event: eventId, status: 'waiting' })).map((t) => t);
  let promoted = 0;
  for (const tid of tierIds) promoted += await promoteTier(eventId, tid);
  return promoted;
}

async function promoteTier(eventId, tierId) {
  let promoted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const entry = await Waitlist.findOne({ event: eventId, tierId, status: 'waiting' }).sort({ createdAt: 1 });
    if (!entry) break;

    // Atomic hold — same primitive the public booking path uses.
    const held = await Event.updateOne(
      {
        _id: eventId,
        status: 'published',
        tiers: { $elemMatch: { _id: tierId, available: { $gte: entry.quantity } } },
      },
      { $inc: { 'tiers.$.available': -entry.quantity, 'tiers.$.held': entry.quantity } },
    );
    if (held.modifiedCount !== 1) break;

    const claimed = await Waitlist.findOneAndUpdate(
      { _id: entry._id, status: 'waiting' },
      { $set: { status: 'promoted', promotedAt: new Date() } },
    );
    if (!claimed) {
      // User left the waitlist concurrently — undo the hold and try the next entry.
      await Event.updateOne(
        { _id: eventId, 'tiers._id': tierId },
        { $inc: { 'tiers.$.available': entry.quantity, 'tiers.$.held': -entry.quantity } },
      );
      continue;
    }

    const event = await Event.findById(eventId);
    const tier = event.tiers.id(tierId);
    const holdExpiresAt = new Date(Date.now() + env.SEAT_HOLD_MINUTES * 60 * 1000);

    try {
      const booking = await Booking.create({
        user: entry.user,
        event: eventId,
        tierId,
        tierName: tier.name,
        quantity: entry.quantity,
        unitPrice: tier.price,
        discountAmount: 0,
        totalAmount: tier.price * entry.quantity,
        status: 'held',
        source: 'waitlist',
        holdExpiresAt,
        idempotencyKey: `wl:${entry._id}`,
      });
      await getQueue('hold-expiry').add(
        { bookingId: booking._id.toString() },
        { delay: env.SEAT_HOLD_MINUTES * 60 * 1000, jobId: `hold:${booking._id}` },
      );

      const user = await import('../models/User.js').then((m) => m.User.findById(entry.user));
      if (user) {
        enqueueEmail({
          to: user._id,
          toEmail: user.email,
          template: 'waitlist_promoted',
          payload: {
            name: user.name,
            eventTitle: event.title,
            tierName: tier.name,
            quantity: entry.quantity,
            holdMinutes: env.SEAT_HOLD_MINUTES,
            holdExpiresAt,
          },
        }).catch(() => {});
        emitToUser(user._id, 'waitlist:promoted', {
          bookingId: booking._id.toString(),
          eventTitle: event.title,
          tierName: tier.name,
          holdExpiresAt,
        });
      }
      promoted++;
    } catch (err) {
      if (err.code === 11000) {
        // User already has a booking from this waitlist entry — release and move on.
        await Event.updateOne(
          { _id: eventId, 'tiers._id': tierId },
          { $inc: { 'tiers.$.available': entry.quantity, 'tiers.$.held': -entry.quantity } },
        );
        continue;
      }
      throw err;
    }
  }

  if (promoted > 0) {
    cacheDeletePrefix('events:list');
    emitAvailability(await Event.findById(eventId));
    await audit({ action: 'waitlist.promoted', entityType: 'Event', entityId: eventId, meta: { tierId: String(tierId), promoted } });
  }
  return promoted;
}
