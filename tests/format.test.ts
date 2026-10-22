// Test inputs only. Nothing in this file is shown on the site.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countdown,
  countdownSpoken,
  dateRange,
  longDateTime,
  money,
  plural,
  sentence,
  shortDate,
  timeAgo,
  typo,
} from '../src/lib/format';

test('money', () => {
  assert.equal(money(0), '$0');
  assert.equal(money(45), '$45');
  assert.equal(money(1240), '$1,240');
  assert.equal(money(12.5), '$12.50');
  assert.equal(money(1234567.891), '$1,234,567.89');
});

test('dates read the wall clock exactly as written', () => {
  assert.equal(longDateTime('2026-10-30T15:00:00-04:00'), 'Friday, October 30 at 3 p.m.');
  assert.equal(longDateTime('2026-11-02T08:30:00-05:00'), 'Monday, November 2 at 8:30 a.m.');
  assert.equal(longDateTime('2026-10-26T00:00:00-04:00'), 'Monday, October 26 at 12 a.m.');
  assert.equal(longDateTime('2026-10-26T12:15:00-04:00'), 'Monday, October 26 at 12:15 p.m.');
  assert.equal(shortDate('2026-10-30T15:00:00-04:00'), 'Fri, Oct 30');
  assert.equal(dateRange('2026-10-26T08:00:00-04:00', '2026-10-30T15:00:00-04:00'), 'October 26 to 30');
  assert.equal(dateRange('2026-10-29T08:00:00-04:00', '2026-11-02T15:00:00-05:00'), 'October 29 to November 2');
});

test('countdown', () => {
  const d = 86_400_000;
  const h = 3_600_000;
  const m = 60_000;
  assert.equal(countdown(2 * d + 4 * h + 13 * m + 59_000), '2d 04h 13m');
  assert.equal(countdown(3 * h + 7 * m + 42_000), '3h 07m 42s');
  assert.equal(countdown(6 * m + 9_000), '6m 09s');
  assert.equal(countdown(-5000), '0m 00s');
  assert.equal(countdownSpoken(2 * d + 4 * h + 13 * m), '2 days, 4 hours');
  assert.equal(countdownSpoken(h + m), '1 hour, 1 minute');
  assert.equal(countdownSpoken(30_000), 'less than a minute');
});

test('timeAgo', () => {
  const now = 1_000_000_000_000;
  assert.equal(timeAgo(now - 3_000, now), 'just now');
  assert.equal(timeAgo(now - 42_000, now), '42s ago');
  assert.equal(timeAgo(now - 5 * 60_000, now), '5 min ago');
  assert.equal(timeAgo(now - 2 * 3_600_000, now), '2 h ago');
});

test('small text helpers', () => {
  assert.equal(plural(1, 'bid'), '1 bid');
  assert.equal(plural(1200, 'bid'), '1,200 bids');
  assert.equal(plural(2, 'activity', 'activities'), '2 activities');
  assert.equal(sentence('Closes at 3 p.m.'), 'Closes at 3 p.m.');
  assert.equal(sentence('Closes soon'), 'Closes soon.');
  assert.equal(typo(`It's a "test"`), 'It’s a “test”');
});
