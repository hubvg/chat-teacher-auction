import { useCallback, useMemo, useState } from 'react';
import { Activities } from './components/Activities';
import { BidDialog } from './components/BidDialog';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { TopBar } from './components/TopBar';
import { computeAuction } from './lib/auction';
import { useLiveBids } from './lib/useLiveBids';
import { useNow } from './lib/useNow';
import { activities, rules, schedule, scheduled } from './site';

/**
 * "unscheduled": the config has no dates yet, so no bids count.
 * "unknown": the prerendered state, because the server can't know the visitor's time.
 */
export type Phase = 'unscheduled' | 'unknown' | 'upcoming' | 'open' | 'closed';

export function App() {
  const now = useNow();
  const live = useLiveBids(schedule.closesAt);
  const auction = useMemo(() => computeAuction(activities, live.bids, rules), [live.bids]);
  const [bidLot, setBidLot] = useState<number | null>(null);
  const closeBid = useCallback(() => setBidLot(null), []);

  let phase: Phase;
  if (!scheduled) phase = 'unscheduled';
  else if (now === null) phase = 'unknown';
  else if (now < rules.opensAt) phase = 'upcoming';
  else if (now <= rules.closesAt) phase = 'open';
  else phase = 'closed';

  return (
    <>
      <a className="skip-link" href="#activities">
        Skip to the activities
      </a>
      <TopBar phase={phase} connection={live.connection} />
      <main id="main">
        <Hero phase={phase} now={now} auction={auction} live={live} />
        <Activities
          lots={auction.lots}
          phase={phase}
          loaded={live.loaded}
          connected={live.connection !== 'unconfigured'}
          onBid={setBidLot}
        />
        <HowItWorks />
      </main>
      <Footer />
      <BidDialog
        lot={bidLot === null ? null : (auction.lots.find((l) => l.activity.lot === bidLot) ?? null)}
        phase={phase}
        onClose={closeBid}
        onPlaced={live.addBid}
      />
    </>
  );
}
