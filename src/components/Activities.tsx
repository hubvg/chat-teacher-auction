import { useMemo, useState } from 'react';
import type { Phase } from '../App';
import type { LotState } from '../lib/auction';
import { shortDate } from '../lib/format';
import { config } from '../site';
import { ActivityRow } from './ActivityRow';

type SortKey = 'lot' | 'high' | 'most' | 'none';

const SORTS: Array<[SortKey, string]> = [
  ['lot', 'List order'],
  ['high', 'Highest bid'],
  ['most', 'Most bids'],
  ['none', 'No bids yet'],
];

/** Lowercase, no accents or punctuation, so "Fabrizi's pizza" finds "Pizza-making with Mr. Fabrizi". */
const simplify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function matches(lot: LotState, query: string): boolean {
  const q = simplify(query);
  if (!q) return true;
  const number = /^#?\s*(\d+)$/.exec(query.trim());
  if (number) return lot.activity.lot === Number(number[1]);
  const name = simplify(lot.activity.name);
  return q.split(' ').every((word) => name.includes(word));
}

interface Props {
  lots: LotState[];
  phase: Phase;
  loaded: boolean;
  connected: boolean;
  onBid: (lot: number) => void;
}

export function Activities({ lots, phase, loaded, connected, onBid }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('lot');

  const visible = useMemo(() => {
    const list = lots.filter((lot) => matches(lot, query));
    const byLot = (a: LotState, b: LotState) => a.activity.lot - b.activity.lot;
    if (sort === 'high') list.sort((a, b) => (b.top?.amount ?? 0) - (a.top?.amount ?? 0) || byLot(a, b));
    else if (sort === 'most') list.sort((a, b) => b.count - a.count || byLot(a, b));
    else if (sort === 'none') list.sort((a, b) => a.count - b.count || byLot(a, b));
    else list.sort(byLot);
    return list;
  }, [lots, query, sort]);

  let status = '';
  if (phase === 'unscheduled') status = 'Bidding dates coming soon';
  else if (phase === 'upcoming') status = `Bidding opens ${shortDate(config.opensAt)}`;
  else if (phase === 'closed') status = 'Bidding is closed';

  return (
    <section className="acts" id="activities" aria-labelledby="activities-title">
      <div className="wrap">
        <div className="acts__head">
          <div>
            <h2 className="section-title" id="activities-title">
              Activities
            </h2>
            <p className="acts__count">
              {query.trim() ? `Showing ${visible.length} of ${lots.length}` : `${lots.length} activities`}
              {status ? ` · ${status}` : ''}
            </p>
          </div>
          <div className="toolbar">
            <label className="field field--grow">
              <span className="field__label">Find an activity</span>
              <input
                className="input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, teacher or #"
                autoComplete="off"
                enterKeyHint="search"
              />
            </label>
            <label className="field">
              <span className="field__label">Sort by</span>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map(([key, text]) => (
                  <option key={key} value={key}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {visible.length ? (
          <ol className="acts__list">
            {visible.map((lot) => (
              <ActivityRow
                key={lot.activity.lot}
                lot={lot}
                phase={phase}
                loaded={loaded}
                connected={connected}
                onBid={onBid}
              />
            ))}
          </ol>
        ) : (
          <div className="empty">
            <p>No activity matches “{query.trim()}”.</p>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => setQuery('')}>
              Clear the search
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
