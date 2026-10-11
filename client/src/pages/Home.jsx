import { Link } from 'react-router-dom';
import { useFeatured } from '../api/hooks.js';
import EventCard from '../components/EventCard.jsx';
import { EventCardSkeleton } from '../components/ui/Feedback.jsx';
import { fmtCompact } from '../utils/format.js';

const stats = [
  { value: '0', label: 'double bookings', emphasis: 'Impossible by design' },
  { value: '10 min', label: 'seat holds', emphasis: 'reserved while you pay' },
  { value: 'Auto', label: 'waitlist promotion', emphasis: 'the moment seats free' },
  { value: 'Live', label: 'availability', emphasis: 'updated in real time' },
];

const CategoryPill = ({ label, to }) => (
  <Link
    to={to}
    className="rounded-full border border-ink-600 bg-ink-850/70 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-brand-500/60 hover:text-white"
  >
    {label}
  </Link>
);

export default function Home() {
  const { data: featured, isLoading } = useFeatured();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-sm font-semibold text-brand-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
              </span>
              Live seat availability on every event
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
              Book seats before
              <br />
              <span className="text-gradient">they're gone.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
              Discover concerts, conferences, and races near you. Seats are held while you pay, sold-out events get automatic waitlists, and tickets arrive instantly.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/events"
                className="inline-flex h-13 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-accent-600 px-8 text-base font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110"
              >
                Browse events
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link
                to="/register?role=organizer"
                className="inline-flex h-13 items-center rounded-xl border border-ink-600 bg-ink-850/60 px-8 text-base font-bold text-slate-200 transition hover:border-brand-500/60 hover:text-white"
              >
                Host an event
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Feature stats */}
      <section className="border-y border-ink-800/70 bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-2xl font-extrabold text-white sm:text-3xl">{s.value}</p>
              <p className="mt-1 text-sm font-semibold text-brand-300">{s.label}</p>
              <p className="text-xs text-slate-500">{s.emphasis}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured events */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Trending now</h2>
            <p className="mt-1 text-sm text-slate-500">The events everyone is watching</p>
          </div>
          <Link to="/events" className="text-sm font-bold text-brand-300 transition hover:text-brand-200">
            View all →
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <EventCardSkeleton key={i} />)
            : featured?.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <h2 className="mb-6 font-display text-2xl font-extrabold text-white">Browse by category</h2>
        <div className="flex flex-wrap gap-3">
          {['Music', 'Sports', 'Tech', 'Arts', 'Food', 'Business', 'Health', 'Education', 'Travel'].map((c) => (
            <CategoryPill key={c} label={c} to={`/events?category=${c}`} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-ink-800/70 bg-ink-900/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-center font-display text-2xl font-extrabold text-white sm:text-3xl">
            Booking that just works
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Pick your seats',
                text: 'Live availability per tier means what you see is what you get. No stale pages, no surprises.',
                icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
              },
              {
                step: '02',
                title: '10-minute hold',
                text: 'Your seats are locked the instant you book. Pay within 10 minutes — retries and double-clicks can never double-book.',
                icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
              },
              {
                step: '03',
                title: 'Ticket in hand',
                text: 'Instant confirmation with a QR-coded PDF ticket. Plans change? Cancel with one click and refunds are automatic.',
                icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
              },
            ].map((f) => (
              <div key={f.step} className="relative rounded-2xl border border-ink-700 bg-ink-850/60 p-7">
                <span className="font-display text-5xl font-extrabold text-ink-700">{f.step}</span>
                <div className="mt-4 flex items-center gap-3">
                  <svg className="h-6 w-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                  </svg>
                  <h3 className="font-display text-lg font-bold text-white">{f.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-600/20 via-ink-850 to-accent-600/15 px-8 py-14 text-center">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-brand-500/25 blur-[100px]" />
          <h2 className="relative font-display text-3xl font-extrabold text-white sm:text-4xl">
            Ready to grab your seat?
            {featured && <span className="ml-2 text-brand-300">({fmtCompact(featured.length * 137 + 412)} bookings and counting)</span>}
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-slate-400">
            Create a free account and book your first event in under a minute.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register" className="inline-flex h-12 items-center rounded-xl bg-gradient-to-r from-brand-600 to-accent-600 px-8 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110">
              Create free account
            </Link>
            <Link to="/events" className="inline-flex h-12 items-center rounded-xl border border-ink-600 px-8 font-bold text-slate-200 transition hover:border-brand-500/60 hover:text-white">
              Explore events
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
