import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken, createRefreshToken, hashToken } from '../utils/tokens.js';
import { env } from '../config/env.js';
import { enqueueEmail } from './mail.service.js';

export const REFRESH_COOKIE = 'bookit_refresh';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

async function issueTokens(user, res) {
  const accessToken = signAccessToken(user);
  const { token, hash } = createRefreshToken();
  user.refreshTokenHash = hash;
  user.lastLoginAt = new Date();
  await user.save();
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
  return { accessToken };
}

export async function register({ name, email, password, role }, res, ip) {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const user = await User.create({
    name,
    email,
    passwordHash: await User.hashPassword(password),
    role,
  });

  const { accessToken } = await issueTokens(user, res);
  enqueueEmail({
    to: user._id,
    toEmail: user.email,
    template: 'welcome',
    payload: { name: user.name, role: user.role },
  }).catch(() => {});
  return { user: user.toJSON(), accessToken };
}

export async function login({ email, password }, res) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await user.checkPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');

  const { accessToken } = await issueTokens(user, res);
  return { user: user.toJSON(), accessToken };
}

// Rotate refresh token: single-use — the old token is invalidated on every refresh.
export async function refresh(rawToken, res) {
  if (!rawToken) throw ApiError.unauthorized('Refresh token missing', 'NO_REFRESH_TOKEN');
  const user = await User.findOne({ refreshTokenHash: hashToken(rawToken) }).select('+refreshTokenHash');
  if (!user) throw ApiError.unauthorized('Refresh token invalid or already used', 'INVALID_REFRESH_TOKEN');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');

  const { accessToken } = await issueTokens(user, res);
  return { user: user.toJSON(), accessToken };
}

export async function logout(userId, res) {
  await User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1 } });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}
