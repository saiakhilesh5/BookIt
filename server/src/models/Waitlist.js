import mongoose from 'mongoose';

const waitlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    tierId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1, max: 10 },
    status: { type: String, enum: ['waiting', 'promoted', 'removed'], default: 'waiting', index: true },
    promotedAt: Date,
  },
  { timestamps: true },
);

// One active waitlist entry per user per event+tier.
waitlistSchema.index({ user: 1, event: 1, tierId: 1 }, { unique: true });
waitlistSchema.index({ event: 1, tierId: 1, status: 1, createdAt: 1 });

waitlistSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Waitlist = mongoose.model('Waitlist', waitlistSchema);
