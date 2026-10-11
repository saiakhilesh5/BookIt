import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, name: user.name }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

// Refresh tokens are opaque random strings; only their SHA-256 hash is stored.
export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateTicketCode() {
  const bytes = crypto.randomBytes(8);
  let code = 'BI-';
  for (let i = 0; i < 8; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}
