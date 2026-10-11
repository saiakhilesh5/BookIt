import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import Button from '../components/ui/Button.jsx';
import { fmtDateTime, fmtMoney } from '../utils/format.js';

export default function Verify() {
  const { code } = useParams();
  const [input, setInput] = useState(code ?? '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const verify = async (value) => {
    if (!value?.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.get(`/bookings/verify/${encodeURIComponent(value.trim().toUpperCase())}`);
      setResult(data.data);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Ticket not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code) verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-extrabold text-white">Verify a ticket</h1>
        <p className="mt-2 text-slate-500">Scan or type the ticket code (e.g. BI-XXXXXXXX) to check it at the door.</p>
      </div>

      <form
        className="mt-8 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          verify(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="BI-XXXXXXXX"
          className="h-13 flex-1 rounded-xl border border-ink-600 bg-ink-850 px-4 font-mono text-lg tracking-widest text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
        />
        <Button type="submit" size="lg" loading={loading}>Verify</Button>
      </form>

      {error && (
        <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center animate-fade-up">
          <svg className="mx-auto h-10 w-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="mt-3 font-semibold text-rose-200">{error}</p>
        </div>
      )}

      {result && (
        <div
          className={`mt-8 animate-fade-up rounded-2xl border p-6 ${
            result.valid ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'
          }`}
        >
          <div className="flex items-center gap-4">
            {result.valid ? (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
                <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
            )}
            <div>
              <p className={`font-display text-xl font-extrabold ${result.valid ? 'text-emerald-300' : 'text-amber-300'}`}>
                {result.valid ? 'Valid ticket' : `Not valid (${result.status})`}
              </p>
              <p className="text-sm text-slate-400">Holder: {result.holder}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Event</dt><dd className="font-semibold text-white">{result.eventTitle}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">When</dt><dd className="text-slate-200">{fmtDateTime(result.startsAt)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Venue</dt><dd className="text-slate-200">{result.venue}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Tier</dt><dd className="text-slate-200">{result.tierName} × {result.quantity}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
