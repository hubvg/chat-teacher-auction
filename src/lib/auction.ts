import type { Activity, RawBid } from '../types';

export interface Rules {
  /** Bids before this time (ms) are ignored. Infinity while no date is set, so nothing counts. */
  opensAt: number;
  /** Bids after this time (ms) are ignored. */
  closesAt: number;
  /** How much each new bid must beat the top bid on an activity by, in dollars. */
  minIncrement: number;
}

export interface AcceptedBid {
  id: string;
  lot: number;
  amount: number;
  name: string;
  k: string;
  t: number;
  /** How much this bid beat the previous top bid by. 0 for the first bid on an activity. */
  raise: number;
}

export interface LotState {
  activity: Activity;
  top: AcceptedBid | null;
  /** Bids that counted on this activity. */
  count: number;
  /** The smallest bid that would count right now. */
  nextMin: number;
}

export interface AuctionState {
  /** One entry per activity, in config order. */
  lots: LotState[];
  /** The most recent bid that counted. Every counted bid took the lead on its activity. */
  latest: AcceptedBid | null;
  /** Sum of the current top bids: what the auction raises if every winner pays. */
  pledged: number;
  bidCount: number;
  bidderCount: number;
}

const roundCents = (n: number) => Math.round(n * 100) / 100;

/** The smallest bid that counts: the starting bid (or one step) before anyone bids, then the top bid plus one step. */
export function minimumBid(activity: Activity, top: AcceptedBid | null, rules: Rules): number {
  if (!top) return activity.startingBid ?? rules.minIncrement;
  return roundCents(top.amount + rules.minIncrement);
}

/**
 * Replays every bid in the order the emails arrived.
 * A bid counts only if it arrived while bidding was open and beats the top
 * bid on its activity by at least the minimum step (or meets the starting bid).
 * Ties go to whoever bid first, because the later equal bid doesn't beat it.
 */
export function computeAuction(activities: Activity[], bids: RawBid[], rules: Rules): AuctionState {
  const lots = new Map<number, LotState>();
  for (const activity of activities) {
    lots.set(activity.lot, { activity, top: null, count: 0, nextMin: minimumBid(activity, null, rules) });
  }

  const ordered = bids.slice().sort((a, b) => a.t - b.t);
  const bidders = new Set<string>();
  let latest: AcceptedBid | null = null;
  let bidCount = 0;

  for (const bid of ordered) {
    if (bid.t < rules.opensAt || bid.t > rules.closesAt) continue;
    const lot = lots.get(bid.lot);
    if (!lot) continue;
    if (bid.amount + 1e-9 < minimumBid(lot.activity, lot.top, rules)) continue;

    const entry: AcceptedBid = {
      id: `${bid.t}:${bid.k}:${bid.lot}:${bid.amount}`,
      lot: bid.lot,
      amount: roundCents(bid.amount),
      name: bid.name,
      k: bid.k,
      t: bid.t,
      raise: lot.top ? roundCents(bid.amount - lot.top.amount) : 0,
    };
    lot.top = entry;
    lot.count += 1;
    latest = entry;
    bidCount += 1;
    bidders.add(bid.k || bid.name);
  }

  let pledged = 0;
  for (const lot of lots.values()) {
    lot.nextMin = minimumBid(lot.activity, lot.top, rules);
    if (lot.top) pledged += lot.top.amount;
  }

  return {
    lots: activities.map((a) => lots.get(a.lot)!),
    latest,
    pledged: roundCents(pledged),
    bidCount,
    bidderCount: bidders.size,
  };
}
