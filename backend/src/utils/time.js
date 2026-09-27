export const MIN = 60000, HOUR = 3600000, DAY = 86400000;

export const addMinutes = (date, minutes) => new Date(new Date(date).getTime() + minutes * MIN);

export function dur(m) {
  m = Math.max(0, Math.round(m));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${mm}m`;
  return `${mm}m`;
}

/** UTC offset of an IANA time zone right now, as "+05:30" for SQL CONVERT_TZ. */
export function tzOffset(timeZone = 'UTC', at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] || '00'}` : '+00:00';
  } catch {
    return '+00:00';
  }
}

export function offsetMinutes(offset) {
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Midnight of "today" in the given offset, as a UTC Date. */
export function startOfDayUtc(offset, at = Date.now()) {
  const shift = offsetMinutes(offset) * MIN;
  const local = new Date(at + shift);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - shift);
}
