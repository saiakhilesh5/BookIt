import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { useToast } from '../components/ui/Toast.jsx';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { extractError } from '../api/client.js';

export default function Login() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(params.get('next') || '/');
    } catch (err) {
      setError(extractError(err, 'Invalid credentials'));
    } finally {
      setLoading(false);
    }
  };

  const fill = (email) => setForm({ email, password: 'Password123!' });

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-extrabold text-white">Welcome back</h1>
        <p className="mt-2 text-slate-500">Sign in to book events and manage your tickets.</p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <Input
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="••••••••"
            error={error}
          />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          New here?{' '}
          <Link to="/register" className="font-bold text-brand-300 hover:text-brand-200">Create an account</Link>
        </p>

        <div className="mt-8 rounded-xl border border-ink-700 bg-ink-850/60 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Demo accounts (click to fill)</p>
          <div className="grid gap-2">
            {[
              ['user', 'alex@bookit.dev'],
              ['organizer', 'organizer@bookit.dev'],
              ['admin', 'admin@bookit.dev'],
            ].map(([role, email]) => (
              <button
                key={role}
                type="button"
                onClick={() => fill(email)}
                className="flex items-center justify-between rounded-lg border border-ink-600 px-3.5 py-2.5 text-sm transition hover:border-brand-500/50 hover:bg-ink-800"
              >
                <span className="font-semibold text-slate-200">{role}</span>
                <span className="text-slate-500">{email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
