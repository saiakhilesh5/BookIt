import { Link } from 'react-router-dom';
import Badge from './ui/Badge.jsx';
import { fmtDateTime, fmtMoney } from '../utils/format.js';

export default function EventCard({ event }) {
  const id = event.id;
  const cheapest = event.tiers?.length ? Math.min(...event.tiers.map((t) => t.price)) : 0;
  const totalAvailable = event.tiers?.reduce((s, t) => s + t.available, 0) ?? 0;
  const soldOut = totalAvailable === 0;
  const image = event.images?.[0];

  return (
    <Link
      to={`/events/${id}`}
      className="group block overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 card-hover"
    >
      <div className="relative h-48 overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={event.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-ink-800 to-ink-700 text-slate-600">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-transparent to-ink-950/20" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge tone="brand">{event.category}</Badge>
          {soldOut && <Badge tone="rose">Sold out</Badge>}
          {!soldOut && totalAvailable <= 20 && <Badge tone="amber">Only {totalAvailable} left</Badge>}
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-sm font-semibold text-slate-200">
            {event.location?.city}
          </p>
        </div>
      </div>

      <div className="p-5">
        <h3 className="font-display text-lg font-bold leading-snug text-white transition-colors group-hover:text-brand-300">
          {event.title}
        </h3>
        <p className="mt-1.5 text-sm text-slate-500">{fmtDateTime(event.startsAt)}</p>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">From</p>
            <p className="font-display text-lg font-bold text-white">{fmtMoney(cheapest)}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/40 px-3.5 py-2 text-sm font-bold text-brand-300 transition group-hover:bg-brand-500/10">
            {soldOut ? 'Join waitlist' : 'Book now'}
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
