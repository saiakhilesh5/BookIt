import { asyncHandler, send } from '../utils/asyncHandler.js';
import * as eventService from '../services/event.service.js';
import { Waitlist } from '../models/Waitlist.js';

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await eventService.listEvents(req.query);
  send(res, items, meta);
});

export const meta = asyncHandler(async (_req, res) => {
  send(res, await eventService.listMeta());
});

export const featured = asyncHandler(async (_req, res) => {
  send(res, await eventService.featuredEvents(6));
});

export const get = asyncHandler(async (req, res) => {
  send(res, await eventService.getEvent(req.params.id, { viewer: req.user ?? null }));
});

export const mine = asyncHandler(async (req, res) => {
  send(res, await eventService.listMyEvents(req.user._id));
});

export const create = asyncHandler(async (req, res) => {
  const event = await eventService.createEvent({ organizer: req.user, body: req.body });
  res.status(201);
  send(res, event);
});

export const update = asyncHandler(async (req, res) => {
  send(res, await eventService.updateEvent({ eventId: req.params.id, organizer: req.user, body: req.body, ip: req.ip }));
});

export const cancel = asyncHandler(async (req, res) => {
  send(res, await eventService.cancelEvent({ eventId: req.params.id, actor: req.user, ip: req.ip }));
});

export const stats = asyncHandler(async (req, res) => {
  send(res, await eventService.eventStats({ eventId: req.params.id, organizer: req.user }));
});

export const joinWaitlist = asyncHandler(async (req, res) => {
  const result = await import('../services/waitlist.service.js').then((m) =>
    m.joinWaitlist({ userId: req.user._id, eventId: req.params.id, tierId: req.body.tierId, quantity: req.body.quantity }),
  );
  res.status(201);
  send(res, result);
});

export const leaveWaitlist = asyncHandler(async (req, res) => {
  const result = await import('../services/waitlist.service.js').then((m) =>
    m.leaveWaitlist({ userId: req.user._id, eventId: req.params.id, tierId: req.body.tierId }),
  );
  send(res, result);
});

export const myWaitlist = asyncHandler(async (req, res) => {
  const items = await import('../services/waitlist.service.js').then((m) => m.myWaitlist(req.user._id));
  send(res, items);
});
