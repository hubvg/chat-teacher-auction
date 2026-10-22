// Runs google/Code.gs in a sandbox with fake Google services, the same way Apps
// Script would, to check how bids are saved and what the website will receive.
// Test inputs only. Nothing in this file is shown on the site.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const code = readFileSync(new URL('../google/Code.gs', import.meta.url), 'utf8');

type Cell = unknown;

class FakeSheet {
  rows: Cell[][] = [];
  constructor(public name: string) {}
  getName() {
    return this.name;
  }
  getLastRow() {
    return this.rows.length;
  }
  getDataRange() {
    return this.getRange(1, 1, Math.max(this.rows.length, 1), 8);
  }
  setFrozenRows() {}
  appendRow(row: Cell[]) {
    this.rows.push([...row]);
  }
  getRange(row: number | string, col = 1, numRows = 1, numCols = 1) {
    const sheet = this;
    if (typeof row === 'string') return { setNumberFormat: () => undefined };
    return {
      getSheet: () => sheet,
      getRow: () => row,
      getNumRows: () => numRows,
      getValues: () =>
        Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, j) => sheet.rows[row - 1 + i]?.[col - 1 + j] ?? ''),
        ),
      setValues(values: Cell[][]) {
        values.forEach((r, i) => r.forEach((v, j) => ((sheet.rows[row - 1 + i] ??= [])[col - 1 + j] = v)));
        return this;
      },
      setValue(v: Cell) {
        return this.setValues([[v]]);
      },
      setFontWeight() {
        return this;
      },
      setNumberFormat() {
        return this;
      },
    };
  }
}

function environment() {
  const spreadsheet = { sheets: [new FakeSheet('Sheet1')] };
  const props = new Map<string, string>();
  const cache = new Map<string, string>();
  const logs: string[] = [];
  const sandbox: Record<string, unknown> = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n: string) => spreadsheet.sheets.find((s) => s.name === n) ?? null,
        insertSheet: (n: string) => {
          const sheet = new FakeSheet(n);
          spreadsheet.sheets.push(sheet);
          return sheet;
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
        remove: (k: string) => void cache.delete(k),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => void props.set(k, v),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: {
      getUuid: () => 'aaaa-bbbb-cccc',
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg: string, text: string) =>
        Array.from(createHash('sha256').update(text, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (body: string) => ({
        body,
        setMimeType() {
          return this;
        },
      }),
    },
    Logger: { log: (line: string) => void logs.push(line) },
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const call = <T,>(name: string, ...args: unknown[]) => (sandbox[name] as (...a: unknown[]) => T)(...args);
  const sheet = () => spreadsheet.sheets.find((s) => s.name === 'Bids');
  return { call, props, cache, logs, sheet };
}

const HOUR = 3_600_000;
const NOW = Date.now();
const rules = { opensAt: NOW - HOUR, closesAt: NOW + HOUR, minIncrement: 1, startingBid: null, nameStyle: 'first-initial' };

function ready() {
  const env = environment();
  env.call('setup');
  const secret = env.props.get('BIDS_SECRET')!;
  const post = (bid: Record<string, unknown>) =>
    JSON.parse(
      env.call<{ body: string }>('doPost', {
        postData: { contents: JSON.stringify({ secret, activity: 'Test activity', ...rules, ...bid }) },
      }).body,
    );
  const feed = () => JSON.parse(env.call<{ body: string }>('doGet').body);
  return { ...env, secret, post, feed };
}

test('setup makes the Bids tab and a secret, and shows the secret once', () => {
  const env = environment();
  env.call('setup');
  assert.deepEqual(env.sheet()!.rows[0], ['Received', 'Name', 'Email', '#', 'Activity', 'Amount', 'Void', 'Note']);
  const secret = env.props.get('BIDS_SECRET')!;
  assert.match(secret, /^[a-z0-9]{20,}$/);
  assert.ok(env.logs.includes(secret), 'the secret is in the log to copy into Vercel');
  env.call('setup');
  assert.equal(env.props.get('BIDS_SECRET'), secret, 'running setup again keeps the same secret');
});

test('a bid without the right secret is refused', () => {
  const env = ready();
  const res = JSON.parse(
    env.call<{ body: string }>('doPost', { postData: { contents: JSON.stringify({ secret: 'wrong', lot: 1, amount: 5, name: 'X Y' }) } }).body,
  );
  assert.deepEqual(res, { ok: false, error: 'unauthorized' });
  assert.equal(env.sheet()!.rows.length, 1, 'nothing saved');
});

test('a valid bid is saved and comes back the way the board will show it', () => {
  const env = ready();
  const res = env.post({ lot: 12, amount: 25, name: 'maya test', email: 'Maya@School.test' });
  assert.equal(res.ok, true);
  assert.deepEqual({ lot: res.bid.lot, amount: res.bid.amount, name: res.bid.name }, { lot: 12, amount: 25, name: 'Maya T.' });
  assert.match(res.bid.k, /^[0-9a-f]{12}$/);
  const row = env.sheet()!.rows[1]!;
  assert.deepEqual(row.slice(1, 6), ['maya test', 'maya@school.test', 12, 'Test activity', 25]);
});

test('a bid must beat the top bid by the step, starting from the starting bid', () => {
  const env = ready();
  assert.deepEqual(env.post({ lot: 3, amount: 4, name: 'Low Bid', email: 'a@x.test', startingBid: 5 }), {
    ok: false,
    error: 'too_low',
    nextMin: 5,
    top: 0,
    yours: false,
  });
  assert.equal(env.post({ lot: 3, amount: 5, name: 'First Bid', email: 'a@x.test', startingBid: 5 }).ok, true);
  assert.deepEqual(env.post({ lot: 3, amount: 5.5, name: 'Short Bid', email: 'b@x.test', startingBid: 5 }), {
    ok: false,
    error: 'too_low',
    nextMin: 6,
    top: 5,
    yours: false,
  });
  assert.equal(env.post({ lot: 3, amount: 6, name: 'Next Bid', email: 'b@x.test' }).ok, true);
  assert.equal(env.post({ lot: 4, amount: 1, name: 'Other Lot', email: 'c@x.test' }).ok, true, 'other activities are separate');
});

test('the same bid sent twice (a retry after a slow answer) says the top bid is already theirs', () => {
  const env = ready();
  assert.equal(env.post({ lot: 9, amount: 20, name: 'Maya Test', email: 'maya@school.test' }).ok, true);
  assert.deepEqual(env.post({ lot: 9, amount: 20, name: 'Maya Test', email: 'MAYA@school.test ' }), {
    ok: false,
    error: 'too_low',
    nextMin: 21,
    top: 20,
    yours: true,
  });
  assert.equal(env.post({ lot: 9, amount: 20, name: 'Kai Test', email: 'kai@school.test' }).yours, false);
  assert.equal(env.sheet()!.rows.length, 2, 'only the first one was saved');
});

test('voided rows no longer count toward the top bid', () => {
  const env = ready();
  env.post({ lot: 7, amount: 900, name: 'Joke Bid', email: 'joke@x.test' });
  env.sheet()!.rows[1]![6] = 'x';
  assert.equal(env.post({ lot: 7, amount: 10, name: 'Real Bid', email: 'real@x.test' }).ok, true);
});

test('bids are refused before opening and after closing', () => {
  const env = ready();
  assert.equal(env.post({ lot: 1, amount: 5, name: 'Early Bird', email: 'e@x.test', opensAt: NOW + HOUR }).error, 'not_open');
  assert.equal(env.post({ lot: 1, amount: 5, name: 'Late Bird', email: 'l@x.test', closesAt: NOW - 1 }).error, 'closed');
});

test('the feed shares only the number, amount, time and the short name, never emails', () => {
  const env = ready();
  env.post({ lot: 12, amount: 25, name: 'Maya Test', email: 'maya@school.test' });
  env.post({ lot: 12, amount: 30, name: 'Kai Test', email: 'kai@school.test' });
  env.post({ lot: 33, amount: 8, name: 'Maya Test', email: 'MAYA@school.test' });
  env.sheet()!.rows.push([new Date(NOW - 1000), 'Walk In', '', '21', '', '$40', '', 'told me in person']);
  env.sheet()!.rows.push([new Date(NOW - 900), 'Removed', 'r@x.test', 21, '', 99, 'x', '']);
  env.sheet()!.rows.push([new Date(NOW - 800), 'No Amount', 'n@x.test', 21, '', '', '', '']);
  const data = env.feed();
  assert.equal(data.ok, true);
  assert.deepEqual(
    data.bids.map((b: Record<string, unknown>) => [b.lot, b.amount, b.name]),
    [
      [21, 40, 'Walk I.'],
      [12, 25, 'Maya T.'],
      [12, 30, 'Kai T.'],
      [33, 8, 'Maya T.'],
    ],
    'sorted by time; voided and incomplete rows left out',
  );
  assert.equal(data.bids[1].k, data.bids[3].k, 'the same email is the same bidder');
  assert.ok(!JSON.stringify(data).includes('@'), 'no email addresses are shared');
  assert.ok(env.cache.has('bids:v4'), 'the answer is cached briefly');
});

test('the site’s nameStyle setting reaches the feed', () => {
  const env = ready();
  env.post({ lot: 1, amount: 5, name: 'First Person', email: 'a@x.test', nameStyle: 'full' });
  assert.equal(env.feed().bids[0].name, 'First Person');
  env.cache.clear();
  const res = env.post({ lot: 1, amount: 6, name: 'Second Person', email: 'b@x.test', nameStyle: 'number' });
  assert.equal(res.bid.name, 'Bidder 2');
  env.cache.clear();
  assert.deepEqual(
    env.feed().bids.map((b: { name: string }) => b.name),
    ['Bidder 1', 'Bidder 2'],
  );
});

test('a new bid clears the cached feed so it shows up on the next refresh', () => {
  const env = ready();
  env.feed();
  assert.ok(env.cache.has('bids:v4'));
  env.post({ lot: 1, amount: 5, name: 'Fresh Bid', email: 'f@x.test' });
  assert.equal(env.cache.has('bids:v4'), false);
});

test('a bid typed into the sheet by hand gets its time filled in', () => {
  const env = ready();
  const sheet = env.sheet()!;
  sheet.rows.push(['', 'Walk In', '', 12, '', 40, '', '']);
  env.call('onEdit', { range: sheet.getRange(2, 6) });
  assert.equal(Object.prototype.toString.call(sheet.rows[1]![0]), '[object Date]');
});

test('garbage requests get a clear error instead of a crash', () => {
  const env = ready();
  assert.equal(JSON.parse(env.call<{ body: string }>('doPost', { postData: { contents: 'not json' } }).body).error, 'bad_request');
  assert.equal(env.post({ lot: 'x', amount: 5, name: 'A B', email: 'a@x.test' }).error, 'bad_request');
});
