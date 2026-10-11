import { PromoCode } from '../models/PromoCode.js';
import { ApiError } from '../utils/ApiError.js';

export function computeDiscount(promo, amount) {
  const raw = promo.type === 'percent' ? (amount * promo.value) / 100 : promo.value;
  return Math.min(Math.round(raw * 100) / 100, amount);
}

export async function validateForBooking(code, eventId) {
  const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true });
  if (!promo) throw ApiError.badRequest('Invalid promo code', 'PROMO_INVALID');
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    throw ApiError.badRequest('This promo code has expired', 'PROMO_EXPIRED');
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    throw ApiError.badRequest('This promo code has reached its usage limit', 'PROMO_EXHAUSTED');
  }
  if (promo.event && promo.event.toString() !== eventId) {
    throw ApiError.badRequest('This promo code is not valid for this event', 'PROMO_NOT_APPLICABLE');
  }
  return promo;
}

export async function validate({ code, eventId, amount }) {
  const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true });
  if (!promo) return { valid: false, message: 'Invalid promo code' };
  if (promo.expiresAt && promo.expiresAt < new Date()) return { valid: false, message: 'This promo code has expired' };
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses)
    return { valid: false, message: 'This promo code has reached its usage limit' };
  if (promo.event && promo.event.toString() !== eventId)
    return { valid: false, message: 'Not valid for this event' };
  const discount = computeDiscount(promo, amount);
  return {
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    discount,
    total: Math.max(0, Math.round((amount - discount) * 100) / 100),
    message: `Promo applied: −$${discount.toFixed(2)}`,
  };
}

// Called on payment confirmation — atomically consumes one use.
export async function consume(code) {
  await PromoCode.updateOne({ code: code.toUpperCase() }, { $inc: { usedCount: 1 } });
}
