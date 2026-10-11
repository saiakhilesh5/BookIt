import { Router } from 'express';
import { protect, authorize, optionalAuth } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { authLimiter, bookingLimiter } from '../middleware/rateLimit.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';
import * as auth from '../controllers/auth.controller.js';
import * as events from '../controllers/event.controller.js';
import * as bookings from '../controllers/booking.controller.js';
import * as admin from '../controllers/admin.controller.js';
import {
  registerSchema, loginSchema, eventListQuerySchema, createEventSchema, updateEventSchema,
  createBookingSchema, payBookingSchema, joinWaitlistSchema, createPromoSchema, validatePromoSchema,
  applyPromoSchema, rejectEventSchema, roleChangeSchema, activeChangeSchema, listUsersQuerySchema,
  auditLogQuerySchema,
} from '../validators/index.js';

const router = Router();

// ------------------------------ Auth ------------------------------
const authRouter = Router();
authRouter.post('/register', authLimiter, validate({ body: registerSchema }), auth.register);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
authRouter.post('/refresh', auth.refresh);
authRouter.post('/logout', protect, auth.logout);
authRouter.get('/me', protect, auth.me);
router.use('/auth', authRouter);

// ------------------------------ Events ------------------------------
const eventsRouter = Router();
eventsRouter.get('/', validate({ query: eventListQuerySchema }), events.list);
eventsRouter.get('/meta', events.meta);
eventsRouter.get('/featured', events.featured);
eventsRouter.get('/mine', protect, authorize('organizer', 'admin'), events.mine);
eventsRouter.post('/', protect, authorize('organizer', 'admin'), validate({ body: createEventSchema }), events.create);
eventsRouter.get('/:id', optionalAuth, events.get);
eventsRouter.patch('/:id', protect, authorize('organizer', 'admin'), validate({ body: updateEventSchema }), events.update);
eventsRouter.delete('/:id', protect, authorize('organizer', 'admin'), events.cancel);
eventsRouter.get('/:id/stats', protect, authorize('organizer', 'admin'), events.stats);
eventsRouter.post('/:id/waitlist', protect, validate({ body: joinWaitlistSchema }), bookingLimiter, events.joinWaitlist);
eventsRouter.delete('/:id/waitlist', protect, validate({ body: joinWaitlistSchema }), events.leaveWaitlist);
router.use('/events', eventsRouter);

// ------------------------------ Bookings ------------------------------
const bookingsRouter = Router();
bookingsRouter.post('/', protect, bookingLimiter, requireIdempotencyKey, validate({ body: createBookingSchema }), bookings.create);
bookingsRouter.get('/me', protect, bookings.mine);
bookingsRouter.get('/verify/:code', bookings.verify);
bookingsRouter.post('/:id/pay', protect, bookingLimiter, validate({ body: payBookingSchema }), bookings.pay);
bookingsRouter.post('/:id/promo', protect, validate({ body: applyPromoSchema }), bookings.applyPromo);
bookingsRouter.delete('/:id/promo', protect, bookings.removePromo);
bookingsRouter.post('/:id/cancel', protect, bookings.cancel);
bookingsRouter.get('/:id/ticket', protect, bookings.ticket);
bookingsRouter.get('/:id', protect, bookings.get);
router.use('/bookings', bookingsRouter);

// ------------------------------ Promos ------------------------------
const promosRouter = Router();
promosRouter.post('/', protect, authorize('organizer', 'admin'), validate({ body: createPromoSchema }), admin.create);
promosRouter.get('/', protect, authorize('organizer', 'admin'), admin.list);
promosRouter.post('/validate', protect, validate({ body: validatePromoSchema }), admin.validate);
router.use('/promos', promosRouter);

// ------------------------------ Waitlist (user's own) ------------------------------
const waitlistRouter = Router();
waitlistRouter.get('/me', protect, events.myWaitlist);
router.use('/waitlist', waitlistRouter);

// ------------------------------ Admin ------------------------------
const adminRouter = Router();
adminRouter.use(protect, authorize('admin'));
adminRouter.get('/stats', admin.stats);
adminRouter.get('/users', validate({ query: listUsersQuerySchema }), admin.users);
adminRouter.patch('/users/:id/role', validate({ body: roleChangeSchema }), admin.changeRole);
adminRouter.patch('/users/:id/status', validate({ body: activeChangeSchema }), admin.changeActive);
adminRouter.get('/events/pending', admin.pendingEvents);
adminRouter.patch('/events/:id/approve', admin.approveEvent);
adminRouter.patch('/events/:id/reject', validate({ body: rejectEventSchema }), admin.rejectEvent);
adminRouter.get('/audit-logs', validate({ query: auditLogQuerySchema }), admin.auditLogs);
adminRouter.get('/mails', admin.mails);
router.use('/admin', adminRouter);

export default router;
