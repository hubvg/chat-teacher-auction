/**
 * GET /api/bids
 *
 * Reads bids from the Google Apps Script web app (env var BIDS_SOURCE_URL), which
 * turns bid emails into rows in a Google Sheet, and serves them to the page.
 * Three layers keep a whole school refreshing at once from overloading Google:
 *
 *   1. Vercel's CDN caches each good response for 5 seconds, so most requests
 *      never reach this function.
 *   2. This function reuses its last good response for 4 seconds and shares one
 *      Google request between callers that arrive at the same moment.
 *   3. Rate limit: each IP gets RATE_LIMIT uncached requests per minute. Normal
 *      visitors are served from the CDN cache and never get close; scripts that
 *      dodge the cache (random query strings, hammering) get HTTP 429.
 *
 * The limit is generous on purpose: everyone on school Wi-Fi shares one IP.
 */

interface Bid {
  lot: number;
  amount: number;
  name: string;
  k: string;
  t: number;
}

const FRESH_MS = 4_000;
const STALE_MAX_MS = 5 * 60_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

// Short on purpose: near the deadline, a stale highest bid makes people submit bids that are already too low.
const CDN_CACHE = 'public, s-maxage=5, stale-while-revalidate=5';
const NO_STORE = 'no-store';

let last: { at: number; body: string } | null = null;
let pending: Promise<string> | null = null;
const hits = new Map<string, { count: number; resetAt: number }>();

function json(body: string, status: number, cache: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
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

function cleanBid(raw: unknown): Bid | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lot = Number(r.lot);
  const amount = Number(r.amount);
  const t = Number(r.t);
  if (!Number.isInteger(lot) || lot < 1 || lot > 9999) return null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !Number.isFinite(t) || t <= 0) return null;
  return {
    lot,
    amount: Math.round(amount * 100) / 100,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : 'Anonymous',
    k: typeof r.k === 'string' ? r.k.slice(0, 32) : '',
    t,
  };
}

class UpstreamError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(code: string, hint: string) {
    super(code);
    this.code = code;
    this.hint = hint;
  }
}

async function fetchUpstream(source: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(source, {
      redirect: 'follow',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError('upstream_unreachable', 'Google did not answer in time. It usually recovers within a minute.');
  }
  if (!res.ok) {
    throw new UpstreamError('upstream_status', `The Apps Script answered with HTTP ${res.status}.`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new UpstreamError(
      'upstream_not_json',
      'The Apps Script did not return JSON. Check that it is deployed as a web app with access set to "Anyone".',
    );
  }
  const d = data as Record<string, unknown> | null;
  if (!d || d.ok !== true || !Array.isArray(d.bids)) {
    const reason = d && typeof d.error === 'string' ? ` It said: ${d.error.slice(0, 200)}` : '';
    throw new UpstreamError('upstream_invalid', `The Apps Script returned an unexpected response.${reason}`);
  }
  const bids: Bid[] = [];
  for (const raw of d.bids.slice(0, 20_000)) {
    const bid = cleanBid(raw);
    if (bid) bids.push(bid);
  }
  const updatedAt = typeof d.generatedAt === 'number' ? d.generatedAt : Date.now();
  return JSON.stringify({ configured: true, updatedAt, bids });
}

/** Returns a fresh-enough body, sharing one in-flight Google request between concurrent callers. */
function loadBids(source: string): Promise<string> {
  if (last && Date.now() - last.at < FRESH_MS) return Promise.resolve(last.body);
  if (!pending) {
    pending = fetchUpstream(source)
      .then((body) => {
        last = { at: Date.now(), body };
        return body;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function GET(request: Request): Promise<Response> {
  const now = Date.now();
  const wait = rateLimited(clientIp(request), now);
  if (wait > 0) {
    return json(JSON.stringify({ error: 'rate_limited', retryAfter: wait }), 429, NO_STORE, {
      'retry-after': String(wait),
      'ratelimit-limit': String(RATE_LIMIT),
      'ratelimit-remaining': '0',
      'ratelimit-reset': String(wait),
    });
  }

  const source = process.env.BIDS_SOURCE_URL?.trim() ?? '';
  if (!source) {
    return json(JSON.stringify({ configured: false, updatedAt: null, bids: [] }), 200, 'public, s-maxage=30');
  }
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(source)) {
    return json(JSON.stringify({ error: 'bad_config', hint: 'BIDS_SOURCE_URL must start with https://' }), 500, NO_STORE);
  }

  try {
    return json(await loadBids(source), 200, CDN_CACHE);
  } catch (error) {
    if (last && now - last.at < STALE_MAX_MS) {
      const stale = JSON.stringify({ ...JSON.parse(last.body), stale: true });
      return json(stale, 200, 'public, s-maxage=5');
    }
    const e = error instanceof UpstreamError ? error : new UpstreamError('upstream_error', 'Unexpected error.');
    return json(JSON.stringify({ error: e.code, hint: e.hint }), 502, NO_STORE);
  }
}

/** Test hook: clears in-memory caches and counters. */
export function __reset(): void {
  last = null;
  pending = null;
  hits.clear();
}
