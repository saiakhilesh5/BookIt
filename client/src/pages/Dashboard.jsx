import { useState } from 'react';
import { useMyEvents, useCreateEvent, useUpdateEvent, useCancelEvent, useEventStats, usePromos, useCreatePromo } from '../api/hooks.js';
import { statusBadge } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Input, Textarea, Select } from '../components/ui/Input.jsx';
import { Skeleton, EmptyState, Spinner } from '../components/ui/Feedback.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { extractError } from '../api/client.js';
import { fmtDateTime, fmtMoney, fmtCompact, fmtDate } from '../utils/format.js';
import { EVENT_CATEGORIES } from '../constants.js';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const chartTheme = {
  grid: '#232338',
  tick: { fill: '#64748b', fontSize: 12 },
  tooltip: {
    contentStyle: { background: '#12121f', border: '1px solid #32324d', borderRadius: 12, fontSize: 13 },
    labelStyle: { color: '#94a3b8' },
  },
};

function StatCard({ label, value, sub, tone = 'brand' }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-1.5 font-display text-2xl font-extrabold ${tone === 'green' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-white'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ------------------------- Event form -------------------------

function TierEditor({ tiers, setTiers }) {
  const add = () => setTiers((t) => [...t, { name: '', price: '', capacity: '' }]);
  const update = (i, key, value) =>
    setTiers((t) => t.map((tier, idx) => (idx === i ? { ...tier, [key]: value } : tier)));
  const remove = (i) => setTiers((t) => t.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">Ticket tiers</label>
        <Button type="button" size="xs" variant="outline" onClick={add}>+ Add tier</Button>
      </div>
      <div className="space-y-2.5">
        {tiers.map((tier, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_100px_36px] gap-2.5">
            <input
              value={tier.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              placeholder={`Tier ${i + 1} name`}
              className="h-11 rounded-xl border border-ink-600 bg-ink-850 px-3.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <input
              value={tier.price}
              onChange={(e) => update(i, 'price', e.target.value)}
              type="number" min="0" step="0.01" placeholder="Price"
              className="h-11 rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <input
              value={tier.capacity}
              onChange={(e) => update(i, 'capacity', e.target.value)}
              type="number" min="1" placeholder="Seats"
              className="h-11 rounded-xl border border-ink-600 bg-ink-850 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={tiers.length <= 1}
              className="flex h-11 items-center justify-center rounded-xl border border-ink-600 text-slate-500 transition hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-30"
              aria-label="Remove tier"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventFormModal({ open, onClose, editing }) {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const toast = useToast();
  const [error, setError] = useState('');

  const blank = { title: '', description: '', category: 'Music', venue: '', city: '', startsAt: '', endsAt: '', images: '', tiers: [{ name: 'General Admission', price: '', capacity: '' }] };
  const [form, setForm] = useState(blank);

  // Hydrate when editing
  const [loadedId, setLoadedId] = useState(null);
  if (editing && (editing.id) !== loadedId) {
    setLoadedId(editing.id);
    setForm({
      title: editing.title,
      description: editing.description,
      category: editing.category,
      venue: editing.location.venue,
      city: editing.location.city,
      startsAt: new Date(editing.startsAt).toISOString().slice(0, 16),
      endsAt: new Date(editing.endsAt).toISOString().slice(0, 16),
      images: (editing.images ?? []).join(', '),
      tiers: editing.tiers.map((t) => ({ id: t.id, name: t.name, price: t.price, capacity: t.capacity })),
    });
  }
  if (!editing && loadedId) {
    setLoadedId(null);
    setForm(blank);
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (submitForReview) => {
    setError('');
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      venue: form.venue.trim(),
      city: form.city.trim(),
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      images: form.images.split(',').map((s) => s.trim()).filter(Boolean),
      tiers: form.tiers
        .filter((t) => t.name && t.price !== '' && t.capacity)
        .map((t) => ({ id: t.id, name: t.name.trim(), price: Number(t.price), capacity: Number(t.capacity) })),
      submit: submitForReview,
    };
    if (payload.tiers.length === 0) return setError('Add at least one complete tier');

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body: payload });
        toast.success(submitForReview ? 'Event updated and resubmitted' : 'Event saved');
      } else {
        await create.mutateAsync(payload);
        toast.success(submitForReview ? 'Event submitted for review' : 'Draft saved');
      }
      onClose(true);
    } catch (err) {
      const details = err?.response?.data?.error?.details;
      setError(details?.map((d) => d.message).join('. ') || extractError(err, 'Could not save event'));
    }
  };

  return (
    <Modal open={open} onClose={() => onClose(false)} title={editing ? 'Edit event' : 'Create event'} width="max-w-2xl">
      <div className="space-y-5">
        <Input label="Title" value={form.title} onChange={set('title')} placeholder="Neon Pulse: Electronic Night" />
        <Textarea label="Description" value={form.description} onChange={set('description')} placeholder="What makes this event special? (min 20 chars)" rows={4} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Category" value={form.category} onChange={set('category')}>
            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="City" value={form.city} onChange={set('city')} placeholder="New York" />
        </div>
        <Input label="Venue" value={form.venue} onChange={set('venue')} placeholder="Brooklyn Mirage" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Starts at" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
          <Input label="Ends at" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
        </div>
        <Input label="Image URL(s)" value={form.images} onChange={set('images')} placeholder="https://... (comma-separated, optional)" hint="Paste any image URL — Unsplash links work great." />
        <TierEditor tiers={form.tiers} setTiers={(fn) => setForm((f) => ({ ...f, tiers: fn(f.tiers) }))} />
        {error && <p className="rounded-lg bg-rose-500/10 px-3.5 py-2.5 text-sm font-medium text-rose-300">{error}</p>}
        <div className="flex flex-col-reverse gap-3 border-t border-ink-700 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" loading={create.isPending || update.isPending} onClick={() => submit(false)}>
            {editing ? 'Save changes' : 'Save as draft'}
          </Button>
          <Button loading={create.isPending || update.isPending} onClick={() => submit(true)}>
            {editing ? 'Update & resubmit' : 'Submit for review'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------- Event detail modal with charts -------------------------

function EventStatsModal({ event, onClose }) {
  const { data: stats, isLoading } = useEventStats(event?.id);
  const cancelEvent = useCancelEvent();
  const toast = useToast();

  return (
    <Modal open={Boolean(event)} onClose={onClose} title={event?.title} width="max-w-3xl">
      {isLoading || !stats ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Revenue" value={fmtMoney(stats.totals.revenue)} tone="green" />
            <StatCard label="Tickets sold" value={stats.totals.confirmed} sub={`${stats.totals.held} on hold`} />
            <StatCard label="Bookings" value={stats.totals.bookings} sub={`${stats.totals.refunded} refunded`} />
            <StatCard label="Capacity" value={fmtCompact(stats.event.capacity)} sub={`${Math.round((stats.totals.confirmed / stats.event.capacity) * 100)}% sold`} />
          </div>

          {stats.byDay.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-bold text-slate-300">Sales over time</h4>
              <div className="h-52 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.byDay.map((d) => ({ date: d._id.slice(5), revenue: d.revenue, tickets: d.tickets }))}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                    <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} width={50} />
                    <Tooltip {...chartTheme.tooltip} />
                    <Area type="monotone" dataKey="revenue" stroke="#a78bfa" strokeWidth={2} fill="url(#rev)" name="Revenue ($)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-3 text-sm font-bold text-slate-300">Tier breakdown</h4>
            <div className="h-48 rounded-xl border border-ink-700 bg-ink-900/50 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.tiers}>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                  <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} width={40} />
                  <Tooltip {...chartTheme.tooltip} />
                  <Bar dataKey="sold" stackId="a" fill="#8b5cf6" name="Sold" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="held" stackId="a" fill="#f59e0b" name="Held" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="available" stackId="a" fill="#32324d" name="Available" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {stats.event.status !== 'cancelled' && (
            <div className="flex justify-end border-t border-ink-700 pt-4">
              <Button
                variant="danger"
                size="sm"
                loading={cancelEvent.isPending}
                onClick={async () => {
                  if (!window.confirm('Cancel this event? All holds are released and confirmed bookings are refunded.')) return;
                  try {
                    await cancelEvent.mutateAsync(event.id);
                    toast.info('Event cancelled — customers notified');
                    onClose();
                  } catch (err) {
                    toast.error(extractError(err));
                  }
                }}
              >
                Cancel event & refund all
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ------------------------- Promo creation -------------------------

function PromoModal({ open, onClose }) {
  const create = useCreatePromo();
  const { data: promos } = usePromos();
  const toast = useToast();
  const [form, setForm] = useState({ code: '', type: 'percent', value: '', maxUses: '', expiresAt: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await create.mutateAsync({
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        expiresAt: form.expiresAt || null,
        event: null,
      });
      toast.success(`Promo ${form.code.toUpperCase()} created`);
      setForm({ code: '', type: 'percent', value: '', maxUses: '', expiresAt: '' });
    } catch (err) {
      const details = err?.response?.data?.error?.details;
      setError(details?.map((d) => d.message).join('. ') || extractError(err, 'Could not create promo'));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Promo codes">
      <form onSubmit={submit} className="space-y-5">
        <Input label="Code" value={form.code} onChange={set('code')} placeholder="SUMMER25" className="font-mono uppercase" />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Type" value={form.type} onChange={set('type')}>
            <option value="percent">Percent off</option>
            <option value="flat">Flat amount off</option>
          </Select>
          <Input label={form.type === 'percent' ? 'Percent (1-100)' : 'Amount ($)'} type="number" min="0" step="0.01" value={form.value} onChange={set('value')} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Max uses (blank = unlimited)" type="number" min="1" value={form.maxUses} onChange={set('maxUses')} />
          <Input label="Expires (optional)" type="date" value={form.expiresAt} onChange={set('expiresAt')} />
        </div>
        {error && <p className="rounded-lg bg-rose-500/10 px-3.5 py-2.5 text-sm font-medium text-rose-300">{error}</p>}
        <Button type="submit" className="w-full" loading={create.isPending}>Create promo</Button>
      </form>

      <div className="mt-6 border-t border-ink-700 pt-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Your codes</p>
        {!promos || promos.length === 0 ? (
          <p className="text-sm text-slate-500">No promo codes yet.</p>
        ) : (
          <ul className="space-y-2">
            {promos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono font-bold text-white">
                    {p.code}
                    {!p.isActive && <span className="ml-2 text-xs font-semibold text-rose-400">inactive</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.type === 'percent' ? `${p.value}% off` : `${fmtMoney(p.value)} off`}
                    {p.maxUses ? ` · ${p.usedCount ?? 0}/${p.maxUses} used` : ` · ${p.usedCount ?? 0} used`}
                    {p.expiresAt ? ` · expires ${fmtDate(p.expiresAt)}` : ''}
                  </p>
                </div>
                {p.event?.title && <span className="shrink-0 truncate text-xs text-slate-500">{p.event.title}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ------------------------- Main dashboard -------------------------

export default function Dashboard() {
  const { data: events, isLoading } = useMyEvents();
  const { data: promos } = usePromos();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statsFor, setStatsFor] = useState(null);
  const [showPromo, setShowPromo] = useState(false);

  const totals = (events ?? []).reduce(
    (acc, e) => ({
      revenue: acc.revenue + (e.stats?.revenue ?? 0),
      tickets: acc.tickets + (e.stats?.ticketsSold ?? 0),
      capacity: acc.capacity + (e.stats?.totalCapacity ?? 0),
    }),
    { revenue: 0, tickets: 0, capacity: 0 },
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white">Organizer dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Create events, track sales, manage promo codes.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setShowPromo(true)}>Promo codes</Button>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>+ Create event</Button>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total revenue" value={fmtMoney(totals.revenue)} tone="green" />
        <StatCard label="Tickets sold" value={fmtCompact(totals.tickets)} sub={`${Math.round((totals.tickets / Math.max(1, totals.capacity)) * 100)}% of capacity`} />
        <StatCard label="Events" value={events?.length ?? 0} sub={`${events?.filter((e) => e.status === 'published').length ?? 0} live`} />
        <StatCard label="Active promos" value={promos?.filter((p) => p.isActive).length ?? 0} />
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !events || events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event — it goes live after a quick review."
          action={<Button onClick={() => setShowForm(true)}>Create your first event</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5 font-bold">Event</th>
                <th className="px-5 py-3.5 font-bold">When</th>
                <th className="px-5 py-3.5 font-bold">Status</th>
                <th className="px-5 py-3.5 text-right font-bold">Sold</th>
                <th className="px-5 py-3.5 text-right font-bold">Revenue</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70 bg-ink-850/40">
              {events.map((e) => (
                <tr key={e.id} className="transition hover:bg-ink-800/40">
                  <td className="max-w-xs px-5 py-4">
                    <div className="flex items-center gap-3">
                      {e.images?.[0] && <img src={e.images[0]} alt="" className="h-11 w-11 rounded-lg object-cover" />}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{e.title}</p>
                        <p className="text-xs text-slate-500">{e.location.city} · {e.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-400">{fmtDateTime(e.startsAt)}</td>
                  <td className="px-5 py-4">{statusBadge(e.status)}</td>
                  <td className="px-5 py-4 text-right text-slate-300">
                    {e.stats?.ticketsSold ?? 0}/{e.stats?.totalCapacity ?? 0}
                    {e.stats?.activeHolds > 0 && <span className="ml-1 text-xs text-amber-400">(+{e.stats.activeHolds} held)</span>}
                  </td>
                  <td className="px-5 py-4 text-right font-display font-bold text-emerald-400">{fmtMoney(e.stats?.revenue ?? 0)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Button size="xs" variant="ghost" onClick={() => setStatsFor(e)}>Stats</Button>
                      <Button size="xs" variant="secondary" onClick={() => { setEditing(e); setShowForm(true); }}>Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <EventFormModal
          open={showForm}
          editing={editing}
          onClose={(saved) => {
            setShowForm(false);
            setEditing(null);
            if (saved) { /* react-query invalidation refreshes the table */ }
          }}
        />
      )}
      {statsFor && <EventStatsModal event={statsFor} onClose={() => setStatsFor(null)} />}
      {showPromo && <PromoModal open={showPromo} onClose={() => setShowPromo(false)} />}
    </div>
  );
}
