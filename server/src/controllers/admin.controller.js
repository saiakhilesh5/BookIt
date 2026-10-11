import { asyncHandler, send } from '../utils/asyncHandler.js';
import { PromoCode } from '../models/PromoCode.js';
import * as promoService from '../services/promo.service.js';
import * as adminService from '../services/admin.service.js';

export const create = asyncHandler(async (req, res) => {
  const promo = await PromoCode.create({ ...req.body, createdBy: req.user._id });
  res.status(201);
  send(res, promo);
});

export const list = asyncHandler(async (req, res) => {
  const promos = await PromoCode.find().sort({ createdAt: -1 }).limit(50);
  send(res, promos);
});

export const validate = asyncHandler(async (req, res) => {
  send(res, await promoService.validate(req.body));
});

export const stats = asyncHandler(async (_req, res) => {
  send(res, await adminService.platformStats());
});

export const users = asyncHandler(async (req, res) => {
  const { items, meta } = await adminService.listUsers(req.query);
  send(res, items, meta);
});

export const changeRole = asyncHandler(async (req, res) => {
  send(res, await adminService.changeUserRole({ targetUserId: req.params.id, role: req.body.role, actor: req.user, ip: req.ip }));
});

export const changeActive = asyncHandler(async (req, res) => {
  send(res, await adminService.setUserActive({ targetUserId: req.params.id, isActive: req.body.isActive, actor: req.user, ip: req.ip }));
});

export const pendingEvents = asyncHandler(async (_req, res) => {
  send(res, await adminService.listPendingEvents());
});

export const approveEvent = asyncHandler(async (req, res) => {
  send(res, await adminService.approveEvent({ eventId: req.params.id, actor: req.user, ip: req.ip }));
});

export const rejectEvent = asyncHandler(async (req, res) => {
  send(res, await adminService.rejectEvent({ eventId: req.params.id, reason: req.body.reason, actor: req.user, ip: req.ip }));
});

export const auditLogs = asyncHandler(async (req, res) => {
  const { items, meta } = await adminService.listAuditLogs(req.query);
  send(res, items, meta);
});

export const mails = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const { items, meta } = await adminService.listMail({ page, limit: 20 });
  send(res, items, meta);
});
