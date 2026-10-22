import { sentence, typo } from '../lib/format';
import { charity, config, fundraiserPhrase, siteName } from '../site';

/** Splits the fundraiser sentence so the charity's name can be a link. */
function FundraiserText() {
  if (!fundraiserPhrase) return <>{`${siteName}.`}</>;
  const text = `${siteName}, ${fundraiserPhrase}.`;
  if (!charity.name || !charity.url || !text.includes(charity.name)) return <>{text}</>;
  const [before, after] = text.split(charity.name);
  return (
    <>
      {before}
      <a className="text-link" href={charity.url} target="_blank" rel="noopener">
        {charity.name}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {after}
    </>
  );
}

export function Footer() {
  const organizer = config.organizer.trim();
  const contact = config.contact.trim();
  const logo = config.logos.full.trim();
  return (
    <footer className="footer">
      <div className="wrap footer__inner">
        {logo ? (
          <img
            className="footer__logo"
            src={logo}
            alt={config.logos.fullAlt.trim()}
            width="746"
            height="287"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="footer__text">
          <p className="footer__lead">
            <FundraiserText />
            {organizer ? ` Organized by ${organizer}.` : ''}
          </p>
          {contact ? <p>{typo(sentence(contact))}</p> : null}
          <p className="footer__note">
            Bids are placed on this page. It checks for new bids every 10 seconds.
          </p>
        </div>
      </div>
    </footer>
  );
}
