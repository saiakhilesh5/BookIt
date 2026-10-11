import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMyBookings, useCancelBooking, downloadTicket } from '../api/hooks.js';
import { statusBadge } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Skeleton, Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { extractError } from '../api/client.js';
import { fmtDateTime, fmtMoney } from '../utils/format.js';

function BookingCard({ booking, onCancel }) {
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  const event = booking.event;
  const eventId = event?.id;

  const getTicket = async () => {
    setDownloading(true);
    try {
      await downloadTicket(booking.id);
      toast.success('Ticket downloaded');
    } catch (err) {
      toast.error(extractError(err, 'Could not download ticket'));
    } finally {
      setDownloading(false);
    }
  };

  const cancellable =
    (booking.status === 'held') ||
    (booking.status === 'confirmed' && event && new Date(event.startsAt) > new Date());

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 card-hover">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        {event?.images?.[0] ? (
          <Link to={`/events/${eventId}`} className="shrink-0">
            <img src={event.images[0]} alt="" className="h-24 w-full rounded-xl object-cover sm:h-24 sm:w-32" />
          </Link>
        ) : (
          <div className="h-24 w-full shrink-0 rounded-xl bg-ink-800 sm:w-32" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/events/${eventId}`} className="font-display text-lg font-bold text-white hover:text-brand-300">
                {event?.title ?? 'Event removed'}
              </Link>
              <p className="mt-1 text-sm text-slate-500">{fmtDateTime(event?.startsAt)}</p>
            </div>
            {statusBadge(booking.status)}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-slate-400">
            <span><strong className="text-slate-200">{booking.tierName}</strong> × {booking.quantity}</span>
            <span className="font-display font-bold text-white">{fmtMoney(booking.totalAmount)}</span>
            {booking.source === 'waitlist' && <span className="text-brand-300">via waitlist</span>}
            {booking.ticketCode && (
              <span className="font-mono text-xs tracking-wider text-brand-300">{booking.ticketCode}</span>
            )}
            {booking.discountAmount > 0 && (
              <span className="text-emerald-400">−{fmtMoney(booking.discountAmount)} {booking.promoCode}</span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {booking.status === 'confirmed' && (
              <Button size="sm" onClick={getTicket} loading={downloading}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Download ticket
              </Button>
            )}
            {booking.status === 'held' && (
              <Link to={`/checkout/${booking.id}`}>
                <Button size="sm">Complete payment</Button>
              </Link>
            )}
            {cancellable && (
              <Button size="sm" variant="ghost" onClick={() => onCancel(booking)}>
                {booking.status === 'confirmed' ? 'Cancel & refund' : 'Release hold'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyBookings() {
  const { data: bookings, isLoading } = useMyBookings();
  const cancelBooking = useCancelBooking();
  const toast = useToast();
  const [confirming, setConfirming] = useState(null);

  const doCancel = async () => {
    try {
      const result = await cancelBooking.mutateAsync(confirming.id);
      toast.success(result.refunded ? 'Booking cancelled — refund issued' : 'Hold released');
    } catch (err) {
      toast.error(extractError(err, 'Could not cancel'));
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">My bookings</h1>
          <p className="mt-1 text-sm text-slate-500">Tickets, holds, and refunds in one place.</p>
        </div>
        <Link to="/waitlist" className="text-sm font-bold text-brand-300 hover:text-brand-200">
          My waitlists →
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      ) : !bookings || bookings.length === 0 ? (
        <EmptyState
          icon={<svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" /></svg>}
          title="No bookings yet"
          description="When you book an event it will show up here with your tickets."
          action={<Link to="/events" className="rounded-xl bg-gradient-to-r from-brand-600 to-accent-600 px-6 py-2.5 font-bold text-white">Browse events</Link>}
        />
      ) : (
        <div className="space-y-5 animate-fade-up">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} onCancel={setConfirming} />
          ))}
        </div>
      )}

      <Modal open={Boolean(confirming)} onClose={() => setConfirming(null)} title="Cancel this booking?">
        {confirming && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-slate-400">
              {confirming.status === 'confirmed' ? (
                <>
                  You'll be refunded <strong className="text-slate-200">{fmtMoney(confirming.totalAmount)}</strong> in full
                  for <strong className="text-slate-200">{confirming.event?.title}</strong>. The seats go back on sale
                  (waitlisted fans get first dibs).
                </>
              ) : (
                <>
                  Your hold on <strong className="text-slate-200">{confirming.event?.title}</strong> will be released
                  immediately.
                </>
              )}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirming(null)}>Keep it</Button>
              <Button variant="danger" className="flex-1" loading={cancelBooking.isPending} onClick={doCancel}>
                Yes, cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
