import type { MouseEvent } from 'react';
import type { Phase } from '../App';
import { shortDate } from '../lib/format';
import type { Connection } from '../lib/useLiveBids';
import { config, schoolShort } from '../site';
import { Paddle } from './Paddle';

/**
 * Scrolls back to the top of the page without reloading it. Smooth, unless the
 * visitor has asked for reduced motion (the CSS sets that). Ctrl- or Cmd-clicks
 * are left alone so "open in new tab" still works.
 */
function scrollToTop(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.scrollTo({ top: 0 });
  if (window.location.hash) {
    try {
      // Drop a leftover #how-to-bid so a refresh also starts at the top.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    } catch {
      // Some embedded previews don't allow history changes; scrolling is what matters.
    }
  }
}

/**
 * The school logo and name: the full name on wider screens, the nickname on phones
 * (where the full name would get cut off). On the auction page it scrolls back to
 * the top; on the 404 page it links to the home page.
 */
export function Brand({ toTop = false }: { toTop?: boolean }) {
  const full = config.schoolName.trim() || config.title;
  const short = schoolShort && schoolShort !== full ? schoolShort : null;
  const where = toTop ? 'back to top' : 'home';
  return (
    <a className="brand" href={toTop ? '#top' : '/'} onClick={toTop ? scrollToTop : undefined}>
      {config.logos.mark.trim() ? (
        <img className="brand__logo" src={config.logos.mark.trim()} alt="" width="36" height="36" decoding="async" />
      ) : (
        <span className="brand__mark">
          <Paddle />
        </span>
      )}
      <span className={short ? 'brand__name brand__name--full' : 'brand__name'}>{full}</span>
      {short ? (
        <span className="brand__name brand__name--short" aria-hidden="true">
          {short}
        </span>
      ) : null}
      <span className="sr-only">{config.schoolName.trim() ? ` ${config.title}, ${where}` : `, ${where}`}</span>
    </a>
  );
}

function statusFor(phase: Phase, connection: Connection): { tone: 'live' | 'idle' | 'warn'; label: string } {
  if (phase === 'unscheduled') return { tone: 'idle', label: 'Dates coming soon' };
  if (phase === 'closed') return { tone: 'idle', label: 'Bidding closed' };
  if (phase === 'upcoming') return { tone: 'idle', label: `Opens ${shortDate(config.opensAt)}` };
  if (phase === 'unknown' || connection === 'connecting') return { tone: 'idle', label: 'Connecting' };
  if (connection === 'unconfigured') return { tone: 'idle', label: 'Not connected yet' };
  if (connection === 'reconnecting') return { tone: 'warn', label: 'Reconnecting' };
  return { tone: 'live', label: 'Live' };
}

export function TopBar({ phase, connection }: { phase: Phase; connection: Connection }) {
  const status = statusFor(phase, connection);
  return (
    <header className="topbar">
      <div className="wrap topbar__inner">
        <Brand toTop />
        <div className="topbar__end">
          <p className={`status status--${status.tone}`}>
            <span className="status__dot" aria-hidden="true" />
            {status.label}
          </p>
          {phase === 'open' || phase === 'unknown' ? (
            <a className="btn btn--solid btn--sm topbar__cta" href="#activities">
              Place a bid
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
