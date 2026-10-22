import type { Phase } from '../App';
import type { AuctionState } from '../lib/auction';
import { shortDate, typo } from '../lib/format';
import type { LiveBids } from '../lib/useLiveBids';
import { config } from '../site';
import { LatestBid } from './LatestBid';

interface Props {
  phase: Phase;
  now: number | null;
  auction: AuctionState;
  live: LiveBids;
}

export function Hero({ phase, now, auction, live }: Props) {
  return (
    <section className="hero" aria-labelledby="page-title">
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <h1 id="page-title" className="hero__title">
            {config.title}
          </h1>
          {config.tagline.trim() ? <p className="hero__tagline">{typo(config.tagline.trim())}</p> : null}
          <div className="hero__actions">
            {/* The slot always holds a button so the layout doesn't jump once the visitor's time is known. */}
            {phase === 'unscheduled' ? (
              <span className="btn btn--lg btn--waiting" aria-disabled="true">
                Bidding hasn’t opened
              </span>
            ) : phase === 'upcoming' ? (
              <span className="btn btn--lg btn--waiting" aria-disabled="true">
                Opens {shortDate(config.opensAt)}
              </span>
            ) : (
              <a className="btn btn--ink btn--lg" href="#activities">
                {phase === 'closed' ? 'See the winners' : 'Pick an activity'}
              </a>
            )}
            <a className="hero__link" href="#how-to-bid">
              How bidding works
            </a>
          </div>
        </div>
        <LatestBid phase={phase} now={now} auction={auction} live={live} />
      </div>
      <div className="rails" aria-hidden="true" />
    </section>
  );
}
