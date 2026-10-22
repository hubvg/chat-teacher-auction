// The 1200x630 link-preview image (og:image), drawn at build time with Satori.
// Satori supports a subset of CSS, so this uses inline styles and flexbox only.
// It only prints what the config says: no school name, fundraiser or date until they're set.
import { sentence } from './lib/format';
import { closeLabel, config, fundraiserPhrase } from './site';

const PINK = '#ff6fae';
const SCHOOL = '#075087';
const NAVY = '#042d4e';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** @param logo the school's square logo as a data: URL, or undefined to leave it out. */
export function ogCard(logo?: string) {
  const title = config.title;
  const school = config.schoolName.trim();
  const size = title.length <= 16 ? 188 : title.length <= 24 ? 150 : 112;
  const status = closeLabel ? sentence(`Live bids. Closes ${closeLabel}`) : 'Live bids. Dates coming soon.';

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: PINK,
        color: NAVY,
        fontFamily: 'Archivo',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', padding: '46px 72px 0', flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 32, fontWeight: 600 }}>
          {logo ? <img src={logo} width={64} height={64} style={{ borderRadius: 10, marginRight: school ? 20 : 0 }} /> : null}
          {school ? <span>{school}</span> : null}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontFamily: 'Archivo Condensed',
            fontWeight: 800,
            fontSize: size,
            lineHeight: 0.84,
            letterSpacing: -2,
            textTransform: 'uppercase',
            color: SCHOOL,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 28 }}>
          {fundraiserPhrase ? (
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 600 }}>{`${capitalize(fundraiserPhrase)}.`}</div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, marginTop: fundraiserPhrase ? 6 : 0 }}>{status}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexShrink: 0, height: 16, backgroundColor: SCHOOL }} />
      <div style={{ display: 'flex', flexShrink: 0, height: 14 }} />
      <div style={{ display: 'flex', flexShrink: 0, height: 16, backgroundColor: SCHOOL }} />
      <div style={{ display: 'flex', flexShrink: 0, height: 28 }} />
    </div>
  );
}
