import { clsx } from 'clsx';

const tones = {
  brand: 'bg-brand-500/15 text-brand-300 border-brand-500/30',
  accent: 'bg-accent-500/15 text-accent-400 border-accent-500/30',
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  slate: 'bg-ink-800 text-slate-300 border-ink-600',
  sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};

export default function Badge({ tone = 'slate', className, children }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tones[tone] ?? tones.slate,
        className,
      )}
    >
      {children}
    </span>
  );
}

export const statusBadge = (status) => {
  const map = {
    published: ['green', 'Live'],
    pending: ['amber', 'Pending review'],
    draft: ['slate', 'Draft'],
    rejected: ['rose', 'Rejected'],
    cancelled: ['rose', 'Cancelled'],
    confirmed: ['green', 'Confirmed'],
    held: ['amber', 'On hold'],
    expired: ['slate', 'Expired'],
    refunded: ['sky', 'Refunded'],
    waiting: ['amber', 'Waiting'],
    promoted: ['green', 'Promoted'],
    removed: ['slate', 'Removed'],
  };
  const [tone, label] = map[status] ?? ['slate', status];
  return <Badge tone={tone}>{label ?? status}</Badge>;
};
