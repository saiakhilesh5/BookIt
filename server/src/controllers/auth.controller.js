import { asyncHandler, send } from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, res, req.ip);
  res.status(201);
  send(res, result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, res);
  send(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.cookies?.[authService.REFRESH_COOKIE], res);
  send(res, result);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id, res);
  send(res, { message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  send(res, { user: req.user.toJSON() });
});
