import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useBooking, usePayBooking, useApplyPromo } from '../api/hooks.js';
import { useToast } from '../components/ui/Toast.jsx';
import Button from '../components/ui/Button.jsx';
import Badge, { statusBadge } from '../components/ui/Badge.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { extractError, extractErrorCode } from '../api/client.js';
import { fmtDateTime, fmtMoney, fmtCountdown } from '../utils/format.js';

function useCountdown(expiresAt) {
  const [remaining, setRemaining] = useState(() => new Date(expiresAt) - Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, new Date(expiresAt) - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return remaining;
}

function CardInput({ card, setCard, errors }) {
  const fmtNumber = (v) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Card number</label>
        <div className="relative">
          <input
            value={card.number}
            onChange={(e) => setCard((c) => ({ ...c, number: fmtNumber(e.target.value) }))}
            placeholder="4242 4242 4242 4242"
            inputMode="numeric"
            className={`h-12 w-full rounded-xl border bg-ink-850 px-4 font-mono tracking-wider text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${errors?.number ? 'border-rose-500/60' : 'border-ink-600'}`}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">CARD</div>
        </div>
        {errors?.number && <p className="mt-1.5 text-xs font-medium text-rose-400">{errors.number}</p>}
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Name on card</label>
        <input
          value={card.name}
          onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
          placeholder="Alex Rivera"
          className={`h-12 w-full rounded-xl border bg-ink-850 px-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${errors?.name ? 'border-rose-500/60' : 'border-ink-600'}`}
        />
        {errors?.name && <p className="mt-1.5 text-xs font-medium text-rose-400">{errors.name}</p>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Month</label>
          <input
            value={card.expMonth}
            onChange={(e) => setCard((c) => ({ ...c, expMonth: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
            placeholder="12"
            inputMode="numeric"
            className="h-12 w-full rounded-xl border border-ink-600 bg-ink-850 px-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Year</label>
          <input
            value={card.expYear}
            onChange={(e) => setCard((c) => ({ ...c, expYear: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            placeholder="2027"
            inputMode="numeric"
            className="h-12 w-full rounded-xl border border-ink-600 bg-ink-850 px-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">CVC</label>
          <input
            value={card.cvc}
            onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            placeholder="123"
            inputMode="numeric"
            className={`h-12 w-full rounded-xl border bg-ink-850 px-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${errors?.cvc ? 'border-rose-500/60' : 'border-ink-600'}`}
          />
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
        Sandbox mode — use 4242 4242 4242 4242 to succeed, 4000 0000 0000 0002 to simulate a decline.
      </p>
    </div>
  );
}

export default function Checkout() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: booking, isLoading, isError, error } = useBooking(bookingId);
  const pay = usePayBooking();
  const applyPromo = useApplyPromo();

  const [card, setCard] = useState({ number: '', name: '', expMonth: '', expYear: '', cvc: '' });
  const [promoInput, setPromoInput] = useState('');
  const [errors, setErrors] = useState({});
  const [paid, setPaid] = useState(false);

  const remaining = useCountdown(booking?.holdExpiresAt);
  const expired = booking?.status === 'held' && remaining <= 0;

  useEffect(() => {
    if (booking && booking.status === 'held' && remaining <= 0 && !expired) {
      // trigger refetch via invalidation handled by polling
    }
  }, [remaining, booking, expired]);

  const event = booking?.event;

  const subtotal = useMemo(
    () => (booking ? booking.unitPrice * booking.quantity : 0),
    [booking],
  );

  const submitPayment = async () => {
    const errs = {};
    if (!card.number || card.number.replace(/\s/g, '').length < 13) errs.number = 'Enter a valid card number';
    if (!card.name.trim()) errs.name = 'Required';
    if (!card.cvc || card.cvc.length < 3) errs.cvc = '3–4 digits';
    const month = Number(card.expMonth);
    const year = Number(card.expYear);
    if (!month || month < 1 || month > 12 || !year || year < new Date().getFullYear()) {
      errs.exp = 'Invalid expiry';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      await pay.mutateAsync({
        bookingId,
        card: { number: card.number.replace(/\s/g, ''), name: card.name.trim(), expMonth: month, expYear: year, cvc: card.cvc },
      });
      setPaid(true);
      toast.success('Payment successful — booking confirmed!');
    } catch (err) {
      toast.error(extractError(err, 'Payment failed'));
      if (extractErrorCode(err) === 'HOLD_EXPIRED') {
        setTimeout(() => navigate(`/events/${booking?.event?.id}`), 1800);
      }
    }
  };

  const submitPromo = async () => {
    if (!promoInput.trim()) return;
    try {
      await applyPromo.mutateAsync({ bookingId, code: promoInput.trim().toUpperCase() });
      toast.success('Promo code applied');
      setPromoInput('');
    } catch (err) {
      toast.error(extractError(err, 'Invalid promo code'));
    }
  };

  if (isLoading) return <div className="min-h-[60vh]"><Spinner /></div>;
  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Booking not found</h1>
        <p className="mt-2 text-slate-500">{extractError(error)}</p>
        <Link to="/events" className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-bold text-white">Browse events</Link>
      </div>
    );
  }

  // Success state
  if (paid || booking.status === 'confirmed') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center animate-fade-up sm:py-24">
        <div className="mx-auto flex h-20 w-20 animate-pulse-ring items-center justify-center rounded-full bg-emerald-500/15">
          <svg className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-3xl font-extrabold text-white">You're going! 🎉</h1>
        <p className="mt-2 text-slate-400">Booking confirmed for <strong className="text-slate-200">{event?.title}</strong></p>

        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-ink-700 bg-ink-850 p-6 text-left">
          <div className="flex items-center justify-between border-b border-ink-700 pb-4">
            <span className="text-sm text-slate-500">Ticket code</span>
            <span className="font-mono text-lg font-bold tracking-wider text-brand-300">{booking.ticketCode}</span>
          </div>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Tier</dt><dd className="font-semibold text-slate-200">{booking.tierName} × {booking.quantity}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd className="text-slate-200">{fmtDateTime(event?.startsAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Venue</dt><dd className="text-slate-200">{event?.location?.venue}, {event?.location?.city}</dd></div>
            <div className="flex justify-between border-t border-ink-700 pt-2.5"><dt className="text-slate-500">Paid</dt><dd className="font-display text-lg font-bold text-white">{fmtMoney(booking.totalAmount)}</dd></div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => navigate('/bookings')} variant="primary" size="lg">View my bookings</Button>
          <Button onClick={() => navigate('/events')} variant="secondary" size="lg">Keep exploring</Button>
        </div>
      </div>
    );
  }

  // Expired / cancelled states
  if (booking.status !== 'held' || expired) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:py-24">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15">
          <svg className="h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-2xl font-extrabold text-white">Hold expired</h1>
        <p className="mt-2 text-slate-400">
          Your 10-minute seat hold has ended and the seats were released. You can try booking again while seats last.
        </p>
        <Button className="mt-8" size="lg" onClick={() => navigate(`/events/${event?.id}`)}>
          Back to event
        </Button>
      </div>
    );
  }

  const urgent = remaining < 2 * 60 * 1000;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">Checkout</h1>
          <p className="mt-1 text-sm text-slate-500">
            {event?.title} · {booking.tierName} × {booking.quantity}
          </p>
        </div>
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${urgent ? 'animate-pulse border-rose-500/50 bg-rose-500/10' : 'border-ink-600 bg-ink-850'}`}>
          <svg className={`h-5 w-5 ${urgent ? 'text-rose-400' : 'text-brand-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seats held for</p>
            <p className={`font-display text-2xl font-extrabold tabular-nums ${urgent ? 'text-rose-400' : 'text-white'}`}>
              {fmtCountdown(remaining)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        {/* Payment form */}
        <div className="rounded-2xl border border-ink-700 bg-ink-850 p-6 sm:p-8">
          <h2 className="mb-6 font-display text-lg font-bold text-white">Payment details</h2>
          <CardInput card={card} setCard={setCard} errors={errors} />
          {errors.exp && <p className="mt-2 text-xs font-medium text-rose-400">{errors.exp}</p>}
          <Button
            className="mt-8 w-full"
            size="lg"
            loading={pay.isPending}
            onClick={submitPayment}
          >
            Pay {fmtMoney(booking.totalAmount)}
          </Button>
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-6">
            <h2 className="mb-5 font-display text-lg font-bold text-white">Order summary</h2>
            <div className="flex gap-4">
              {event?.images?.[0] && (
                <img src={event.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{event?.title}</p>
                <p className="text-sm text-slate-500">{fmtDateTime(event?.startsAt)}</p>
              </div>
            </div>
            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{booking.tierName} × {booking.quantity}</dt>
                <dd className="text-slate-200">{fmtMoney(subtotal)}</dd>
              </div>
              {booking.discountAmount > 0 && (
                <>
                  <div className="flex justify-between text-emerald-400">
                    <dt>Promo {booking.promoCode}</dt>
                    <dd>−{fmtMoney(booking.discountAmount)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-ink-700 pt-3">
                <dt className="font-semibold text-slate-300">Total</dt>
                <dd className="font-display text-xl font-bold text-white">{fmtMoney(booking.totalAmount)}</dd>
              </div>
            </dl>

            {!booking.promoCode && (
              <div className="mt-5 border-t border-ink-700 pt-5">
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Promo code</label>
                <div className="flex gap-2">
                  <input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="WELCOME10"
                    className="h-11 flex-1 rounded-xl border border-ink-600 bg-ink-850 px-3.5 font-mono text-sm uppercase tracking-wider text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                  />
                  <Button variant="secondary" loading={applyPromo.isPending} onClick={submitPromo}>Apply</Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5 text-sm text-slate-500">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-300">
              <svg className="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              Your hold is protected
            </div>
            Seats can't be taken from you during checkout. If payment fails, you can retry until the timer runs out.
          </div>
        </div>
      </div>
    </div>
  );
}
