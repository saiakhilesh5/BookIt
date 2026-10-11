import mongoose from 'mongoose';

export const EVENT_CATEGORIES = [
  'Music',
  'Sports',
  'Tech',
  'Business',
  'Arts',
  'Food',
  'Health',
  'Education',
  'Travel',
  'Other',
];
export const EVENT_STATUSES = ['draft', 'pending', 'published', 'rejected', 'cancelled'];

const tierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    price: { type: Number, required: true, min: 0 },
    capacity: { type: Number, required: true, min: 1 },
    // Live inventory counters. Invariant: available + sold + held === capacity at all times.
    sold: { type: Number, default: 0, min: 0 },
    held: { type: Number, default: 0, min: 0 },
    available: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const eventSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 140 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 5000 },
    category: { type: String, enum: EVENT_CATEGORIES, required: true, index: true },
    location: {
      venue: { type: String, required: true, trim: true, maxlength: 160 },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      geo: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    images: { type: [String], default: [] },
    status: { type: String, enum: EVENT_STATUSES, default: 'pending', index: true },
    tiers: { type: [tierSchema], validate: (v) => v.length > 0 && v.length <= 6 },
    views: { type: Number, default: 0 },
    rejectionReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

eventSchema.index({ title: 'text', description: 'text', 'location.city': 'text' });
eventSchema.index({ status: 1, startsAt: 1 });
eventSchema.index({ 'location.geo': '2dsphere' });

eventSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Event = mongoose.model('Event', eventSchema);
