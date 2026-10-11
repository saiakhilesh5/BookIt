import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { useToast } from './ui/Toast.jsx';
import { clsx } from 'clsx';

const Logo = () => (
  <Link to="/" className="flex items-center gap-2.5">
    <svg className="h-9 w-9" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#lg)" />
      <path d="M22 20h24l-18 24" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="44" r="4.5" fill="#fff" />
    </svg>
    <span className="font-display text-xl font-extrabold tracking-tight text-white">
      Book<span className="text-gradient">It</span>
    </span>
  </Link>
);

function AvatarMenu({ user }) {
  const [open, setOpen] = useState(false);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const toast = useToast();

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const links = [
    { to: '/bookings', label: 'My bookings', icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z' },
    ...(user.role === 'organizer' || user.role === 'admin'
      ? [{ to: '/dashboard', label: 'Organizer dashboard', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605' }]
      : []),
    ...(user.role === 'admin' ? [{ to: '/admin', label: 'Admin panel', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z' }] : []),
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white ring-2 ring-ink-700 transition hover:ring-brand-500/50"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-60 animate-pop overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl shadow-black/50">
            <div className="border-b border-ink-700 px-4 py-3">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-ink-800 hover:text-white"
              >
                <svg className="h-4.5 w-4.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                  <path strokeLinecap="round" strokeLinejoin="round" d={l.icon} />
                </svg>
                {l.label}
              </Link>
            ))}
            <button
              onClick={async () => {
                setOpen(false);
                await logout();
                toast.info('Signed out');
                navigate('/');
              }}
              className="flex w-full items-center gap-2.5 border-t border-ink-700 px-4 py-2.5 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, status } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLink = ({ isActive }) =>
    clsx(
      'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
      isActive ? 'text-white bg-ink-800' : 'text-slate-400 hover:text-white hover:bg-ink-800/60',
    );

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/80 glass">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <div className="hidden items-center gap-1 md:flex">
            <NavLink to="/events" className={navLink}>Events</NavLink>
            {user?.role === 'organizer' || user?.role === 'admin' ? (
              <NavLink to="/dashboard" className={navLink}>Dashboard</NavLink>
            ) : null}
            {user?.role === 'admin' ? (
              <NavLink to="/admin" className={navLink}>Admin</NavLink>
            ) : null}
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {status === 'loading' ? (
            <div className="skeleton h-9 w-24 rounded-xl" />
          ) : user ? (
            <>
              <Link
                to="/bookings"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white"
              >
                My bookings
              </Link>
              <AvatarMenu user={user} />
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white">
                Sign in
              </Link>
              <Link
                to="/register"
                className="rounded-xl bg-gradient-to-r from-brand-600 to-accent-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-slate-300 hover:bg-ink-800 md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />}
          </svg>
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-ink-800 px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-1">
            <NavLink to="/events" className={navLink} onClick={() => setMobileOpen(false)}>Events</NavLink>
            {user?.role === 'organizer' || user?.role === 'admin' ? (
              <NavLink to="/dashboard" className={navLink} onClick={() => setMobileOpen(false)}>Dashboard</NavLink>
            ) : null}
            {user?.role === 'admin' ? (
              <NavLink to="/admin" className={navLink} onClick={() => setMobileOpen(false)}>Admin</NavLink>
            ) : null}
            {user ? (
              <NavLink to="/bookings" className={navLink} onClick={() => setMobileOpen(false)}>My bookings</NavLink>
            ) : (
              <>
                <NavLink to="/login" className={navLink} onClick={() => setMobileOpen(false)}>Sign in</NavLink>
                <NavLink to="/register" className={navLink} onClick={() => setMobileOpen(false)}>Create account</NavLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
