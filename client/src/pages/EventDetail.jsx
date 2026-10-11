import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEvent, useCreateBooking, useJoinWaitlist, useMyWaitlist, useLeaveWaitlist as useLeaveWaitlistHook } from '../api/hooks.js';
import { useAuth } from '../store/auth.js';
import { useToast } from '../components/ui/Toast.jsx';
import Badge, { statusBadge } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Spinner, ErrorState } from '../components/ui/Feedback.jsx';
import { subscribeToEvent } from '../api/socket.js';
import { extractError, extractErrorCode } from '../api/client.js';
import { fmtDateTime, fmtMoney, daysUntil } from '../utils/format.js';

function TierRow({ tier, selected, onSelect, liveTiers }) {
  const live = liveTiers?.find((t) => t.id === (tier.id)) ?? tier;
  const available = live.available ?? 0;
  const capacity = live.capacity ?? tier.capacity;
  const soldPct = capacity ? Math.round(((capacity - available) / capacity) * 100) : 0;
  const id = tier.id;
  const soldOut = available === 0;

  return (
    <button
      onClick={() => !soldOut && onSelect?.(id, available)}
      disabled={soldOut}
      className={`w-full rounded-xl border p-4 text-left transition-all ${
        selected === id
          ? 'border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/40'
          : soldOut
            ? 'cursor-not-allowed border-ink-700 opacity-50'
            : 'border-ink-600 bg-ink-850 hover:border-brand-500/50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{tier.name}</p>
          <p className="mt-0.5 text-sm text-slate-400">
            {soldOut ? (
              <span className="text-rose-400">Sold out</span>
            ) : available <= 20 ? (
              <span className="font-semibold text-amber-400">{available} left</span>
            ) : (
              `${available} available`
            )}
            {tier.waitlistCount > 0 && <span className="ml-2 text-slate-500">· {tier.waitlistCount} in queue</span>}
          </p>
        </div>
        <p className="font-display text-lg font-bold text-white">{fmtMoney(tier.price)}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${soldPct > 85 ? 'bg-rose-500' : soldPct > 60 ? 'bg-amber-500' : 'bg-brand-500'}`}
          style={{ width: `${soldPct}%` }}
        />
      </div>
    </button>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const createBooking = useCreateBooking();
  const joinWaitlist = useJoinWaitlist();
  const { data: myWaitlist } = useMyWaitlist();
  const [liveTiers, setLiveTiers] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [bookingModal, setBookingModal] = useState(false);
  const [waitlistQty, setWaitlistQty] = useState(1);

  // Live availability over WebSocket
  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToEvent(id, {
      onAvailability: (payload) => {
        if (payload.eventId === id) setLiveTiers(payload.tiers);
      },
    });
    return unsubscribe;
  }, [id]);

  const tiers = event?.tiers ?? [];
  const selectedTierObj = tiers.find((t) => (t.id) === selectedTier);
  const selectedAvailable = liveTiers?.find((t) => t.id === selectedTier)?.available ?? selectedTierObj?.available ?? 0;
  const totalAvailable = (liveTiers ?? tiers).reduce((s, t) => s + (t.available ?? 0), 0);

  const myWaitlistEntry = useMemo(
    () => myWaitlist?.find((w) => (w.event?.id) === id),
    [myWaitlist, id],
  );

  if (isLoading) return <div className="min-h-[60vh]"><Spinner /></div>;
  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState message={extractError(error, 'Event not found')} onRetry={refetch} />
      </div>
    );
  }

  const startBooking = () => {
    if (!user) {
      toast.info('Sign in to book this event');
      navigate(`/login?next=/events/${id}`);
      return;
    }
    setBookingModal(true);
  };

  const submitBooking = async () => {
    try {
      const booking = await createBooking.mutateAsync({
        eventId: id,
        tierId: selectedTier,
        quantity,
      });
      toast.success('Seats held for 10 minutes — complete your payment');
      navigate(`/checkout/${booking.id}`);
    } catch (err) {
      if (extractErrorCode(err) === 'SEATS_UNAVAILABLE') {
        toast.error(extractError(err));
        refetch();
        setBookingModal(false);
      } else {
        toast.error(extractError(err, 'Could not create booking'));
      }
    }
  };

  const submitWaitlist = async (tierId, qty) => {
    if (!user) {
      toast.info('Sign in to join the waitlist');
      navigate(`/login?next=/events/${id}`);
      return;
    }
    try {
      const res = await joinWaitlist.mutateAsync({ eventId: id, tierId, quantity: qty });
      toast.success(`You're #${res.position} in line — we'll notify you the moment seats open`);
    } catch (err) {
      toast.error(extractError(err, 'Could not join waitlist'));
    }
  };

  const leaveWaitlist = async (tierId) => {
    try {
      await useLeaveWaitlistHook(tierId);
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const image = event.images?.[0];
  const dLeft = daysUntil(event.startsAt);

  return (
    <div>
      {/* Hero */}
      <div className="relative h-[340px] overflow-hidden sm:h-[420px]">
        {image ? (
          <img src={image} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-ink-800 to-ink-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/30" />
        <div className="absolute bottom-0 left-0 right-0">
          <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="brand">{event.category}</Badge>
              {statusBadge(event.status)}
              {event.isOwner && <Badge tone="accent">Your event</Badge>}
              {dLeft <= 7 && dLeft > 0 && <Badge tone="amber">In {dLeft} day{dLeft > 1 ? 's' : ''}</Badge>}
            </div>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
              {event.title}
            </h1>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                {fmtDateTime(event.startsAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                {event.location.venue}, {event.location.city}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {event.views} views
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_400px]">
        {/* Left: description */}
        <div>
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-xs font-bold text-white">
              {event.organizer?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('')}
            </div>
            <span>Organized by <strong className="text-slate-300">{event.organizer?.name}</strong></span>
          </div>
          <h2 className="font-display text-xl font-bold text-white">About this event</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-400">{event.description}</p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">When</h3>
              <p className="mt-2 font-semibold text-white">{fmtDateTime(event.startsAt)}</p>
              <p className="text-sm text-slate-500">until {fmtDateTime(event.endsAt)}</p>
            </div>
            <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Where</h3>
              <p className="mt-2 font-semibold text-white">{event.location.venue}</p>
              <p className="text-sm text-slate-500">{event.location.city}</p>
            </div>
          </div>
        </div>

        {/* Right: booking panel */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Select tickets</h3>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            </div>

            <div className="space-y-3">
              {tiers.map((t) => (
                <TierRow key={t.id} tier={t} selected={selectedTier} onSelect={setSelectedTier} liveTiers={liveTiers} />
              ))}
            </div>

            {totalAvailable === 0 && (
              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold text-amber-300">All tiers sold out</p>
                <p className="mt-1 text-sm text-slate-400">Join a waitlist and get promoted automatically when seats free up.</p>
              </div>
            )}

            {selectedTier && (
              <div className="mt-5 animate-fade-up">
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Quantity <span className="text-slate-500">(max {Math.min(10, selectedAvailable)})</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-600 text-lg font-bold text-slate-300 transition hover:border-brand-500/60 hover:text-white"
                  >
                    −
                  </button>
                  <span className="w-10 text-center font-display text-lg font-bold text-white">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(10, selectedAvailable, q + 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-600 text-lg font-bold text-slate-300 transition hover:border-brand-500/60 hover:text-white"
                  >
                    +
                  </button>
                  <p className="ml-auto font-display text-lg font-bold text-white">
                    {fmtMoney((selectedTierObj?.price ?? 0) * quantity)}
                  </p>
                </div>
              </div>
            )}

            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={!selectedTier || (selectedAvailable === 0)}
              onClick={startBooking}
            >
              {selectedTier && selectedAvailable === 0 ? 'Sold out' : 'Continue to checkout'}
            </Button>

            {selectedTier && selectedAvailable === 0 && (
              <Button
                variant="outline"
                className="mt-3 w-full"
                loading={joinWaitlist.isPending}
                onClick={() => submitWaitlist(selectedTier, 1)}
              >
                Join waitlist for {selectedTierObj?.name}
              </Button>
            )}

            {myWaitlistEntry && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                <div className="text-sm">
                  <p className="font-semibold text-amber-300">You're on the waitlist</p>
                  <p className="text-slate-400">{myWaitlistEntry.quantity} × {myWaitlistEntry.event?.tiers?.find?.((t) => (t.id) === myWaitlistEntry.tierId)?.name ?? 'tickets'}</p>
                </div>
                <Link to="/waitlist" className="text-sm font-bold text-brand-300 hover:text-brand-200">Manage</Link>
              </div>
            )}

            <p className="mt-4 text-center text-xs text-slate-500">
              Seats are held for 10 minutes at checkout. Zero double-booking, guaranteed.
            </p>
          </div>
        </div>
      </div>

      {/* Booking confirmation modal */}
      <Modal open={bookingModal} onClose={() => setBookingModal(false)} title="Confirm your selection">
        <div className="space-y-5">
          <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-4">
            <p className="font-semibold text-white">{event.title}</p>
            <p className="mt-1 text-sm text-slate-400">
              {selectedTierObj?.name} × {quantity} · {fmtDateTime(event.startsAt)}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-3">
              <span className="text-sm text-slate-400">Total</span>
              <span className="font-display text-xl font-bold text-white">
                {fmtMoney((selectedTierObj?.price ?? 0) * quantity)}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Clicking confirm places a <strong className="text-slate-300">10-minute hold</strong> on your seats and takes you to payment.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setBookingModal(false)}>Cancel</Button>
            <Button className="flex-1" loading={createBooking.isPending} onClick={submitBooking}>Hold my seats</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
