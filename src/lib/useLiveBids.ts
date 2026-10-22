import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RawBid } from '../types';
import { fingerprint, mergeBids, parsePayload, pruneLocal } from './sanitize';

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'unconfigured';

export interface LiveBids {
  bids: RawBid[];
  connection: Connection;
  /** When this browser last received data (ms), or null before the first load. */
  receivedAt: number | null;
  loaded: boolean;
  /** Shows a bid this visitor just placed right away, before the next refresh brings it back from the server. */
  addBid: (bid: RawBid) => void;
}

type FeedState = Omit<LiveBids, 'addBid'>;

const INITIAL: FeedState = { bids: [], connection: 'connecting', receivedAt: null, loaded: false };

/** Where bids come from. Always /api/bids on the real site. */
const ENDPOINT: string = import.meta.env.VITE_BIDS_ENDPOINT || '/api/bids';

/**
 * Polls the bid feed. Every 10 seconds normally, every 5 in the last 10 minutes,
 * once a minute after bidding closes. Pauses while the tab is hidden, backs off
 * when the server is unreachable, and honours Retry-After on HTTP 429.
 */
export function useLiveBids(closesAt: number | null, endpoint = ENDPOINT): LiveBids {
  const [state, setState] = useState<FeedState>(INITIAL);
  const [local, setLocal] = useState<RawBid[]>([]);
  const closesRef = useRef(closesAt);
  closesRef.current = closesAt;

  useEffect(() => {
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let failures = 0;
    let disposed = false;
    let lastPrint = '';

    const nextDelay = () => {
      if (closesRef.current === null) return 10_000;
      const left = closesRef.current - Date.now();
      if (left < -120_000) return 60_000;
      if (left < 10 * 60_000) return 5_000;
      return 10_000;
    };

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      if (!disposed) timer = window.setTimeout(poll, ms);
    };

    async function poll() {
      if (disposed || document.visibilityState === 'hidden') return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const res = await fetch(endpoint, {
          cache: 'no-store',
          signal: current.signal,
          headers: { accept: 'application/json' },
        });
        if (res.status === 429) {
          const wait = Math.min(120, Number(res.headers.get('retry-after')) || 30);
          setState((s) => (s.connection === 'reconnecting' ? s : { ...s, connection: 'reconnecting' }));
          schedule(wait * 1000);
          return;
        }
        const payload = res.ok ? parsePayload(await res.json()) : null;
        if (!payload) throw new Error(`Bids request failed with status ${res.status}`);

        failures = 0;
        const print = fingerprint(payload.bids);
        const changed = print !== lastPrint;
        lastPrint = print;
        const connection: Connection = payload.configured ? 'live' : 'unconfigured';
        setState((s) => ({
          bids: changed || !s.loaded ? payload.bids : s.bids,
          connection,
          receivedAt: Date.now(),
          loaded: true,
        }));
        setLocal((l) => pruneLocal(l, payload.bids, Date.now()));
        schedule(nextDelay());
      } catch {
        if (disposed || current.signal.aborted) return;
        failures += 1;
        setState((s) => (s.connection === 'reconnecting' ? s : { ...s, connection: 'reconnecting' }));
        const backoff = Math.min(60_000, 5_000 * 2 ** (failures - 1));
        schedule(backoff * (0.8 + Math.random() * 0.4));
      }
    }

    const resume = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') void poll();
    };

    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    void poll();

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [endpoint]);

  const addBid = useCallback((bid: RawBid) => setLocal((l) => [...l, bid]), []);
  const bids = useMemo(() => mergeBids(state.bids, local), [state.bids, local]);
  return useMemo(() => ({ ...state, bids, addBid }), [state, bids, addBid]);
}
