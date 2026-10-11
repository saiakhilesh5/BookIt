import { clsx } from 'clsx';
import { useId } from 'react';

const baseField =
  'w-full rounded-xl border bg-ink-850 text-slate-100 placeholder:text-slate-500 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/60 disabled:opacity-50';

export function Input({ label, error, hint, className, icon, ...props }) {
  const id = useId();
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{icon}</div>}
        <input
          id={id}
          className={clsx(
            baseField,
            'h-11 px-3.5',
            icon && 'pl-10',
            error ? 'border-rose-500/60' : 'border-ink-600 hover:border-ink-600/80',
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-400">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Textarea({ label, error, className, ...props }) {
  const id = useId();
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={clsx(baseField, 'px-3.5 py-2.5 min-h-28 resize-y', error ? 'border-rose-500/60' : 'border-ink-600')}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs font-medium text-rose-400">{error}</p>}
    </div>
  );
}

export function Select({ label, error, className, children, ...props }) {
  const id = useId();
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <select
        id={id}
        className={clsx(baseField, 'h-11 px-3.5 appearance-none cursor-pointer', error ? 'border-rose-500/60' : 'border-ink-600', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-400">{error}</p>}
    </div>
  );
}
