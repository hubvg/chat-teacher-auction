// Everything a crawler, a link preview or an AI assistant reads: head tags,
// structured data, robots.txt, sitemap.xml, llms.txt, the web manifest and the
// activity list the Apps Script reads. All of it is generated from config.ts at build time.
import { money, sentence } from './lib/format';
import { activities, charity, closeLabel, config, fundraiserPhrase, openLabel, shortSiteName, siteName } from './site';

export type PageKind = 'home' | 'notFound';

export interface HeadOptions {
  /** Absolute origin, no trailing slash: https://auction.vercel.app */
  siteUrl: string;
  page: PageKind;
  /** Font files to preload. */
  preloads?: string[];
  /** Path prefix for static files. "/" in production. */
  base?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeXml = (value: string) => escapeHtml(value).replace(/'/g, '&apos;');

/** JSON that is safe to drop inside a <script> tag. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

export function pageTitle(page: PageKind): string {
  if (page === 'notFound') return `Page not found | ${config.title}`;
  return config.schoolName.trim() ? `${config.title} | ${config.schoolName.trim()}` : config.title;
}

/** Built only from what the config actually says; parts that aren't filled in are left out. */
export function metaDescription(): string {
  if (config.description?.trim()) return config.description.trim();
  const parts = [
    fundraiserPhrase ? `The ${siteName}, ${fundraiserPhrase}.` : `The ${siteName}.`,
    `See the top bid and who has it on all ${activities.length} activities, updated automatically.`,
  ];
  if (closeLabel) parts.push(sentence(`Bidding closes ${closeLabel}`));
  return parts.filter(Boolean).join(' ');
}

export function ogImageAlt(): string {
  const parts = [fundraiserPhrase ? `${siteName}, ${fundraiserPhrase}.` : `${siteName}.`];
  if (closeLabel) parts.push(sentence(`Bidding closes ${closeLabel}`));
  return parts.join(' ');
}

export function structuredData(siteUrl: string) {
  const url = `${siteUrl}/`;
  const graph: object[] = [
    {
      '@type': 'WebSite',
      '@id': `${url}#website`,
      url,
      name: siteName,
      ...(shortSiteName ? { alternateName: shortSiteName } : {}),
      inLanguage: 'en-CA',
    },
  ];
  // An Event needs real dates, so it is only described once they're set.
  if (config.opensAt.trim() && config.closesAt.trim()) {
    graph.push({
      '@type': 'Event',
      '@id': `${url}#event`,
      name: siteName,
      description: metaDescription(),
      url,
      image: [`${siteUrl}/og.png`],
      startDate: config.opensAt.trim(),
      endDate: config.closesAt.trim(),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url },
      ...(config.schoolName.trim() ? { organizer: { '@type': 'Organization', name: config.schoolName.trim() } } : {}),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function renderHead({ siteUrl, page, preloads = [], base = '/' }: HeadOptions): string {
  const url = `${siteUrl}/`;
  const title = pageTitle(page);
  const description =
    page === 'home' ? metaDescription() : 'There is nothing at this address. The live teacher auction is on the home page.';

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    page === 'home' ? `<link rel="canonical" href="${escapeHtml(url)}">` : '<meta name="robots" content="noindex">',
    '<meta name="theme-color" content="#f6f6f3" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#131416" media="(prefers-color-scheme: dark)">',
    `<link rel="icon" href="${base}favicon.ico" sizes="32x32">`,
    `<link rel="icon" href="${base}icon-192.png" type="image/png" sizes="192x192">`,
    `<link rel="apple-touch-icon" href="${base}apple-touch-icon.png">`,
    `<link rel="manifest" href="${base}site.webmanifest">`,
    ...preloads.map((href) => `<link rel="preload" href="${escapeHtml(href)}" as="font" type="font/woff2" crossorigin>`),
  ];

  if (page === 'home') {
    tags.push(
      '<meta property="og:type" content="website">',
      `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
      '<meta property="og:locale" content="en_CA">',
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      `<meta property="og:url" content="${escapeHtml(url)}">`,
      `<meta property="og:image" content="${escapeHtml(`${siteUrl}/og.png`)}">`,
      '<meta property="og:image:type" content="image/png">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta property="og:image:alt" content="${escapeHtml(ogImageAlt())}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<script type="application/ld+json">${scriptJson(structuredData(siteUrl))}</script>`,
    );
  }
  return tags.join('\n    ');
}

export function robotsTxt(siteUrl: string): string {
  return [
    `# ${siteName}`,
    '# Search engines and AI crawlers are welcome. The live bid feed under /api/',
    '# is left out so bidder names stay out of search indexes.',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(siteUrl: string, lastmod: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${escapeXml(siteUrl)}/</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');
}

export function llmsTxt(siteUrl: string): string {
  const school = config.schoolName.trim();
  const nickname = config.schoolNickname.trim();
  const about = [
    school && nickname && nickname !== school ? `${school} is also called ${nickname}.` : '',
    fundraiserPhrase ? `The auction is ${fundraiserPhrase}.` : '',
    config.fundraiser.name.trim() && config.fundraiser.cause.trim()
      ? `${config.fundraiser.name.trim()} raises money for ${config.fundraiser.cause.trim()}.`
      : '',
    'Bids are placed on the site itself: pick an activity, press Bid, and enter an amount, name and email.',
    'The site shows the top bid and who has it on every activity, and checks for new bids every 10 seconds.',
    openLabel && closeLabel ? sentence(`Bidding opens ${openLabel} and closes ${closeLabel}`) : 'Bidding dates have not been announced yet.',
    `Each new bid must beat the top bid on its activity by at least ${money(config.minIncrement)}.`,
    config.payment.trim() ? sentence(config.payment.trim()) : '',
  ];
  const lines: string[] = [
    `# ${siteName}`,
    '',
    `> ${metaDescription()}`,
    '',
    about.filter(Boolean).join(' '),
    '',
    '## Activities',
    '',
    ...activities.map((a) => {
      const start = a.startingBid !== undefined ? ` Starting bid ${money(a.startingBid)}.` : '';
      return `- [#${a.lot} ${a.name.replace(/\s+/g, ' ').trim()}](${siteUrl}/#lot-${a.lot})${start}`;
    }),
    '',
    '## Bidding',
    '',
    `- [Live auction board](${siteUrl}/): the top bid, who has it and the number of bids on every activity, plus the time left once dates are set.`,
    `- [How bidding works](${siteUrl}/#how-to-bid): how to place a bid, what counts as a valid bid, ties, and the closing time.`,
  ];
  if (charity.name && charity.url) {
    lines.push('', '## Where the money goes', '', `- [${charity.name}](${charity.url}): the charity that receives the money raised.`);
  }
  lines.push('');
  return lines.join('\n');
}

/** "CHAT Auction": the nickname plus the last word of the title, if that fits in 12 characters. */
export function homeScreenLabel(): string {
  const title = config.title.trim();
  const lastWord = title.split(/\s+/).pop() ?? title;
  const nickname = config.schoolNickname.trim();
  const options = [nickname ? `${nickname} ${lastWord}` : '', title, nickname, lastWord];
  return options.find((o) => o && o.length <= 12) ?? lastWord.slice(0, 12);
}

export function webManifest(base = '/'): string {
  return `${JSON.stringify(
    {
      name: siteName,
      // The label under a home-screen icon; about 12 characters fit.
      short_name: homeScreenLabel(),
      description: metaDescription(),
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#f6f6f3',
      theme_color: '#ff6fae',
      icons: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  )}\n`;
}

/** The activity list as data, for anything that wants it (numbers and exact names). */
export function activitiesJson(): string {
  return `${JSON.stringify({ activities: activities.map((a) => ({ lot: a.lot, name: a.name })) }, null, 2)}\n`;
}
