import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-8xl font-extrabold text-gradient">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-white">Page not found</h1>
      <p className="mt-2 text-slate-500">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className="mt-8 rounded-xl bg-gradient-to-r from-brand-600 to-accent-600 px-8 py-3 font-bold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110">
        Back to home
      </Link>
    </div>
  );
}
