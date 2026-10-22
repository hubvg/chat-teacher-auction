import type { BidsPayload, RawBid } from '../types';

/** Defensive parsing of /api/bids so one malformed row can't break the page. */
export function sanitizeBid(raw: unknown): RawBid | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lot = Number(r.lot);
  const amount = Number(r.amount);
  const t = Number(r.t);
  if (!Number.isInteger(lot) || lot < 1 || lot > 9999) return null;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  if (!Number.isFinite(t) || t <= 0) return null;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : 'Anonymous';
  const k = typeof r.k === 'string' ? r.k.slice(0, 32) : '';
  return { lot, amount, name, k, t };
}

export function parsePayload(data: unknown): BidsPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.configured !== 'boolean' || !Array.isArray(d.bids)) return null;
  const bids: RawBid[] = [];
  for (const raw of d.bids.slice(0, 20_000)) {
    const bid = sanitizeBid(raw);
    if (bid) bids.push(bid);
  }
  return {
    configured: d.configured,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : null,
    stale: d.stale === true,
    bids,
  };
}

/** Cheap fingerprint so identical polls don't trigger a re-render. */
export function fingerprint(bids: RawBid[]): string {
  let t = 0;
  let amount = 0;
  let lots = 0;
  for (const b of bids) {
    t += b.t % 1_000_000;
    amount += b.amount;
    lots += b.lot;
  }
  return `${bids.length}:${t}:${amount.toFixed(2)}:${lots}`;
}

const sameBid = (a: RawBid, b: RawBid) => a.lot === b.lot && a.amount === b.amount && a.k === b.k;

/** The server's bids plus any bid this visitor just placed that the server hasn't sent back yet. */
export function mergeBids(server: RawBid[], local: RawBid[]): RawBid[] {
  if (!local.length) return server;
  const extra = local.filter((l) => !server.some((s) => sameBid(s, l)));
  return extra.length ? server.concat(extra) : server;
}

/** Forgets a just-placed bid once the server has it, or after two minutes. */
export function pruneLocal(local: RawBid[], server: RawBid[], now: number): RawBid[] {
  if (!local.length) return local;
  const kept = local.filter((l) => now - l.t < 120_000 && !server.some((s) => sameBid(s, l)));
  return kept.length === local.length ? local : kept;
}
