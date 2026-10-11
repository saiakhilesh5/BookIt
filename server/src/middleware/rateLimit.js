import rateLimit from 'express-rate-limit';

const standardOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' },
  },
};

export const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, ...standardOptions });

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  ...standardOptions,
});

export const bookingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, ...standardOptions });
