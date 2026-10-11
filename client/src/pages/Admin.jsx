import { useState } from 'react';
import {
  useAdminStats, usePendingEvents, useAdminUsers, useAuditLogs, useMailOutbox,
  useApproveEvent, useRejectEvent, useChangeUserRole, useToggleUserActive,
} from '../api/hooks.js';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Skeleton, EmptyState, Spinner } from '../components/ui/Feedback.jsx';
import { Textarea } from '../components/ui/Input.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { extractError } from '../api/client.js';
import { fmtDateTime, fmtMoney, fmtCompact } from '../utils/format.js';
import { clsx } from 'clsx';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';

const PIE_COLORS = ['#8b5cf6', '#d946ef', '#f59e0b', '#34d399', '#38bdf8', '#f87171'];

const chartTheme = {
  grid: '#232338',
  tick: { fill: '#64748b', fontSize: 12 },
  tooltip: {
    contentStyle: { background: '#12121f', border: '1px solid #32324d', borderRadius: 12, fontSize: 13 },
    labelStyle: { color: '#94a3b8' },
  },
};

function StatCard({ label, value, sub, tone = 'white' }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={clsx('mt-1.5 font-display text-2xl font-extrabold',
        tone === 'green' && 'text-emerald-400', tone === 'amber' && 'text-amber-400', tone === 'brand' && 'text-brand-300', tone === 'white' && 'text-white')}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function OverviewTab() {
  const { data: stats, isLoading } = useAdminStats();
  if (isLoading || !stats) return <Spinner />;

  const bookingDist = [
    { name: 'Confirmed', value: stats.bookings.confirmed },
    { name: 'Held', value: stats.bookings.held },
    { name: 'Cancelled', value: stats.bookings.cancelled },
    { name: 'Refunded', value: stats.bookings.refunded },
    { name: 'Expired', value: stats.bookings.expired },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total revenue" value={fmtMoney(stats.revenue.total)} sub={`${fmtCompact(stats.revenue.tickets)} tickets`} tone="green" />
        <StatCard label="Users" value={fmtCompact(stats.users.total)} sub={`${stats.users.organizer ?? 0} organizers · ${stats.users.admin ?? 0} admins`} tone="brand" />
        <StatCard label="Events" value={stats.events.total} sub={`${stats.events.published} live · ${stats.events.pending} pending`} tone="amber" />
        <StatCard label="Bookings" value={fmtCompact(stats.bookings.total)} sub={`${stats.bookings.confirmed} confirmed`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5 lg:col-span-3">
          <h3 className="mb-4 font-display font-bold text-white">Revenue — last 30 days</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.revenue.byDay.map((d) => ({ date: d._id.slice(5), revenue: d.revenue }))}>
                <defs>
                  <linearGradient id="adminrev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d946ef" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#d946ef" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={chartTheme.tick} axisLine={false} tickLine={false} />
                <YAxis tick={chartTheme.tick} axisLine={false} tickLine={false} width={50} />
                <Tooltip {...chartTheme.tooltip} />
                <Area type="monotone" dataKey="revenue" stroke="#e879f9" strokeWidth={2} fill="url(#adminrev)" name="Revenue ($)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5 lg:col-span-2">
          <h3 className="mb-4 font-display font-bold text-white">Booking status</h3>
          {bookingDist.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bookingDist} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {bookingDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Tooltip {...chartTheme.tooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="flex h-56 items-center justify-center text-sm text-slate-500">No bookings yet</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
          <h3 className="mb-4 font-display font-bold text-white">Top events by revenue</h3>
          {stats.topEvents.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No sales yet</p>
          ) : (
            <ul className="space-y-3">
              {stats.topEvents.map((e, i) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg text-xs font-extrabold',
                    i === 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-ink-700 text-slate-400')}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-200">{e.title}</p>
                    <p className="text-xs text-slate-500">{e.tickets} tickets</p>
                  </div>
                  <span className="font-display text-sm font-bold text-emerald-400">{fmtMoney(e.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-850 p-5">
          <h3 className="mb-4 font-display font-bold text-white">Newest users</h3>
          <ul className="space-y-3">
            {stats.users.recent.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-xs font-bold text-white">
                    {u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">{u.name}</p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
                <span className="text-xs font-bold uppercase text-brand-300">{u.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ApprovalsTab() {
  const { data: pending, isLoading } = usePendingEvents();
  const approve = useApproveEvent();
  const reject = useRejectEvent();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  if (isLoading) return <Spinner />;
  if (!pending?.length) {
    return <EmptyState title="Nothing to review" description="New event submissions from organizers will appear here." />;
  }

  return (
    <div className="space-y-4">
      {pending.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-700 bg-ink-850 p-5">
          {e.images?.[0] && <img src={e.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-white">{e.title}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {e.category} · {e.location.city} · {fmtDateTime(e.startsAt)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              by {e.organizer?.name} · {e.tiers?.length} tiers · capacity {e.tiers?.reduce((s, t) => s + t.capacity, 0)}
            </p>
          </div>
          <div className="flex gap-2.5">
            <Button size="sm" variant="success" loading={approve.isPending}
              onClick={async () => {
                try { await approve.mutateAsync(e.id); toast.success('Event approved and published'); }
                catch (err) { toast.error(extractError(err)); }
              }}>
              Approve
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRejecting(e)}>Reject</Button>
          </div>
        </div>
      ))}

      <Modal open={Boolean(rejecting)} onClose={() => setRejecting(null)} title="Reject event">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">The organizer will see this reason and can edit and resubmit.</p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (min 3 chars)" rows={3} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="danger" disabled={reason.trim().length < 3} loading={reject.isPending}
              onClick={async () => {
                try {
                  await reject.mutateAsync({ id: rejecting.id, reason: reason.trim() });
                  toast.info('Event rejected — organizer notified');
                  setRejecting(null);
                  setReason('');
                } catch (err) { toast.error(extractError(err)); }
              }}>
              Reject event
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function UsersTab() {
  const [params, setParams] = useState({ page: 1, limit: 20 });
  const [q, setQ] = useState('');
  const { data, isLoading } = useAdminUsers(params);
  const changeRole = useChangeUserRole();
  const toggleActive = useToggleUserActive();
  const toast = useToast();

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setParams((p) => ({ ...p, q: q || undefined, page: 1 }))}
          placeholder="Search name or email..."
          className="h-11 flex-1 min-w-56 rounded-xl border border-ink-600 bg-ink-850 px-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
        <select
          value={params.role ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, role: e.target.value || undefined, page: 1 }))}
          className="h-11 rounded-xl border border-ink-600 bg-ink-850 px-3.5 text-sm text-slate-200"
        >
          <option value="">All roles</option>
          <option value="user">Users</option>
          <option value="organizer">Organizers</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5 font-bold">User</th>
                <th className="px-5 py-3.5 font-bold">Role</th>
                <th className="px-5 py-3.5 font-bold">Joined</th>
                <th className="px-5 py-3.5 font-bold">Status</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70 bg-ink-850/40">
              {(data?.data ?? []).map((u) => (
                <tr key={u.id} className="hover:bg-ink-800/40">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-xs font-bold text-white">
                        {u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        try { await changeRole.mutateAsync({ id: u.id, role: e.target.value }); toast.success(`${u.name} is now ${e.target.value}`); }
                        catch (err) { toast.error(extractError(err)); }
                      }}
                      className="rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-xs font-semibold text-slate-200"
                    >
                      <option value="user">user</option>
                      <option value="organizer">organizer</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{fmtDateTime(u.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <span className={clsx('text-xs font-bold', u.isActive ? 'text-emerald-400' : 'text-rose-400')}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button size="xs" variant={u.isActive ? 'ghost' : 'success'}
                      onClick={async () => {
                        try { await toggleActive.mutateAsync({ id: u.id, isActive: !u.isActive }); toast.success(u.isActive ? 'Account disabled' : 'Account re-enabled'); }
                        catch (err) { toast.error(extractError(err)); }
                      }}>
                      {u.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.meta && data.meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" disabled={params.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}>Prev</Button>
          <span className="text-sm text-slate-500">Page {data.meta.page} of {data.meta.pages}</span>
          <Button size="sm" variant="secondary" disabled={params.page >= data.meta.pages} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}>Next</Button>
        </div>
      )}
    </div>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLogs({ page, limit: 20 });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800/80 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3.5 font-bold">When</th>
              <th className="px-5 py-3.5 font-bold">Actor</th>
              <th className="px-5 py-3.5 font-bold">Action</th>
              <th className="px-5 py-3.5 font-bold">Entity</th>
              <th className="px-5 py-3.5 font-bold">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700/70 bg-ink-850/40">
            {(data?.data ?? []).map((log) => (
              <tr key={log.id} className="hover:bg-ink-800/40">
                <td className="whitespace-nowrap px-5 py-3 text-slate-500">{fmtDateTime(log.createdAt)}</td>
                <td className="px-5 py-3 text-slate-300">{log.actorLabel}</td>
                <td className="px-5 py-3">
                  <span className="rounded-md bg-brand-500/10 px-2 py-1 font-mono text-xs font-bold text-brand-300">{log.action}</span>
                </td>
                <td className="px-5 py-3 text-slate-500">{log.entityType}</td>
                <td className="max-w-xs truncate px-5 py-3 text-xs text-slate-500">{log.meta ? JSON.stringify(log.meta) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.meta && data.meta.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-slate-500">Page {data.meta.page} of {data.meta.pages}</span>
          <Button size="sm" variant="secondary" disabled={page >= data.meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function MailTab() {
  const { data, isLoading } = useMailOutbox();
  if (isLoading) return <Spinner />;
  if (!data?.data?.length) return <EmptyState title="No emails yet" description="System emails (confirmations, waitlist promotions, refunds) appear here." />;

  return (
    <div className="space-y-3">
      {data.data.map((m) => (
        <details key={m.id} className="group rounded-xl border border-ink-700 bg-ink-850 p-4">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 list-none">
            <span className={clsx('rounded-md px-2 py-0.5 text-xs font-bold',
              m.status === 'sent' ? 'bg-emerald-500/15 text-emerald-300' : m.status === 'failed' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300')}>
              {m.status}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">{m.subject}</span>
            <span className="text-xs text-slate-500">{m.toEmail}</span>
            <span className="text-xs text-slate-600">{fmtDateTime(m.createdAt)}</span>
          </summary>
          <pre className="mt-3 whitespace-pre-wrap border-t border-ink-700 pt-3 text-sm leading-relaxed text-slate-400">{m.body}</pre>
        </details>
      ))}
    </div>
  );
}

const TABS = [
  ['overview', 'Overview'],
  ['approvals', 'Approvals'],
  ['users', 'Users'],
  ['audit', 'Audit log'],
  ['mail', 'Mail outbox'],
];

export default function Admin() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-extrabold text-white">Admin panel</h1>
        <p className="mt-1 text-sm text-slate-500">Platform health at a glance — approvals, users, and the audit trail.</p>
      </div>

      <div className="mb-8 flex gap-1.5 overflow-x-auto no-scrollbar">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'shrink-0 rounded-xl px-4.5 py-2.5 text-sm font-bold transition',
              tab === key ? 'bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-lg shadow-brand-600/25' : 'text-slate-400 hover:bg-ink-800 hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="animate-fade-up">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'approvals' && <ApprovalsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'mail' && <MailTab />}
      </div>
    </div>
  );
}
