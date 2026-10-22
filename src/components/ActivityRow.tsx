import type { ReactNode } from 'react';
import type { Phase } from '../App';
import type { LotState } from '../lib/auction';
import { money, plural } from '../lib/format';
import { useChangeCount } from '../lib/useChangeCount';
import { Skeleton } from './LatestBid';

interface Props {
  lot: LotState;
  phase: Phase;
  loaded: boolean;
  /** False when the site isn't connected to the bids sheet yet, so there are no bids to report. */
  connected: boolean;
  /** Opens the bid form for this activity. */
  onBid: (lot: number) => void;
}

/** One activity: its number and exact name, the top bid and who has it, and a Bid button. */
export function ActivityRow({ lot, phase, loaded, connected, onBid }: Props) {
  const { activity, top, count, nextMin } = lot;
  const changes = useChangeCount(top?.id ?? null, loaded);
  const closed = phase === 'closed';
  const open = phase === 'open' || phase === 'unknown';
  const known = loaded && connected;

  let label = 'Starting bid';
  let amount = money(nextMin);
  if (known && top) {
    label = closed ? 'Winning bid' : 'Top bid';
    amount = money(top.amount);
  } else if (known && closed) {
    label = 'No bids';
    amount = ' ';
  }

  let leader: ReactNode = null;
  if (!loaded) leader = <Skeleton size="sm" />;
  else if (known && top) leader = closed ? `Won by ${top.name}` : top.name;
  else if (known && !closed) leader = 'No bids yet';

  return (
    <li className="act" id={`lot-${activity.lot}`}>
      <h3 className="act__name">
        <span className="act__num">#{activity.lot}</span> {activity.name}
      </h3>
      <div className="act__price">
        <p className="act__label">
          {label}
          {known && count ? ` · ${plural(count, 'bid')}` : ''}
        </p>
        <p className="act__amount">
          {changes > 0 ? <span key={changes} className="swipe" aria-hidden="true" /> : null}
          <span className={loaded ? 'act__figure' : 'act__figure act__figure--pending'}>{amount}</span>
        </p>
        <p className="act__leader">{leader}</p>
      </div>
      <div className="act__action">
        {open && connected ? (
          <button type="button" className="btn btn--solid act__btn" onClick={() => onBid(activity.lot)}>
            Bid {money(nextMin)}+<span className="sr-only"> on {activity.name.trim()}</span>
          </button>
        ) : open ? (
          <span className="act__off">Bidding isn’t set up yet</span>
        ) : null}
      </div>
    </li>
  );
}
