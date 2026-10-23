// Test inputs only. Nothing in this file is shown on the site.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAuction, type Rules } from '../src/lib/auction';
import type { Activity, RawBid } from '../src/types';

const activities: Activity[] = [
  { lot: 1, name: 'Test activity one', startingBid: 10 },
  { lot: 2, name: 'Test activity two' },
  { lot: 3, name: 'Test activity three', startingBid: 5 },
];

const OPEN = Date.parse('2026-10-26T08:00:00-04:00');
const CLOSE = Date.parse('2026-10-30T15:00:00-04:00');
const rules: Rules = { opensAt: OPEN, closesAt: CLOSE, minIncrement: 1 };

let clock = OPEN + 60_000;
const bid = (lot: number, amount: number, name = 'Bidder A', extra: Partial<RawBid> = {}): RawBid => ({
  lot,
  amount,
  name,
  k: name,
  t: (clock += 60_000),
  ...extra,
});

test('each activity keeps its own top bid and leader', () => {
  const s = computeAuction(activities, [bid(1, 10, 'Bidder A'), bid(2, 5, 'Bidder B'), bid(1, 15, 'Bidder C')], rules);
  assert.equal(s.lots[0]!.top?.amount, 15);
  assert.equal(s.lots[0]!.top?.name, 'Bidder C');
  assert.equal(s.lots[0]!.count, 2);
  assert.equal(s.lots[0]!.nextMin, 16);
  assert.equal(s.lots[1]!.top?.name, 'Bidder B');
  assert.equal(s.lots[2]!.top, null);
});

test('the starting bid is the minimum first bid; without one, any bid of one step counts', () => {
  const s = computeAuction(activities, [bid(1, 9, 'Too low'), bid(1, 10, 'Bidder B'), bid(2, 0.5), bid(2, 1, 'Bidder C')], rules);
  assert.equal(s.lots[0]!.top?.name, 'Bidder B');
  assert.equal(s.lots[1]!.top?.name, 'Bidder C');
  assert.equal(computeAuction(activities, [], rules).lots[2]!.nextMin, 5);
  assert.equal(computeAuction(activities, [], rules).lots[1]!.nextMin, 1);
});

test('a bid must beat the top bid by the step; ties go to whoever bid first', () => {
  const s = computeAuction(activities, [bid(2, 10, 'First'), bid(2, 10.5, 'Short'), bid(2, 10, 'Tie')], rules);
  assert.equal(s.lots[1]!.top?.name, 'First');
  assert.equal(s.lots[1]!.count, 1);
});

test('bids are replayed in the order the emails arrived, not array order', () => {
  const late = bid(2, 30, 'Late');
  const early = bid(2, 12, 'Early');
  early.t = late.t - 10_000;
  const s = computeAuction(activities, [late, early], rules);
  assert.equal(s.lots[1]!.top?.name, 'Late');
  assert.equal(s.lots[1]!.count, 2);
});

test('bids before opening or after closing are ignored; one exactly at closing counts', () => {
  const s = computeAuction(
    activities,
    [bid(2, 50, 'Early', { t: OPEN - 1 }), bid(2, 60, 'Late', { t: CLOSE + 1 }), bid(2, 10, 'Buzzer', { t: CLOSE })],
    rules,
  );
  assert.equal(s.lots[1]!.top?.name, 'Buzzer');
  assert.equal(s.bidCount, 1);
});

test('with no dates set, no bid counts', () => {
  const unscheduled: Rules = { opensAt: Number.POSITIVE_INFINITY, closesAt: Number.NEGATIVE_INFINITY, minIncrement: 1 };
  const s = computeAuction(activities, [bid(1, 10), bid(2, 20)], unscheduled);
  assert.equal(s.bidCount, 0);
  assert.equal(s.latest, null);
  assert.equal(s.pledged, 0);
});

test('bids for an activity number that does not exist are ignored', () => {
  const s = computeAuction(activities, [bid(99, 40)], rules);
  assert.equal(s.bidCount, 0);
});

test('latest bid, pledged total and bidder count', () => {
  const s = computeAuction(
    activities,
    [bid(1, 10, 'Bidder A'), bid(1, 12, 'Bidder B'), bid(2, 15, 'Bidder A'), bid(3, 5.5, 'Bidder A')],
    rules,
  );
  assert.equal(s.latest?.lot, 3);
  assert.equal(s.latest?.amount, 5.5);
  assert.equal(s.pledged, 12 + 15 + 5.5);
  assert.equal(s.bidCount, 4);
  assert.equal(s.bidderCount, 2);
});

test('activities keep config order', () => {
  assert.deepEqual(
    computeAuction(activities, [], rules).lots.map((l) => l.activity.lot),
    [1, 2, 3],
  );
});

test('the config starting bid applies unless an activity sets its own', () => {
  const withStart: Rules = { ...rules, startingBid: 25 };
  assert.deepEqual(
    computeAuction(activities, [], withStart).lots.map((l) => [l.activity.lot, l.nextMin]),
    [
      [1, 10],
      [2, 25],
      [3, 5],
    ],
  );
  const s = computeAuction(activities, [bid(2, 20, 'Under Start'), bid(2, 25, 'At Start')], withStart);
  assert.equal(s.lots[1]!.top?.name, 'At Start', 'a bid under the starting bid never counts');
});
