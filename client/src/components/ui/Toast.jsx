import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

const ToastContext = createContext(null);

const icons = {
  success: (
    <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  ),
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (type, message, opts = {}) => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-4), { id, type, message, duration: opts.duration ?? 4000 }]);
      if (!opts.sticky) setTimeout(() => remove(id), opts.duration ?? 4000);
      return id;
    },
    [remove],
  );

  const api = {
    success: (msg, opts) => toast('success', msg, opts),
    error: (msg, opts) => toast('error', msg, { duration: 5500, ...opts }),
    info: (msg, opts) => toast('info', msg, opts),
    remove,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2.5">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border px-4 py-3 shadow-xl shadow-black/40 glass',
                t.type === 'success' && 'border-emerald-500/30',
                t.type === 'error' && 'border-rose-500/30',
                t.type === 'info' && 'border-sky-500/30',
              )}
            >
              {icons[t.type]}
              <p className="flex-1 text-sm font-medium text-slate-200">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                className="text-slate-500 transition-colors hover:text-white"
                aria-label="Dismiss"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
