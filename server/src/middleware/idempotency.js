import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';

// POST /bookings requires an Idempotency-Key so retries and double-clicks never double-book.
export const requireIdempotencyKey = (req, _res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string' || key.length < 8 || key.length > 128) {
    return next(ApiError.badRequest('Idempotency-Key header (8-128 chars) is required', 'IDEMPOTENCY_KEY_REQUIRED'));
  }
  req.idempotencyKey = key;
  next();
};

export const newIdempotencyKey = () => crypto.randomUUID();
