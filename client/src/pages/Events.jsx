import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useEvents, useEventMeta } from '../api/hooks.js';
import EventCard from '../components/EventCard.jsx';
import { EventCardSkeleton, EmptyState } from '../components/ui/Feedback.jsx';
import { Select } from '../components/ui/Input.jsx';
import { fmtCompact } from '../utils/format.js';

const SORTS = [
  ['date_asc', 'Date: soonest'],
  ['date_desc', 'Date: latest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['newest', 'Just added'],
  ['popular', 'Most popular'],
];

function FilterBar({ meta }) {
  const [params, setParams] = useSearchParams();
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          value={params.get('q') ?? ''}
          onChange={(e) => set('q', e.target.value || undefined)}
          placeholder="Search events, cities, venues..."
          className="h-13 w-full rounded-xl border border-ink-600 bg-ink-850 pl-12 pr-4 text-slate-100 placeholder:text-slate-500 transition focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={params.get('category') ?? ''} onChange={(e) => set('category', e.target.value || undefined)} className="h-11 w-auto min-w-40">
          <option value="">All categories</option>
          {(meta?.categories ?? ['Music', 'Sports', 'Tech', 'Business', 'Arts', 'Food', 'Health', 'Education', 'Travel', 'Other']).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Select value={params.get('city') ?? ''} onChange={(e) => set('city', e.target.value || undefined)} className="h-11 w-auto min-w-40">
          <option value="">All cities</option>
          {(meta?.cities ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        <Select value={params.get('sort') ?? 'date_asc'} onChange={(e) => set('sort', e.target.value)} className="h-11 w-auto min-w-44">
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        {(params.get('q') || params.get('category') || params.get('city')) && (
          <button
            onClick={() => setParams({ sort: params.get('sort') ?? 'date_asc' })}
            className="h-11 rounded-xl border border-ink-600 px-4 text-sm font-semibold text-slate-400 transition hover:border-rose-500/50 hover:text-rose-300"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

export default function Events() {
  const [params] = useSearchParams();
  const { data: meta } = useEventMeta();
  const [visiblePages, setVisiblePages] = useState(1);

  const query = useMemo(() => {
    const obj = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
  }, [params]);

  useEffect(() => setVisiblePages(1), [params]);

  const limit = 12 * visiblePages;
  const { data, isLoading, isError, refetch } = useEvents({ ...query, limit });

  const events = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">Explore events</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {meta ? `${fmtCompact(meta.totalUpcoming)}+ upcoming events` : 'Loading...'}
            {data ? ` · ${total} matching your filters` : ''}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <FilterBar meta={meta} />
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <EventCardSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <EmptyState title="Could not load events" description="Check your connection and try again." action={<button onClick={() => refetch()} className="rounded-xl bg-brand-600 px-5 py-2.5 font-bold text-white">Retry</button>} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>}
          title="No events found"
          description="Try widening your filters or searching for something else."
        />
      ) : (
        <>
          <div className="grid animate-fade-up gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
          {events.length < total && (
            <div className="mt-10 flex justify-center">
              <button
                onClick={() => setVisiblePages((p) => p + 1)}
                className="rounded-xl border border-ink-600 bg-ink-850 px-8 py-3 font-bold text-slate-200 transition hover:border-brand-500/60 hover:text-white"
              >
                Load more ({events.length}/{total})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
