// Date and number formatting, same wording as the original application.
export const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const t = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
export const dshort = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const dlong = (ts) => new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const tshort = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const dtime = (ts) => (ts ? `${dshort(ts)}, ${tshort(ts)}` : '-');

export function ago(ts) {
  if (!ts) return '-';
  const m = Math.round((Date.now() - t(ts)) / MIN);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function dur(m) {
  m = Math.max(0, Math.round(m));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export const fsize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();

/** Value for <input type="datetime-local"> from a timestamp. */
export function toLocalInput(ts) {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

export const warrantyDays = (date) => (date ? Math.round((new Date(`${date}T00:00:00`).getTime() - Date.now()) / DAY) : null);
