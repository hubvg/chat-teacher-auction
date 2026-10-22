import { useEffect, useState, type ReactNode } from 'react';
import type { Phase } from '../App';
import type { AuctionState } from '../lib/auction';
import {
  clockTime,
  countdown,
  countdownSpoken,
  money,
  plural,
  shortDate,
  shortDateTime,
  timeAgo,
  wallClock,
} from '../lib/format';
import { useChangeCount } from '../lib/useChangeCount';
import type { LiveBids } from '../lib/useLiveBids';
import { activities, closeLabel, config, schedule } from '../site';

interface Props {
  phase: Phase;
  now: number | null;
  auction: AuctionState;
  live: LiveBids;
}

function clock(phase: Phase, now: number | null) {
  if (phase === 'unscheduled') {
    return { label: 'Bidding dates', value: 'TBA', spoken: 'To be announced', sub: 'Check back soon', urgent: false };
  }
  if (phase === 'unknown' || now === null || schedule.opensAt === null || schedule.closesAt === null) {
    const close = wallClock(config.closesAt);
    return {
      label: 'Bidding closes',
      value: shortDate(config.closesAt),
      spoken: closeLabel ?? '',
      sub: `at ${clockTime(close.hour, close.minute)}`,
      urgent: false,
    };
  }
  // The short date style keeps these captions to two lines, the space reserved for them, even on small phones.
  if (phase === 'upcoming') {
    const left = schedule.opensAt - now;
    return {
      label: 'Bidding opens in',
      value: countdown(left),
      spoken: countdownSpoken(left),
      sub: shortDateTime(config.opensAt),
      urgent: false,
    };
  }
  if (phase === 'open') {
    const left = schedule.closesAt - now;
    const urgent = left < 3_600_000;
    return {
      label: urgent ? 'Closing soon' : 'Closes in',
      value: countdown(left),
      spoken: countdownSpoken(left),
      sub: shortDateTime(config.closesAt),
      urgent,
    };
  }
  return {
    label: 'Bidding closed',
    value: 'Final',
    spoken: 'Final results',
    sub: `Closed ${shortDateTime(config.closesAt)}`,
    urgent: false,
  };
}

export function Skeleton({ size }: { size: 'sm' | 'md' | 'lg' }) {
  return <span className={`skeleton skeleton--${size}`} aria-hidden="true" />;
}

/**
 * The newest bid on any activity: how much, who, and on what. It changes every
 * time someone takes the lead somewhere, with a flash and a screen-reader announcement.
 */
export function LatestBid({ phase, now, auction, live }: Props) {
  const { latest, pledged, bidCount, bidderCount } = auction;
  const loaded = live.loaded;
  const connected = loaded && live.connection !== 'unconfigured';
  const closed = phase === 'closed';
  const notOpen = phase === 'unscheduled' || phase === 'upcoming';
  const changes = useChangeCount(latest?.id ?? null, loaded);
  const activity = latest ? activities.find((a) => a.lot === latest.lot) : undefined;
  const c = clock(phase, now);

  // Announced to screen readers when a new bid lands (not on the first load).
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (changes > 0 && latest && activity) {
      setAnnouncement(`New bid: ${money(latest.amount)} by ${latest.name} on ${activity.name.trim()}.`);
    }
    // Runs only when a new bid lands; latest and activity come from that same render.
  }, [changes]);

  let label = closed ? 'Last bid' : 'Latest bid';
  let figure: ReactNode;
  let who: ReactNode = null;
  let what: ReactNode = null;
  if (!loaded) {
    figure = <Skeleton size="lg" />;
    who = <Skeleton size="md" />;
  } else if (!connected) {
    figure = <span className="live__note">Not connected yet</span>;
    who = 'New bids will show here.';
  } else if (notOpen) {
    figure = <span className="live__note">Not open yet</span>;
    who = phase === 'upcoming' ? `Bidding opens ${shortDate(config.opensAt)}.` : 'Bids count once bidding opens.';
  } else if (latest && activity) {
    figure = (
      <span key={changes} className={changes ? 'live__figure is-new' : 'live__figure'}>
        {money(latest.amount)}
      </span>
    );
    who = (
      <>
        <strong className="live__name">{latest.name}</strong> {closed ? 'won' : 'took the lead'}
        {!closed && now !== null ? <span className="live__ago"> · {timeAgo(latest.t, now)}</span> : null}
      </>
    );
    what = (
      <a className="live__activity" href={`#lot-${activity.lot}`}>
        <span className="live__lot">#{activity.lot}</span> {activity.name}
      </a>
    );
  } else if (closed) {
    label = 'Bidding closed';
    figure = <span className="live__note">No bids</span>;
    who = 'Nobody placed a bid.';
  } else {
    figure = <span className="live__note">No bids yet</span>;
    who = 'Pick an activity below and be the first.';
  }

  const pledgedValue = !loaded ? (
    <Skeleton size="sm" />
  ) : connected ? (
    money(pledged)
  ) : (
    <span className="live__stat-note">Not connected</span>
  );
  let pledgedSub = closed ? 'Sum of the winning bids' : 'Sum of the top bids';
  if (connected && notOpen) pledgedSub = 'Counts once bidding opens';

  let note = 'Loading the latest bids';
  let warn = false;
  if (loaded && live.connection === 'unconfigured') note = 'Live bids are not connected yet.';
  else if (loaded && live.connection === 'reconnecting') {
    note = 'Can’t reach the bid server. Retrying.';
    warn = true;
  } else if (loaded) note = bidCount ? `${plural(bidCount, 'bid')} from ${plural(bidderCount, 'bidder')}` : 'No bids yet';

  let updated = '';
  if (connected && live.connection === 'live' && live.receivedAt !== null && now !== null) {
    updated = `Updated ${timeAgo(live.receivedAt, now)}`;
  }

  return (
    <section className="live" id="latest-bid" aria-labelledby="live-title">
      <h2 className="sr-only" id="live-title">
        Latest bid
      </h2>
      <div className="live__lead">
        {changes > 0 ? <span key={changes} className="live__flash" aria-hidden="true" /> : null}
        <p className="live__label">{label}</p>
        <p className="live__amount">{figure}</p>
        <p className="live__who">{who}</p>
        <p className="live__what">{what}</p>
      </div>
      <div className="live__stats">
        <div className={`live__stat${c.urgent ? ' is-urgent' : ''}`}>
          <p className="live__stat-label">{c.label}</p>
          <p className="live__stat-value">
            <span aria-hidden="true">{c.value}</span>
            <span className="sr-only">{c.spoken}</span>
          </p>
          <p className="live__stat-sub">{c.sub}</p>
        </div>
        <div className="live__stat">
          <p className="live__stat-label">{closed ? 'Total pledged' : 'Pledged so far'}</p>
          <p className="live__stat-value">{pledgedValue}</p>
          <p className="live__stat-sub">{pledgedSub}</p>
        </div>
      </div>
      <div className="live__foot">
        <p className={warn ? 'live__next is-warn' : 'live__next'}>{note}</p>
        <p className="live__updated">{updated}</p>
      </div>
      <p className="sr-only" role="status" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
