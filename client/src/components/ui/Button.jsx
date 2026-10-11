import { clsx } from 'clsx';

const variants = {
  primary:
    'bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-lg shadow-brand-600/25 hover:shadow-brand-600/40 hover:brightness-110 disabled:from-ink-700 disabled:to-ink-700 disabled:shadow-none',
  secondary:
    'bg-ink-800 text-slate-100 border border-ink-600 hover:border-brand-500/60 hover:bg-ink-700 disabled:opacity-50',
  outline:
    'border border-brand-500/50 text-brand-300 hover:bg-brand-500/10 hover:border-brand-400 disabled:opacity-50',
  ghost: 'text-slate-300 hover:text-white hover:bg-ink-800 disabled:opacity-50',
  danger:
    'bg-rose-600/90 text-white hover:bg-rose-500 shadow-lg shadow-rose-600/20 disabled:opacity-50',
  success: 'bg-emerald-600/90 text-white hover:bg-emerald-500 disabled:opacity-50',
};

const sizes = {
  xs: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-7 text-base gap-2.5 rounded-xl',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-semibold transition-all duration-200 select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
