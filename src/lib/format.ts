// Formatting helpers. Anything rendered at build time must come out identical in
// Node and every browser, so these avoid Intl for prerendered text (Intl output
// varies by ICU version, which would cause hydration mismatches).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

/** $1,240 or $12.50 */
export function money(amount: number): string {
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest ? `$${grouped(whole)}.${pad(rest)}` : `$${grouped(whole)}`;
}

export function grouped(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${grouped(count)} ${count === 1 ? one : many}`;
}

/** Ends a sentence without doubling the period after "p.m." */
export function sentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

/** Turns typed quotes into typographic ones: it's becomes it’s, "hi" becomes “hi”. */
export function typo(text: string): string {
  return text.replace(/"([^"]*)"/g, '“$1”').replace(/'/g, '’');
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

/**
 * Reads the local date and time exactly as written in the config
 * ("2026-10-30T15:00:00-04:00" is Friday, Oct 30 at 3 p.m.), without
 * converting time zones. That keeps the label stable everywhere.
 */
export function wallClock(iso: string): WallClock {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) throw new Error(`"${iso}" is not a date like 2026-10-30T15:00:00-04:00`);
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

/** 3 p.m. / 3:30 p.m. */
export function clockTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const suffix = hour < 12 ? 'a.m.' : 'p.m.';
  return minute ? `${h}:${pad(minute)} ${suffix}` : `${h} ${suffix}`;
}

/** Friday, October 30 at 3 p.m. */
export function longDateTime(iso: string): string {
  const c = wallClock(iso);
  return `${DAYS_LONG[c.weekday]}, ${MONTHS_LONG[c.month - 1]} ${c.day} at ${clockTime(c.hour, c.minute)}`;
}

/** Fri, Oct 30 */
export function shortDate(iso: string): string {
  const c = wallClock(iso);
  return `${DAYS[c.weekday]}, ${MONTHS[c.month - 1]} ${c.day}`;
}

/** Fri, Oct 30 at 3 p.m. */
export function shortDateTime(iso: string): string {
  const c = wallClock(iso);
  return `${shortDate(iso)} at ${clockTime(c.hour, c.minute)}`;
}

/** Friday at 3 p.m. */
export function dayAndTime(iso: string): string {
  const c = wallClock(iso);
  return `${DAYS_LONG[c.weekday]} at ${clockTime(c.hour, c.minute)}`;
}

/** October 26 to 30, or October 29 to November 2 */
export function dateRange(startIso: string, endIso: string): string {
  const a = wallClock(startIso);
  const b = wallClock(endIso);
  if (a.year === b.year && a.month === b.month) {
    return a.day === b.day
      ? `${MONTHS_LONG[a.month - 1]} ${a.day}`
      : `${MONTHS_LONG[a.month - 1]} ${a.day} to ${b.day}`;
  }
  return `${MONTHS_LONG[a.month - 1]} ${a.day} to ${MONTHS_LONG[b.month - 1]} ${b.day}`;
}

/** 2d 04h 13m, then 3h 07m 42s, then 6m 09s */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${m}m ${pad(s)}s`;
}

/** "2 days, 4 hours" for screen readers (minute precision, so it isn't chatty). */
export function countdownSpoken(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (!d && m) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return parts.length ? parts.join(', ') : 'less than a minute';
}

const stampFormat = new Intl.DateTimeFormat('en-CA', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "just now", "42s ago", "5 min ago", "2 h ago", then a date. Client-only (uses the visitor's clock). */
export function timeAgo(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return stampFormat.format(then);
}
