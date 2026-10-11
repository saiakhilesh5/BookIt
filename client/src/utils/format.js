import { format } from 'date-fns';

export const fmtDate = (d, f = 'MMM d, yyyy') => (d ? format(new Date(d), f) : '');

export const fmtDateTime = (d) => (d ? format(new Date(d), "EEE, MMM d · h:mm a") : '');

export const fmtMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

export const fmtCompact = (n) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(Number(n) || 0);

export const daysUntil = (d) => {
  const diff = new Date(d) - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
};

export const fmtCountdown = (ms) => {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
};
