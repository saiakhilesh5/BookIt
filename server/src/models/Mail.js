import mongoose from 'mongoose';

// Every outbound email is recorded here — doubles as a dev-friendly outbox when SMTP is not configured.
const mailSchema = new mongoose.Schema(
  {
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    toEmail: { type: String, required: true },
    subject: { type: String, required: true },
    template: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued', index: true },
    error: String,
    sentAt: Date,
  },
  { timestamps: true },
);

mailSchema.index({ createdAt: -1 });

export const Mail = mongoose.model('Mail', mailSchema);
