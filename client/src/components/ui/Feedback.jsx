import { clsx } from 'clsx';

export function Skeleton({ className }) {
  return <div className={clsx('skeleton rounded-xl', className)} />;
}

export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-850">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <div className={clsx('flex items-center justify-center py-16', className)}>
      <svg className="h-8 w-8 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 bg-ink-900/50 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-slate-600">{icon}</div>}
      <h3 className="font-display text-lg font-bold text-slate-200">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center">
      <svg className="mb-3 h-10 w-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-sm font-medium text-rose-200">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 text-sm font-semibold text-brand-300 hover:text-brand-200">
          Try again
        </button>
      )}
    </div>
  );
}
