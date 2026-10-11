import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { AuditLog } from '../models/AuditLog.js';
import { Mail } from '../models/Mail.js';
import { ApiError } from '../utils/ApiError.js';
import { audit } from './audit.service.js';
import { enqueueEmail } from './mail.service.js';
import { cacheDeletePrefix } from '../utils/cache.js';
import { publicize } from '../utils/serialize.js';
import { emitAvailability } from '../sockets/emitter.js';
import { promoteWaitlist } from './waitlist.service.js';

export async function platformStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [usersByRole, eventsByStatus, bookingsByStatus, revenueAgg, revenueByDay, topEvents, recentUsers] =
    await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Event.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, tickets: { $sum: '$quantity' } } }]),
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, tickets: { $sum: '$quantity' } } },
      ]),
      Booking.aggregate([
        { $match: { status: 'confirmed', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, tickets: { $sum: '$quantity' } } },
        { $sort: { _id: 1 } },
      ]),
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: '$event', revenue: { $sum: '$totalAmount' }, tickets: { $sum: '$quantity' } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: { from: 'events', localField: '_id', foreignField: '_id', as: 'event' },
        },
        { $unwind: '$event' },
        { $project: { _id: 0, id: '$_id', title: '$event.title', startsAt: '$event.startsAt', revenue: 1, tickets: 1 } },
      ]),
      User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt'),
    ]);

  const roles = Object.fromEntries(usersByRole.map((r) => [r._id, r.count]));
  const statuses = Object.fromEntries(eventsByStatus.map((s) => [s._id, s.count]));
  const bookingStatuses = Object.fromEntries(bookingsByStatus.map((s) => [s._id, s]));

  return {
    users: {
      total: (roles.user ?? 0) + (roles.organizer ?? 0) + (roles.admin ?? 0),
      ...roles,
      recent: recentUsers,
    },
    events: {
      total: eventsByStatus.reduce((s, x) => s + x.count, 0),
      published: statuses.published ?? 0,
      pending: statuses.pending ?? 0,
      draft: statuses.draft ?? 0,
      cancelled: statuses.cancelled ?? 0,
    },
    bookings: {
      total: bookingsByStatus.reduce((s, x) => s + x.count, 0),
      confirmed: bookingStatuses.confirmed?.count ?? 0,
      held: bookingStatuses.held?.count ?? 0,
      cancelled: bookingStatuses.cancelled?.count ?? 0,
      refunded: bookingStatuses.refunded?.count ?? 0,
      expired: bookingStatuses.expired?.count ?? 0,
      ticketsSold: bookingStatuses.confirmed?.tickets ?? 0,
    },
    revenue: {
      total: Math.round((revenueAgg[0]?.revenue ?? 0) * 100) / 100,
      tickets: revenueAgg[0]?.tickets ?? 0,
      byDay: revenueByDay,
    },
    topEvents,
  };
}

export async function listUsers({ q, role, page, limit }) {
  const filter = {};
  if (role) filter.role = role;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items: items.map((u) => u.toJSON()), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function changeUserRole({ targetUserId, role, actor, ip }) {
  if (String(targetUserId) === String(actor._id)) {
    throw ApiError.badRequest('You cannot change your own role', 'SELF_ROLE_CHANGE');
  }
  const target = await User.findByIdAndUpdate(targetUserId, { role }, { new: true });
  if (!target) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  await audit({ actor, action: 'user.role_changed', entityType: 'User', entityId: target._id, meta: { role }, ip });
  return target;
}

export async function setUserActive({ targetUserId, isActive, actor, ip }) {
  if (String(targetUserId) === String(actor._id)) {
    throw ApiError.badRequest('You cannot deactivate your own account', 'SELF_STATUS_CHANGE');
  }
  const target = await User.findByIdAndUpdate(targetUserId, { isActive }, { new: true });
  if (!target) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  if (!isActive) await User.updateOne({ _id: targetUserId }, { $unset: { refreshTokenHash: 1 } });
  await audit({ actor, action: isActive ? 'user.activated' : 'user.deactivated', entityType: 'User', entityId: target._id, ip });
  return target;
}

export async function listPendingEvents() {
  return Event.find({ status: 'pending' }).sort({ createdAt: 1 }).populate({ path: 'organizer', select: 'name email' });
}

export async function approveEvent({ eventId, actor, ip }) {
  const event = await Event.findById(eventId).populate('organizer', 'name email');
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  if (event.status !== 'pending') throw ApiError.conflict(`Event is "${event.status}", not pending`, 'NOT_PENDING');

  event.status = 'published';
  await event.save();
  cacheDeletePrefix('events:');
  emitAvailability(event);

  if (event.organizer) {
    enqueueEmail({ to: event.organizer._id, toEmail: event.organizer.email, template: 'event_approved', payload: { name: event.organizer.name, title: event.title } }).catch(() => {});
  }
  await audit({ actor, action: 'event.approved', entityType: 'Event', entityId: event._id, ip });

  // People may already be waiting (e.g. draft published) — give them their seats.
  await promoteWaitlist(event._id).catch(() => {});
  return event;
}

export async function rejectEvent({ eventId, reason, actor, ip }) {
  const event = await Event.findById(eventId).populate('organizer', 'name email');
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  if (event.status !== 'pending') throw ApiError.conflict(`Event is "${event.status}", not pending`, 'NOT_PENDING');

  event.status = 'rejected';
  event.rejectionReason = reason;
  await event.save();
  cacheDeletePrefix('events:');

  if (event.organizer) {
    enqueueEmail({ to: event.organizer._id, toEmail: event.organizer.email, template: 'event_rejected', payload: { name: event.organizer.name, title: event.title, reason } }).catch(() => {});
  }
  await audit({ actor, action: 'event.rejected', entityType: 'Event', entityId: event._id, meta: { reason }, ip });
  return event;
}

export async function listAuditLogs({ action, page, limit }) {
  const filter = action ? { action } : {};
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items: publicize(items), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function listMail({ page = 1, limit = 20 } = {}) {
  const [items, total] = await Promise.all([
    Mail.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Mail.countDocuments(),
  ]);
  return { items: publicize(items), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
