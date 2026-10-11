import { env } from '../config/env.js';
import { Mail } from '../models/Mail.js';
import { logger } from '../utils/logger.js';
import { getQueue } from '../jobs/queue.js';

let transporter = null;
export async function initMail() {
  if (!env.SMTP_HOST) {
    logger.info('Mail: SMTP not configured — emails are recorded in the outbox only');
    return;
  }
  try {
    const nodemailer = await import('nodemailer');
    transporter = nodemailer.default.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    logger.info('Mail: SMTP transport ready');
  } catch (err) {
    logger.warn({ err }, 'Mail: SMTP setup failed, outbox-only mode');
  }
}

const templates = {
  welcome: (d) => `Hi ${d.name},

Welcome to BookIt! Your account is ready.
${d.role === 'organizer' ? 'You can now create and publish events from your organizer dashboard.' : 'Start exploring events and book your seat in seconds.'}

— The BookIt team`,
  booking_confirmed: (d) => `Hi ${d.name},

Your booking is confirmed! 🎉

  Event:   ${d.eventTitle}
  Tier:    ${d.tierName}
  Tickets: ${d.quantity}
  Total:   $${d.totalAmount.toFixed(2)}
  Date:    ${new Date(d.startsAt).toUTCString()}
  Venue:   ${d.venue}, ${d.city}

Ticket code: ${d.ticketCode}
Show this code (or the QR on your PDF ticket) at the entrance.

— The BookIt team`,
  booking_cancelled: (d) => `Hi ${d.name},

Your booking for "${d.eventTitle}" (${d.quantity} × ${d.tierName}) has been cancelled.
${d.refunded ? 'A full refund of $' + d.totalAmount.toFixed(2) + ' has been issued to your payment method.' : ''}

— The BookIt team`,
  hold_expired: (d) => `Hi ${d.name},

Your seat hold for "${d.eventTitle}" expired and the ${d.quantity} seat(s) were released.
You can try booking again while seats last.

— The BookIt team`,
  waitlist_promoted: (d) => `Good news ${d.name}!

A seat opened up for "${d.eventTitle}" — your waitlist spot was promoted and ${d.quantity} × ${d.tierName} seat(s) are now held for you for ${d.holdMinutes} minutes.
Complete your payment before ${new Date(d.holdExpiresAt).toLocaleTimeString()} to keep them.

— The BookIt team`,
  event_approved: (d) => `Hi ${d.name},

Your event "${d.title}" has been approved and is now live and bookable.

— The BookIt team`,
  event_rejected: (d) => `Hi ${d.name},

Your event "${d.title}" was not approved.
Reason: ${d.reason}

You can edit the event and resubmit it for review.

— The BookIt team`,
  event_cancelled: (d) => `Hi ${d.name},

The event "${d.eventTitle}" was cancelled by the organizer.
${d.refunded ? 'Your booking has been refunded in full ($' + d.totalAmount.toFixed(2) + ').' : ''}

We're sorry for the inconvenience.

— The BookIt team`,
  payment_failed: (d) => `Hi ${d.name},

A payment attempt for "${d.eventTitle}" was declined: ${d.reason}.
Your seats remain on hold until the hold expires — try again with another card.

— The BookIt team`,
};

export async function enqueueEmail({ to = null, toEmail, template, payload }) {
  const build = templates[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  const mail = await Mail.create({
    to,
    toEmail,
    template,
    subject: {
      welcome: 'Welcome to BookIt',
      booking_confirmed: `Booking confirmed — ${payload.eventTitle}`,
      booking_cancelled: `Booking cancelled — ${payload.eventTitle}`,
      hold_expired: `Seat hold expired — ${payload.eventTitle}`,
      waitlist_promoted: `You're in! Waitlist promotion — ${payload.eventTitle}`,
      event_approved: `Event approved — ${payload.title}`,
      event_rejected: `Event needs changes — ${payload.title}`,
      event_cancelled: `Event cancelled — ${payload.eventTitle}`,
      payment_failed: `Payment declined — ${payload.eventTitle}`,
    }[template],
    body: build(payload),
  });
  await getQueue('email').add({ mailId: mail._id.toString() });
  return mail;
}

export async function deliverEmail({ mailId }) {
  const mail = await Mail.findById(mailId);
  if (!mail || mail.status !== 'queued') return;

  if (!transporter) {
    // Outbox-only mode: consider recorded as sent (visible in admin panel).
    mail.status = 'sent';
    mail.sentAt = new Date();
    await mail.save();
    logger.info({ to: mail.toEmail, subject: mail.subject }, 'Mail recorded (outbox mode)');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"BookIt" <${env.SMTP_USER || 'no-reply@bookit.dev'}>`,
      to: mail.toEmail,
      subject: mail.subject,
      text: mail.body,
    });
    mail.status = 'sent';
    mail.sentAt = new Date();
    await mail.save();
  } catch (err) {
    mail.status = 'failed';
    mail.error = err.message;
    await mail.save();
    logger.error({ err, mailId }, 'Email delivery failed');
  }
}
