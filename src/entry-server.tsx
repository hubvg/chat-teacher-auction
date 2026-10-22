// Build-time entry: scripts/prerender.mjs imports this to write real HTML into
// dist/index.html and dist/404.html, plus robots.txt, sitemap.xml, llms.txt and og.png.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { NotFound } from './NotFound';

export { activitiesJson, llmsTxt, renderHead, robotsTxt, sitemapXml, webManifest } from './seo';
export { validateConfig } from './validate';
export { ogCard } from './og';
export { config } from './site';

export function renderApp(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

export function renderNotFound(): string {
  return renderToString(<NotFound />);
}
