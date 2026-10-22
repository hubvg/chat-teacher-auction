// Test inputs only. Nothing in this file is shown on the site.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { GET, __reset } from '../api/bids';

const SOURCE = 'https://script.google.com/macros/s/TEST/exec';
const realFetch = globalThis.fetch;
let upstreamCalls = 0;
let upstream: () => Promise<Response>;

const ok = (bids: unknown[]) => async () =>
  new Response(JSON.stringify({ ok: true, generatedAt: 123, bids }), { headers: { 'content-type': 'application/json' } });

const sample = [
  { lot: 12, amount: 12, name: 'Bidder A', k: 'abc', t: 1_800_000_000_000 },
  { lot: '3', amount: '15', name: '', k: null, t: 1_800_000_060_000, extra: '<script>' },
  { lot: 2, amount: -4, name: 'Bidder B', k: 'z', t: 1 },
  { lot: 2, amount: 1e9, name: 'Bidder C', k: 'z', t: 2 },
  { lot: 'x', amount: 5, name: 'No activity', k: 'z', t: 3 },
];

const request = (ip = '203.0.113.7', path = '/api/bids') =>
  new Request(`https://site.test${path}`, { headers: { 'x-real-ip': ip } });

beforeEach(() => {
  __reset();
  upstreamCalls = 0;
  upstream = ok(sample);
  process.env.BIDS_SOURCE_URL = SOURCE;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(String(input), SOURCE);
    upstreamCalls += 1;
    return upstream();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.BIDS_SOURCE_URL;
});

test('returns cleaned bids with CDN cache headers', async () => {
  const res = await GET(request());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control')!, /s-maxage=5/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const body = await res.json();
  assert.equal(body.configured, true);
  assert.equal(body.updatedAt, 123);
  assert.equal(body.bids.length, 2, 'negative and absurd amounts, and bids without an activity number, are dropped');
  assert.deepEqual(body.bids[1], { lot: 3, amount: 15, name: 'Anonymous', k: '', t: 1_800_000_060_000 }, 'unknown fields are dropped');
});

test('concurrent requests share one upstream call, and results are reused for a few seconds', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  upstream = async () => {
    await gate;
    return ok(sample)();
  };
  const pending = Promise.all(Array.from({ length: 25 }, (_, i) => GET(request(`10.0.0.${i}`))));
  release();
  const responses = await pending;
  assert.equal(upstreamCalls, 1);
  assert.ok(responses.every((r) => r.status === 200));
  await GET(request());
  assert.equal(upstreamCalls, 1, 'second wave served from memory');
});

test('rate limit: 120 uncached requests per minute per IP, then 429 that is never cached', async () => {
  for (let i = 0; i < 120; i++) assert.equal((await GET(request('198.51.100.1', `/api/bids?x=${i}`))).status, 200);
  const limited = await GET(request('198.51.100.1', '/api/bids?x=bust'));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('cache-control'), 'no-store');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await GET(request('198.51.100.2'))).status, 200, 'other visitors are unaffected');
});

test('serves the last good data when Google fails, then reports a helpful error', async () => {
  await GET(request());
  __reset();
  upstream = async () => new Response('<html>Sign in</html>', { status: 200 });
  const res = await GET(request());
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.equal(body.error, 'upstream_not_json');
  assert.match(body.hint, /Anyone/);
});

test('stale fallback when Google is down after a good response', async () => {
  await GET(request());
  // Force the in-memory copy to look old but still within the stale window.
  const realNow = Date.now;
  Date.now = () => realNow() + 10_000;
  upstream = async () => {
    throw new Error('down');
  };
  try {
    const res = await GET(request());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.stale, true);
    assert.equal(body.bids.length, 2);
  } finally {
    Date.now = realNow;
  }
});

test('an Apps Script error message is passed along as a hint', async () => {
  upstream = async () => new Response(JSON.stringify({ ok: false, error: 'No "Timestamp" column.' }));
  const res = await GET(request());
  assert.equal(res.status, 502);
  assert.match((await res.json()).hint, /Timestamp/);
});

test('not configured yet: empty, cacheable answer instead of an error', async () => {
  delete process.env.BIDS_SOURCE_URL;
  const res = await GET(request());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { configured: false, updatedAt: null, bids: [] });
  assert.equal(upstreamCalls, 0);
});

test('refuses a non-https source', async () => {
  process.env.BIDS_SOURCE_URL = 'http://evil.example/exec';
  const res = await GET(request());
  assert.equal(res.status, 500);
});
