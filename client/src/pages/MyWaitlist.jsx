import { Link } from 'react-router-dom';
import { useMyWaitlist, useLeaveWaitlist } from '../api/hooks.js';
import Button from '../components/ui/Button.jsx';
import { Skeleton, EmptyState } from '../components/ui/Feedback.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { extractError } from '../api/client.js';
import { fmtDateTime } from '../utils/format.js';

export default function MyWaitlist() {
  const { data: entries, isLoading } = useMyWaitlist();
  const leave = useLeaveWaitlist();
  const toast = useToast();

  const doLeave = async (entry) => {
    try {
      await leave.mutateAsync({ eventId: entry.event?.id, tierId: entry.tierId });
      toast.info('Removed from waitlist');
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-extrabold text-white">My waitlists</h1>
        <p className="mt-1 text-sm text-slate-500">
          We promote you automatically when seats free up — you'll get 10 minutes to pay.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : !entries || entries.length === 0 ? (
        <EmptyState
          title="Not on any waitlists"
          description="When an event sells out, join its waitlist — you'll be promoted automatically if seats open up."
          action={<Link to="/events" className="rounded-xl bg-gradient-to-r from-brand-600 to-accent-600 px-6 py-2.5 font-bold text-white">Browse events</Link>}
        />
      ) : (
        <div className="space-y-4 animate-fade-up">
          {entries.map((entry) => {
            const event = entry.event;
            const tier = event?.tiers?.find((t) => (t.id) === entry.tierId);
            const eventId = event?.id;
            return (
              <div key={entry.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-700 bg-ink-850 p-5">
                {event?.images?.[0] && (
                  <img src={event.images[0]} alt="" className="h-16 w-16 rounded-xl object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <Link to={`/events/${eventId}`} className="font-display font-bold text-white hover:text-brand-300">
                    {event?.title}
                  </Link>
                  <p className="mt-1 text-sm text-slate-500">
                    {fmtDateTime(event?.startsAt)} · {tier?.name ?? 'tier'} × {entry.quantity}
                  </p>
                </div>
                <Button size="sm" variant="ghost" loading={leave.isPending} onClick={() => doLeave(entry)}>
                  Leave
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
