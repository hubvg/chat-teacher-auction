// Test inputs only. Nothing in this file is shown on the site.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { POST, __reset } from '../api/bid';
import { config } from '../src/config';

const SOURCE = 'https://script.google.com/macros/s/TEST/exec';
const realFetch = globalThis.fetch;
const realNow = Date.now;
let sent: Array<Record<string, unknown>> = [];
let upstream: (body: Record<string, unknown>) => unknown;

const request = (body: unknown, ip = '203.0.113.7') =>
  new Request('https://site.test/api/bid', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const good = { lot: 12, amount: '46', name: 'Maya Test', email: 'maya@school.test' };

// The site's config has no dates yet, so these tests set bidding hours around "now".
const opens = '2026-10-26T08:00:00-04:00';
const closes = '2026-10-30T15:00:00-04:00';
const during = Date.parse('2026-10-28T12:00:00-04:00');

beforeEach(() => {
  __reset();
  sent = [];
  upstream = (body) => ({ ok: true, bid: { lot: body.lot, amount: body.amount, name: 'Maya T.', k: 'abc123', t: during } });
  process.env.BIDS_SOURCE_URL = SOURCE;
  process.env.BIDS_SECRET = 'test-secret';
  Object.assign(config, { opensAt: opens, closesAt: closes });
  Date.now = () => during;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), SOURCE);
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    sent.push(body);
    return new Response(JSON.stringify(upstream(body)), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  Date.now = realNow;
  Object.assign(config, { opensAt: '', closesAt: '' });
  delete process.env.BIDS_SOURCE_URL;
  delete process.env.BIDS_SECRET;
});

test('a good bid is passed to the Apps Script with the secret and the rules', async () => {
  const res = await POST(request(good));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.deepEqual(body, { ok: true, bid: { lot: 12, amount: 46, name: 'Maya T.', k: 'abc123', t: during } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.secret, 'test-secret');
  assert.equal(sent[0]!.activity, 'Pizza-making with Mr. Fabrizi');
  assert.equal(sent[0]!.minIncrement, config.minIncrement);
  assert.equal(sent[0]!.startingBid, config.startingBid, 'the Apps Script enforces the starting bid too');
  assert.equal(sent[0]!.opensAt, Date.parse(opens));
  assert.equal(sent[0]!.email, 'maya@school.test');
});

test('bad input is refused before it reaches the Apps Script, with the field to fix', async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...good, lot: 99 }, 'lot'],
    [{ ...good, amount: 'lots' }, 'amount'],
    [{ ...good, amount: '-5' }, 'amount'],
    [{ ...good, amount: String(config.maxBid + 1) }, 'amount'],
    [{ ...good, amount: String(config.startingBid - 1) }, 'amount'],
    [{ ...good, name: 'Maya Test & Kai Test' }, 'name'],
    [{ ...good, name: '   ' }, 'name'],
    [{ ...good, name: '12345' }, 'name'],
    [{ ...good, email: 'not-an-email' }, 'email'],
  ];
  for (const [body, field] of cases) {
    const res = await POST(request(body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal((await res.json()).field, field);
  }
  assert.equal((await POST(request('{nope'))).status, 400);
  assert.equal(sent.length, 0);
});

test('bids outside bidding hours are refused', async () => {
  Date.now = () => Date.parse(opens) - 1;
  assert.deepEqual(await (await POST(request(good))).json(), { ok: false, error: 'not_open' });
  Date.now = () => Date.parse(closes) + 1;
  assert.deepEqual(await (await POST(request(good))).json(), { ok: false, error: 'closed' });
  Object.assign(config, { opensAt: '', closesAt: '' });
  Date.now = () => during;
  assert.equal((await (await POST(request(good))).json()).error, 'not_open', 'no dates set means no bidding');
  assert.equal(sent.length, 0);
});

test('a bid that is too low comes back with the new minimum, as a normal answer rather than an HTTP error', async () => {
  upstream = () => ({ ok: false, error: 'too_low', nextMin: 51, top: 50 });
  const res = await POST(request(good));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: false, error: 'too_low', nextMin: 51, top: 50, yours: false });
  upstream = () => ({ ok: false, error: 'too_low', nextMin: 51, top: 50, yours: true });
  assert.equal((await (await POST(request(good))).json()).yours, true, 'and says when the top bid is already theirs');
});

test('a script deployed without "Anyone" access (a Google sign-in page) is reported as a setup problem', async () => {
  globalThis.fetch = (async () =>
    new Response('<!doctype html><title>Sign in</title>', { headers: { 'content-type': 'text/html' } })) as typeof fetch;
  const res = await POST(request(good));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, 'upstream_not_json');
  assert.match(body.hint, /Anyone/);
});

test('a wrong secret is reported as a setup problem', async () => {
  upstream = () => ({ ok: false, error: 'unauthorized' });
  const res = await POST(request(good));
  assert.equal(res.status, 502);
  assert.match((await res.json()).hint, /BIDS_SECRET/);
});

test('the hidden bot field makes the bid silently disappear', async () => {
  const res = await POST(request({ ...good, hp: 'http://spam.test' }));
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test('not set up yet: a clear 503 instead of an error', async () => {
  delete process.env.BIDS_SECRET;
  const res = await POST(request(good));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'not_configured');
});

test('rate limit: 60 bids a minute per address, then 429', async () => {
  for (let i = 0; i < 60; i++) assert.equal((await POST(request(good, '198.51.100.9'))).status, 200);
  const limited = await POST(request(good, '198.51.100.9'));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await POST(request(good, '198.51.100.10'))).status, 200, 'other addresses are unaffected');
});

test('when Google does not answer, the bidder is told to try again', async () => {
  globalThis.fetch = (async () => {
    throw new Error('down');
  }) as typeof fetch;
  const res = await POST(request(good));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'upstream_unreachable');
});
