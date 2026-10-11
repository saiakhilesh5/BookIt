import { Booking } from '../models/Booking.js';
import { Event } from '../models/Event.js';
import { ApiError } from '../utils/ApiError.js';
import { generateTicketCode } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { emitAvailability, emitToUser } from '../sockets/emitter.js';
import { getQueue } from '../jobs/queue.js';
import { enqueueEmail } from './mail.service.js';
import { audit } from './audit.service.js';
import { validateForBooking, computeDiscount, consume } from './promo.service.js';
import { promoteWaitlist } from './waitlist.service.js';
import { cacheDeletePrefix } from '../utils/cache.js';

const holdMs = () => env.SEAT_HOLD_MINUTES * 60 * 1000;

// ---------------------------------------------------------------------------
// Atomic inventory primitives.
// The availability check and the decrement happen in ONE conditional update —
// two concurrent requests can never both pass the check. This is what makes
// overbooking impossible without transactions.
// ---------------------------------------------------------------------------

async function holdSeats(eventId, tierId, quantity) {
  const result = await Event.updateOne(
    {
      _id: eventId,
      status: 'published',
      tiers: { $elemMatch: { _id: tierId, available: { $gte: quantity } } },
    },
    { $inc: { 'tiers.$.available': -quantity, 'tiers.$.held': quantity } },
  );
  return result.modifiedCount === 1;
}

async function releaseHeldSeats(eventId, tierId, quantity) {
  await Event.updateOne(
    { _id: eventId, 'tiers._id': tierId },
    { $inc: { 'tiers.$.available': quantity, 'tiers.$.held': -quantity } },
  );
  const event = await Event.findById(eventId);
  emitAvailability(event);
}

async function confirmSeats(eventId, tierId, quantity) {
  await Event.updateOne(
    { _id: eventId, 'tiers._id': tierId },
    { $inc: { 'tiers.$.sold': quantity, 'tiers.$.held': -quantity } },
  );
}

async function releaseSoldSeats(eventId, tierId, quantity) {
  await Event.updateOne(
    { _id: eventId, 'tiers._id': tierId },
    { $inc: { 'tiers.$.available': quantity, 'tiers.$.sold': -quantity } },
  );
}

async function afterInventoryChange(eventId) {
  cacheDeletePrefix('events:list');
  const event = await Event.findById(eventId);
  emitAvailability(event);
}

// ---------------------------------------------------------------------------
// Booking creation
// ---------------------------------------------------------------------------

export async function createBooking({ userId, userEmail, userName, eventId, tierId, quantity, promoCode, idempotencyKey, source = 'user' }) {
  // 1) Idempotency: a retry with the same key returns the original booking.
  const existing = await Booking.findOne({ user: userId, idempotencyKey });
  if (existing) return { booking: existing, idempotent: true };

  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('Event not found', 'EVENT_NOT_FOUND');
  if (event.status !== 'published') throw ApiError.conflict('This event is not open for booking', 'EVENT_NOT_BOOKABLE');
  if (event.startsAt <= new Date()) throw ApiError.conflict('This event has already started', 'EVENT_STARTED');

  const tier = event.tiers.id(tierId);
  if (!tier) throw ApiError.notFound('Ticket tier not found', 'TIER_NOT_FOUND');

  let promo = null;
  if (promoCode) promo = await validateForBooking(promoCode, eventId);

  // 2) Atomic seat hold — the core overbooking guard.
  const held = await holdSeats(eventId, tierId, quantity);
  if (!held) {
    const fresh = await Event.findById(eventId).select('tiers');
    const freshTier = fresh?.tiers.id(tierId);
    throw new ApiError(
      409,
      'SEATS_UNAVAILABLE',
      freshTier && freshTier.available > 0
        ? `Only ${freshTier.available} seat(s) left in ${tier.name}`
        : `${tier.name} is sold out`,
      { available: freshTier?.available ?? 0 },
    );
  }

  const gross = tier.price * quantity;
  const discountAmount = promo ? computeDiscount(promo, gross) : 0;
  const totalAmount = Math.round((gross - discountAmount) * 100) / 100;

  const booking = new Booking({
    user: userId,
    event: eventId,
    tierId,
    tierName: tier.name,
    quantity,
    unitPrice: tier.price,
    discountAmount,
    totalAmount,
    promoCode: promo?.code || undefined,
    status: 'held',
    source,
    holdExpiresAt: new Date(Date.now() + holdMs()),
    idempotencyKey,
  });

  try {
    await booking.save();
  } catch (err) {
    // Another request with the same idempotency key won the race: undo our hold.
    await releaseHeldSeats(eventId, tierId, quantity);
    if (err.code === 11000) {
      const original = await Booking.findOne({ user: userId, idempotencyKey });
      if (original) return { booking: original, idempotent: true };
    }
    throw err;
  }

  // 3) Delayed expiry job (+ lazy sweep as a safety net).
  await getQueue('hold-expiry').add(
    { bookingId: booking._id.toString() },
    { delay: holdMs(), jobId: `hold:${booking._id}` },
  );

  await afterInventoryChange(eventId);
  return { booking, idempotent: false };
}

// ---------------------------------------------------------------------------
// Payment (mock gateway — swap this function for Stripe in production)
// ---------------------------------------------------------------------------

function luhnValid(cardNumber) {
  let sum = 0;
  let double = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = cardNumber.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const DECLINE_MAP = {
  4000000000000002: 'Your card was declined.',
  4000000000009995: 'Insufficient funds.',
};

async function mockGateway(card) {
  const number = card.number.replace(/[\s-]/g, '');
  await new Promise((r) => setTimeout(r, 600)); // simulate gateway latency

  if (DECLINE_MAP[number]) throw ApiError.paymentRequired(DECLINE_MAP[number], 'CARD_DECLINED');
  if (!luhnValid(number)) throw ApiError.paymentRequired('Invalid card number', 'INVALID_CARD');
  if (card.expYear < new Date().getFullYear() || (card.expYear === new Date().getFullYear() && card.expMonth < new Date().getMonth() + 1)) {
    throw ApiError.paymentRequired('Card has expired', 'CARD_EXPIRED');
  }
  return { ref: `pi_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` };
}

export async function payBooking({ bookingId, userId, userEmail, userName, card, ip }) {
  let booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (!booking.user.equals(userId)) throw ApiError.forbidden('This booking belongs to another user', 'NOT_OWNER');

  // Lazy expiry: if the hold already lapsed, release seats before failing.
  if (booking.status === 'held' && booking.holdExpiresAt <= new Date()) {
    await expireHeldBooking(booking._id);
    booking = await Booking.findById(bookingId);
  }
  if (booking.status !== 'held') {
    throw new ApiError(410, 'HOLD_EXPIRED', 'Your seat hold has expired — please book again');
  }

  const event = await Event.findById(booking.event);
  if (!event || event.status !== 'published') {
    throw ApiError.conflict('This event is no longer bookable', 'EVENT_NOT_BOOKABLE');
  }

  // Charge through the gateway before mutating anything.
  let payment;
  try {
    payment = await mockGateway(card);
  } catch (err) {
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { 'payment.failureReason': err.message } },
    );
    enqueueEmail({
      to: userId,
      toEmail: userEmail,
      template: 'payment_failed',
      payload: { name: userName, eventTitle: event.title, reason: err.message },
    }).catch(() => {});
    throw err;
  }

  // Confirm atomically — guards against concurrent cancel/expire.
  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'held' },
    {
      $set: {
        status: 'confirmed',
        'payment.method': 'mock_card',
        'payment.ref': payment.ref,
        'payment.paidAt': new Date(),
        'payment.failureReason': undefined,
        ticketCode: generateTicketCode(),
      },
      $unset: { holdExpiresAt: 1 },
    },
    { new: true },
  );
  if (!confirmed) throw new ApiError(410, 'HOLD_EXPIRED', 'Your seat hold has expired — please book again');

  await confirmSeats(booking.event, booking.tierId, booking.quantity);
  if (booking.promoCode) await consume(booking.promoCode);

  await audit({ actor: { _id: userId, name: userName, role: 'user' }, action: 'booking.paid', entityType: 'Booking', entityId: booking._id, meta: { total: booking.totalAmount, ref: payment.ref }, ip });

  enqueueEmail({
    to: userId,
    toEmail: userEmail,
    template: 'booking_confirmed',
    payload: {
      name: userName,
      eventTitle: event.title,
      tierName: booking.tierName,
      quantity: booking.quantity,
      totalAmount: booking.totalAmount,
      startsAt: event.startsAt,
      venue: event.location.venue,
      city: event.location.city,
      ticketCode: confirmed.ticketCode,
    },
  }).catch(() => {});

  await afterInventoryChange(booking.event);
  emitToUser(userId, 'booking:confirmed', { bookingId: booking._id.toString(), ticketCode: confirmed.ticketCode });

  return confirmed;
}

// ---------------------------------------------------------------------------
// Promo on an existing hold
// ---------------------------------------------------------------------------

export async function applyPromo({ bookingId, userId, code }) {
  const booking = await Booking.findOne({ _id: bookingId, user: userId });
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (booking.status !== 'held' || booking.holdExpiresAt <= new Date()) {
    throw new ApiError(410, 'HOLD_EXPIRED', 'This hold is no longer active');
  }

  const promo = await validateForBooking(code, booking.event.toString());
  const gross = booking.unitPrice * booking.quantity;
  const discountAmount = computeDiscount(promo, gross);

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'held' },
    { $set: { promoCode: promo.code, discountAmount, totalAmount: Math.round((gross - discountAmount) * 100) / 100 } },
    { new: true },
  );
  if (!updated) throw new ApiError(410, 'HOLD_EXPIRED', 'This hold is no longer active');
  return updated;
}

export async function removePromo({ bookingId, userId }) {
  const grossBook = await Booking.findOne({ _id: bookingId, user: userId });
  if (!grossBook) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const updated = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'held' },
    { $set: { promoCode: undefined, discountAmount: 0, totalAmount: grossBook.unitPrice * grossBook.quantity }, $unset: { promoCode: 1 } },
    { new: true },
  );
  if (!updated) throw new ApiError(410, 'HOLD_EXPIRED', 'This hold is no longer active');
  return updated;
}

// ---------------------------------------------------------------------------
// Cancel / expiry / refunds
// ---------------------------------------------------------------------------

export async function cancelBooking({ bookingId, userId, userRole, userName, userEmail, ip }) {
  let booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const isOwner = booking.user.equals(userId);
  if (!isOwner && userRole !== 'admin') throw ApiError.forbidden('Not allowed', 'NOT_OWNER');

  if (booking.status === 'held' && booking.holdExpiresAt <= new Date()) {
    await expireHeldBooking(booking._id);
    booking = await Booking.findById(bookingId);
  }

  const event = await Event.findById(booking.event);

  if (booking.status === 'held') {
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'held' },
      { $set: { status: 'cancelled' }, $unset: { holdExpiresAt: 1 } },
      { new: true },
    );
    if (!updated) throw ApiError.conflict('Booking is no longer on hold', 'NOT_HELD');
    await releaseHeldSeats(booking.event, booking.tierId, booking.quantity);
    await afterInventoryChange(booking.event);
    await audit({ actor: { _id: userId, name: userName, role: userRole }, action: 'booking.cancelled', entityType: 'Booking', entityId: booking._id, meta: { from: 'held' }, ip });
    return { booking: updated, refunded: false };
  }

  if (booking.status === 'confirmed') {
    if (event && event.startsAt <= new Date()) {
      throw ApiError.conflict('This event has already started — bookings can no longer be cancelled', 'EVENT_STARTED');
    }
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'confirmed' },
      { $set: { status: 'refunded', 'payment.refundedAt': new Date() } },
      { new: true },
    );
    if (!updated) throw ApiError.conflict('Booking was already processed', 'NOT_CONFIRMED');

    await releaseSoldSeats(booking.event, booking.tierId, booking.quantity);
    await afterInventoryChange(booking.event);
    await audit({ actor: { _id: userId, name: userName, role: userRole }, action: 'booking.refunded', entityType: 'Booking', entityId: booking._id, meta: { amount: booking.totalAmount }, ip });

    enqueueEmail({
      to: booking.user,
      toEmail: userEmail,
      template: 'booking_cancelled',
      payload: { name: userName, eventTitle: event?.title ?? 'the event', tierName: booking.tierName, quantity: booking.quantity, totalAmount: booking.totalAmount, refunded: true },
    }).catch(() => {});

    await promoteWaitlist(booking.event, booking.tierId);
    return { booking: updated, refunded: true };
  }

  throw ApiError.conflict(`Booking with status "${booking.status}" cannot be cancelled`, 'NOT_CANCELLABLE');
}

// Idempotent by design: the conditional findOneAndUpdate means only one caller
// ever performs the release, no matter how often the job or sweep fires.
export async function expireHeldBooking(bookingId) {
  const expired = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'held', holdExpiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } },
    { new: true },
  );
  if (!expired) return false;

  await releaseHeldSeats(expired.event, expired.tierId, expired.quantity);
  await afterInventoryChange(expired.event);

  const [user, event] = await Promise.all([import('../models/User.js').then((m) => m.User.findById(expired.user)), Event.findById(expired.event)]);
  if (user && event) {
    enqueueEmail({
      to: user._id,
      toEmail: user.email,
      template: 'hold_expired',
      payload: { name: user.name, eventTitle: event.title, quantity: expired.quantity },
    }).catch(() => {});
    emitToUser(user._id, 'booking:expired', { bookingId: expired._id.toString() });
  }
  await promoteWaitlist(expired.event, expired.tierId);
  return true;
}

// Safety net for jobs lost to restarts; runs on an interval and lazily on reads.
export async function sweepExpiredHolds(eventId = null) {
  const filter = { status: 'held', holdExpiresAt: { $lte: new Date() } };
  if (eventId) filter.event = eventId;
  const stale = await Booking.find(filter).select('_id').limit(200);
  for (const b of stale) await expireHeldBooking(b._id);
  return stale.length;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBookingForUser(bookingId, user) {
  const booking = await Booking.findById(bookingId)
    .populate({ path: 'event', select: 'title startsAt endsAt status images location category organizer tiers' })
    .populate({ path: 'user', select: 'name email' });
  if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  const isOwner = booking.user._id.equals(user._id);
  if (!isOwner && user.role !== 'admin') throw ApiError.forbidden('Not allowed', 'NOT_OWNER');

  // Refresh a lapsed hold lazily so the client sees the truth.
  if (booking.status === 'held' && booking.holdExpiresAt <= new Date()) {
    await expireHeldBooking(booking._id);
    return getBookingForUser(bookingId, user);
  }
  return booking;
}

export async function listMyBookings(userId) {
  await sweepExpiredHolds();
  return Booking.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate({ path: 'event', select: 'title startsAt status images location category' });
}

export async function verifyTicket(ticketCode) {
  const booking = await Booking.findOne({ ticketCode: ticketCode.toUpperCase() })
    .populate({ path: 'event', select: 'title startsAt location' })
    .populate({ path: 'user', select: 'name' });
  if (!booking) throw ApiError.notFound('Ticket not found', 'TICKET_NOT_FOUND');
  return {
    valid: booking.status === 'confirmed',
    status: booking.status,
    eventTitle: booking.event?.title,
    tierName: booking.tierName,
    quantity: booking.quantity,
    holder: booking.user?.name,
    startsAt: booking.event?.startsAt,
    venue: booking.event?.location?.venue,
  };
}
