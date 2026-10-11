import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-800/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <svg className="h-8 w-8" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="lgf" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#d946ef" />
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#lgf)" />
              <path d="M22 20h24l-18 24" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="44" cy="44" r="4.5" fill="#fff" />
            </svg>
            <span className="font-display text-lg font-extrabold text-white">BookIt</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
            Discover events, book seats in seconds, and never miss a sold-out show again — waitlists and live availability built in.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">Explore</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/events" className="text-slate-500 transition hover:text-brand-300">Browse events</Link></li>
            <li><Link to="/bookings" className="text-slate-500 transition hover:text-brand-300">My bookings</Link></li>
            <li><Link to="/verify" className="text-slate-500 transition hover:text-brand-300">Verify a ticket</Link></li>
            <li><Link to="/register?role=organizer" className="text-slate-500 transition hover:text-brand-300">Become an organizer</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">Platform</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><span className="text-slate-500">Zero-overbooking engine</span></li>
            <li><span className="text-slate-500">Live seat availability</span></li>
            <li><span className="text-slate-500">Automatic waitlists</span></li>
            <li><span className="text-slate-500">Instant PDF tickets</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-800/80 py-5 text-center text-xs text-slate-600">
        Built with the MERN stack · BookIt {new Date().getFullYear()} · Demo cards: 4242 4242 4242 4242
      </div>
    </footer>
  );
}
