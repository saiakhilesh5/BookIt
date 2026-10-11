import { z } from 'zod';
import { EVENT_CATEGORIES } from '../models/Event.js';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[a-zA-Z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  role: z.enum(['user', 'organizer']).default('user'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const eventListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  city: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(['date_asc', 'date_desc', 'price_asc', 'price_desc', 'newest', 'popular']).default('date_asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

const tierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(60),
  price: z.number().min(0).max(100000),
  capacity: z.number().int().min(1).max(100000),
});

export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(20).max(5000),
    category: z.enum(EVENT_CATEGORIES),
    venue: z.string().trim().min(2).max(160),
    city: z.string().trim().min(2).max(80),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    images: z.array(z.string().url().max(500)).max(5).default([]),
    tiers: z.array(tierSchema).min(1, 'At least one ticket tier is required').max(6),
    submit: z.boolean().default(true), // false = save as draft
  })
  .refine((v) => v.endsAt > v.startsAt, { message: 'End time must be after start time', path: ['endsAt'] })
  .refine((v) => v.startsAt > new Date(), { message: 'Start time must be in the future', path: ['startsAt'] });

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().min(20).max(5000).optional(),
    category: z.enum(EVENT_CATEGORIES).optional(),
    venue: z.string().trim().min(2).max(160).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    images: z.array(z.string().url().max(500)).max(5).optional(),
    tiers: z.array(tierSchema).min(1).max(6).optional(),
    submit: z.boolean().optional(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
    message: 'End time must be after start time',
    path: ['endsAt'],
  });

export const createBookingSchema = z.object({
  eventId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid event id'),
  tierId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid tier id'),
  quantity: z.number().int().min(1).max(10),
  promoCode: z.string().trim().max(24).optional(),
});

export const payBookingSchema = z.object({
  card: z.object({
    number: z.string().trim().min(12).max(23),
    name: z.string().trim().min(2).max(80),
    expMonth: z.number().int().min(1).max(12),
    expYear: z.number().int().min(new Date().getFullYear()).max(2100),
    cvc: z.string().trim().regex(/^\d{3,4}$/),
  }),
});

export const joinWaitlistSchema = z.object({
  tierId: z.string().regex(/^[a-f\d]{24}$/i),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const createPromoSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, '3-24 chars: letters, digits, - or _'),
    type: z.enum(['percent', 'flat']),
    value: z.number().min(0),
    maxUses: z.number().int().min(1).nullable().default(null),
    expiresAt: z.coerce.date().nullable().default(null),
    event: z.string().regex(/^[a-f\d]{24}$/i).nullable().default(null),
  })
  .refine((v) => v.type !== 'percent' || v.value <= 100, {
    message: 'Percent discount cannot exceed 100',
    path: ['value'],
  });

export const validatePromoSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24),
  eventId: z.string().regex(/^[a-f\d]{24}$/i),
  amount: z.number().min(0),
});

export const applyPromoSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24),
});

export const rejectEventSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const roleChangeSchema = z.object({
  role: z.enum(['user', 'organizer', 'admin']),
});

export const activeChangeSchema = z.object({
  isActive: z.boolean(),
});

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['user', 'organizer', 'admin']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
