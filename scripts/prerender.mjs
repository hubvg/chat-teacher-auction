// Runs after `vite build`. Writes real HTML (so "view source" shows the page),
// a static 404 page, robots.txt, sitemap.xml, llms.txt, the web manifest, the
// activity list for the Apps Script and the og:image, all generated from src/config.ts.
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, process.env.OUT_DIR || 'dist');
const base = process.env.BASE_PATH || '/';
const ssrDir = join(root, '.ssr');

const ssr = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href);

// 1. Check the config before writing anything.
const { errors, warnings } = ssr.validateConfig();
for (const warning of warnings) console.warn(`\n  ! ${warning}`);
if (errors.length) {
  console.error(`\nThe site was not built. Fix these in src/config.ts:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
  process.exit(1);
}

// 2. Work out the public address for canonical links, og:image and the sitemap.
function siteUrl() {
  const fromConfig = ssr.config.siteUrl?.trim();
  const raw = process.env.SITE_URL || fromConfig || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  if (!raw) {
    console.warn('\n  ! No site address found, using http://localhost:4173. On Vercel this is detected automatically.');
    return 'http://localhost:4173';
  }
  const url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  return url.origin;
}
const site = siteUrl();

// 3. Preload the main font file so headings don't jump when it arrives.
const assetDir = join(outDir, 'assets');
const assets = existsSync(assetDir) ? await readdir(assetDir) : [];
const font = assets.find((f) => /^archivo-latin-wdth-normal-.*\.woff2$/.test(f));
const preloads = font ? [`${base}assets/${font}`] : [];

// 4. HTML pages.
const template = await readFile(join(outDir, 'index.html'), 'utf8');
if (!template.includes('<!--app-head-->') || !template.includes('<!--app-html-->')) {
  throw new Error('index.html is missing the <!--app-head--> or <!--app-html--> placeholder.');
}

const home = template
  .replace('<!--app-head-->', ssr.renderHead({ siteUrl: site, page: 'home', preloads, base }))
  .replace('<!--app-html-->', ssr.renderApp());
await writeFile(join(outDir, 'index.html'), home);

const notFound = template
  .replace(/\s*<script type="module"[^>]*><\/script>/g, '')
  .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
  .replace(/\s*<noscript>[\s\S]*?<\/noscript>/, '')
  .replace('<!--app-head-->', ssr.renderHead({ siteUrl: site, page: 'notFound', preloads, base }))
  .replace('<!--app-html-->', ssr.renderNotFound());
await writeFile(join(outDir, '404.html'), notFound);

// 5. Text files.
const today = new Date().toISOString().slice(0, 10);
await writeFile(join(outDir, 'robots.txt'), ssr.robotsTxt(site));
await writeFile(join(outDir, 'sitemap.xml'), ssr.sitemapXml(site, today));
await writeFile(join(outDir, 'llms.txt'), ssr.llmsTxt(site));
await writeFile(join(outDir, 'site.webmanifest'), ssr.webManifest(base));
await writeFile(join(outDir, 'activities.json'), ssr.activitiesJson());

// 6. og:image, drawn from the config. The fonts in scripts/og-fonts are static
//    cuts of the site's own Archivo (the image renderer can't use variable fonts).
const fontFile = (file) => readFile(join(root, 'scripts', 'og-fonts', file));
const fonts = [
  { name: 'Archivo', data: await fontFile('archivo-500.woff'), weight: 500, style: 'normal' },
  { name: 'Archivo', data: await fontFile('archivo-600.woff'), weight: 600, style: 'normal' },
  { name: 'Archivo Condensed', data: await fontFile('archivo-condensed-820.woff'), weight: 800, style: 'normal' },
];
// The school's square logo goes in the corner of the preview image.
const logoPath = ssr.config.logos.mark.trim() ? join(root, 'public', ssr.config.logos.mark.trim().replace(/^\//, '')) : '';
let logo;
if (logoPath) {
  if (!existsSync(logoPath)) {
    console.error(`\nThe logo file ${ssr.config.logos.mark} was not found in public/. Fix config.logos.mark.\n`);
    process.exit(1);
  }
  const type = logoPath.endsWith('.svg') ? 'image/svg+xml' : logoPath.endsWith('.jpg') || logoPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  logo = `data:${type};base64,${(await readFile(logoPath)).toString('base64')}`;
}
const fullLogo = ssr.config.logos.full.trim();
if (fullLogo && !existsSync(join(root, 'public', fullLogo.replace(/^\//, '')))) {
  console.error(`\nThe logo file ${fullLogo} was not found in public/. Fix config.logos.full.\n`);
  process.exit(1);
}
const svg = await satori(ssr.ogCard(logo), { width: 1200, height: 630, fonts });
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
await writeFile(join(outDir, 'og.png'), png);

// 7. Guard rails: fail the build rather than ship a page with these problems.
const problems = [];
const countH1 = (html) => (html.match(/<h1[\s>]/g) || []).length;
if (countH1(home) !== 1) problems.push(`index.html has ${countH1(home)} <h1> elements; it needs exactly one.`);
if (countH1(notFound) !== 1) problems.push(`404.html has ${countH1(notFound)} <h1> elements; it needs exactly one.`);
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])));
  return files.flat();
}
const files = await walk(outDir);
const maps = files.filter((f) => f.endsWith('.map'));
if (maps.length) problems.push(`Source maps found in the output: ${maps.join(', ')}`);
if (/<img(?![^>]*\salt=)[^>]*>/i.test(home)) problems.push('An <img> in index.html has no alt attribute.');
if (problems.length) {
  console.error(`\nBuild checks failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}

await rm(ssrDir, { recursive: true, force: true });

// 8. Summary.
let jsRaw = 0;
let jsGzip = 0;
for (const file of files.filter((f) => f.endsWith('.js'))) {
  const content = await readFile(file);
  jsRaw += content.length;
  jsGzip += gzipSync(content).length;
}
const ogSize = (await stat(join(outDir, 'og.png'))).size;
console.log(`\nPrerendered for ${site}`);
console.log(`  index.html, 404.html, robots.txt, sitemap.xml, llms.txt, site.webmanifest, activities.json`);
console.log(`  og.png ${(ogSize / 1024).toFixed(0)} KB`);
console.log(`  JavaScript: ${(jsRaw / 1024).toFixed(1)} KB, ${(jsGzip / 1024).toFixed(1)} KB gzipped`);
