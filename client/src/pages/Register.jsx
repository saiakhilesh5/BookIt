import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { useToast } from '../components/ui/Toast.jsx';
import Button from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { extractError } from '../api/client.js';
import { clsx } from 'clsx';

export default function Register() {
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') === 'organizer' ? 'organizer' : 'user');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await register({ ...form, role });
      toast.success(`Welcome to BookIt, ${user.name.split(' ')[0]}!`);
      navigate(role === 'organizer' ? '/dashboard' : '/');
    } catch (err) {
      setError(extractError(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-extrabold text-white">Create your account</h1>
        <p className="mt-2 text-slate-500">Free forever for attendees.</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            ['user', 'Attendee', 'Book tickets, join waitlists'],
            ['organizer', 'Organizer', 'Create and manage events'],
          ].map(([value, title, desc]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              className={clsx(
                'rounded-xl border p-4 text-left transition',
                role === value ? 'border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/40' : 'border-ink-600 bg-ink-850 hover:border-brand-500/40',
              )}
            >
              <p className="font-bold text-white">{title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <Input
            label="Full name"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Jane Cooper"
          />
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
            minLength={8}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="8+ chars, letters & numbers"
            hint="At least 8 characters with a letter and a number."
            error={error}
          />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-brand-300 hover:text-brand-200">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
