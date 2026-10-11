import { asyncHandler, send } from '../utils/asyncHandler.js';
import * as bookingService from '../services/booking.service.js';
import { buildTicketPdf } from '../utils/ticket.js';
import { ApiError } from '../utils/ApiError.js';
import { Event } from '../models/Event.js';

export const create = asyncHandler(async (req, res) => {
  const { booking, idempotent } = await bookingService.createBooking({
    userId: req.user._id,
    userEmail: req.user.email,
    userName: req.user.name,
    eventId: req.body.eventId,
    tierId: req.body.tierId,
    quantity: req.body.quantity,
    promoCode: req.body.promoCode,
    idempotencyKey: req.idempotencyKey,
  });
  if (idempotent) res.status(200);
  else res.status(201);
  send(res, booking);
});

export const pay = asyncHandler(async (req, res) => {
  const booking = await bookingService.payBooking({
    bookingId: req.params.id,
    userId: req.user._id,
    userEmail: req.user.email,
    userName: req.user.name,
    card: req.body.card,
    ip: req.ip,
  });
  send(res, booking);
});

export const applyPromo = asyncHandler(async (req, res) => {
  send(res, await bookingService.applyPromo({ bookingId: req.params.id, userId: req.user._id, code: req.body.code }));
});

export const removePromo = asyncHandler(async (req, res) => {
  send(res, await bookingService.removePromo({ bookingId: req.params.id, userId: req.user._id }));
});

export const cancel = asyncHandler(async (req, res) => {
  const result = await bookingService.cancelBooking({
    bookingId: req.params.id,
    userId: req.user._id,
    userRole: req.user.role,
    userName: req.user.name,
    userEmail: req.user.email,
    ip: req.ip,
  });
  send(res, result);
});

export const mine = asyncHandler(async (req, res) => {
  send(res, await bookingService.listMyBookings(req.user._id));
});

export const get = asyncHandler(async (req, res) => {
  send(res, await bookingService.getBookingForUser(req.params.id, req.user));
});

export const ticket = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingForUser(req.params.id, req.user);
  if (booking.status !== 'confirmed') {
    throw ApiError.badRequest('Tickets are only available for confirmed bookings', 'NOT_CONFIRMED');
  }
  const event = await Event.findById(booking.event);
  const pdf = await buildTicketPdf({ booking, event, holder: booking.user?.name ?? req.user.name });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bookit-${booking.ticketCode}.pdf"`);
  res.send(pdf);
});

export const verify = asyncHandler(async (req, res) => {
  send(res, await bookingService.verifyTicket(req.params.code));
});
