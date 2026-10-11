import mongoose from 'mongoose';

export const BOOKING_STATUSES = ['held', 'confirmed', 'cancelled', 'expired', 'refunded'];

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    tierId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tierName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, max: 10 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    promoCode: { type: String, uppercase: true, trim: true },

    status: { type: String, enum: BOOKING_STATUSES, default: 'held', index: true },
    source: { type: String, enum: ['user', 'waitlist'], default: 'user' },
    holdExpiresAt: { type: Date, index: true },

    payment: {
      method: { type: String, default: 'mock_card' },
      ref: String,
      paidAt: Date,
      refundedAt: Date,
      failureReason: String,
    },

    ticketCode: { type: String, unique: true, sparse: true, uppercase: true },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);

// Duplicate submissions with the same Idempotency-Key return the original booking.
bookingSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
bookingSchema.index({ status: 1, holdExpiresAt: 1 });
bookingSchema.index({ event: 1, status: 1 });

bookingSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Booking = mongoose.model('Booking', bookingSchema);
