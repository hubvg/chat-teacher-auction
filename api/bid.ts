/**
 * POST /api/bid
 *
 * Places a bid from the site's bid form. This function checks everything it
 * can (the activity, amount, name, email, bidding hours and a rate limit), then
 * passes the bid to the Google Apps Script at BIDS_SOURCE_URL. The script makes
 * the final check, that the bid beats the current top bid, while holding a lock,
 * and saves it to the Bids sheet. It only accepts bids that carry BIDS_SECRET,
 * so nobody can skip these checks by posting to the script directly.
 *
 * Answers:
 *   200 { ok: true, bid }                         saved; bid is as the board will show it
 *   200 { ok: false, error: 'too_low', nextMin, top, yours }
 *   200 { ok: false, error: 'closed' | 'not_open' }
 *     (being outbid or just missing the deadline are normal auction outcomes, not HTTP errors)
 *   400 { error: 'invalid', field, message }      the field to fix
 *   429 rate_limited, 503 not_configured or busy, 502 Google unreachable or set up wrong (with a hint)
 *
 * Relative imports end in .js because Vercel compiles each function file on its own.
 */
import { activities, config } from '../src/config.js';
import { emailProblem, NAME_MAX, nameProblem, parseAmount } from '../src/lib/bidForm.js';
import { money } from '../src/lib/format.js';

// Generous on purpose: everyone on school Wi-Fi shares one IP address.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_BODY = 4_000;

const hits = new Map<string, { count: number; resetAt: number }>();

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...extra,
    },
  });
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('x-real-ip') ?? forwarded ?? 'unknown';
}

/** Fixed-window limiter, per function instance. Returns seconds to wait, or 0 if allowed. */
function rateLimited(ip: string, now: number): number {
  if (hits.size > 10_000) {
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return 0;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}

const parseTime = (value: string): number | null => {
  const t = value.trim() ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? null : t;
};

const invalid = (field: string, message: string) => json({ ok: false, error: 'invalid', field, message }, 400);

export async function POST(request: Request): Promise<Response> {
  const now = Date.now();
  const wait = rateLimited(clientIp(request), now);
  if (wait > 0) {
    return json({ ok: false, error: 'rate_limited', retryAfter: wait }, 429, { 'retry-after': String(wait) });
  }

  const source = process.env.BIDS_SOURCE_URL?.trim() ?? '';
  const secret = process.env.BIDS_SECRET?.trim() ?? '';
  if (!source || !secret) return json({ ok: false, error: 'not_configured' }, 503);
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(source)) {
    return json({ ok: false, error: 'bad_config', hint: 'BIDS_SOURCE_URL must start with https://' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) throw new Error('too large');
    const text = await request.text();
    if (text.length > MAX_BODY) throw new Error('too large');
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // Bots fill in every field; people never see this one. Pretend it worked and drop it.
  if (typeof body.hp === 'string' && body.hp.trim()) return json({ ok: true, ignored: true }, 200);

  const lot = Number(body.lot);
  const activity = activities.find((a) => a.lot === lot);
  if (!activity) return invalid('lot', 'That activity isn’t on the list.');

  const amount = parseAmount(body.amount);
  if (amount === null) return invalid('amount', 'Enter an amount, like 45.');
  if (amount > config.maxBid) return invalid('amount', `Bids over ${money(config.maxBid)} aren’t accepted.`);
  const startingBid = activity.startingBid ?? config.startingBid;
  if (amount + 1e-9 < startingBid) return invalid('amount', `Bids on this activity start at ${money(startingBid)}.`);
  const nameError = nameProblem(body.name);
  if (nameError) return invalid('name', nameError);
  const emailError = emailProblem(body.email);
  if (emailError) return invalid('email', emailError);

  const opensAt = parseTime(config.opensAt);
  const closesAt = parseTime(config.closesAt);
  if (opensAt === null || closesAt === null || now < opensAt) return json({ ok: false, error: 'not_open' }, 200);
  if (now > closesAt) return json({ ok: false, error: 'closed' }, 200);

  const payload = {
    secret,
    lot,
    activity: activity.name.replace(/\s+/g, ' ').trim(),
    amount,
    name: String(body.name)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, NAME_MAX),
    email: String(body.email).trim().toLowerCase(),
    minIncrement: config.minIncrement,
    startingBid,
    opensAt,
    closesAt,
    nameStyle: config.nameStyle,
  };

  const unreachable = () =>
    json({ ok: false, error: 'upstream_unreachable', hint: 'Google did not answer in time. Try again in a minute.' }, 502);
  let res: Response;
  try {
    res = await fetch(source, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return unreachable();
  }
  let data: Record<string, unknown> | null;
  try {
    data = (await res.json()) as Record<string, unknown> | null;
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return unreachable();
    return json(
      {
        ok: false,
        error: 'upstream_not_json',
        hint: 'The Apps Script did not return JSON. Check that it is deployed as a web app with access set to "Anyone", and that the deployment has the latest code.',
      },
      502,
    );
  }

  if (data?.ok === true && data.bid && typeof data.bid === 'object') {
    const b = data.bid as Record<string, unknown>;
    const bid = {
      lot: Number(b.lot),
      amount: Number(b.amount),
      name: typeof b.name === 'string' ? b.name.slice(0, 40) : 'Anonymous',
      k: typeof b.k === 'string' ? b.k.slice(0, 32) : '',
      t: Number(b.t),
    };
    return json({ ok: true, bid }, 200);
  }
  switch (data?.error) {
    case 'too_low':
      return json(
        { ok: false, error: 'too_low', nextMin: Number(data.nextMin), top: Number(data.top) || null, yours: data.yours === true },
        200,
      );
    case 'closed':
    case 'not_open':
      return json({ ok: false, error: data.error }, 200);
    case 'busy':
      return json({ ok: false, error: 'busy' }, 503, { 'retry-after': '2' });
    case 'unauthorized':
      return json(
        {
          ok: false,
          error: 'upstream_auth',
          hint: 'BIDS_SECRET in Vercel does not match the Apps Script. Run setup in the script and copy the secret it shows.',
        },
        502,
      );
    default:
      return json({ ok: false, error: 'upstream_error' }, 502);
  }
}

/** Test hook: clears the rate-limit counters. */
export function __reset(): void {
  hits.clear();
}
