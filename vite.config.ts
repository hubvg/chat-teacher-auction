import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** The API routes and the files Vercel runs for them. */
const API: Array<{ route: string; file: string; method: 'GET' | 'POST' }> = [
  { route: '/api/bids', file: '/api/bids.ts', method: 'GET' },
  { route: '/api/bid', file: '/api/bid.ts', method: 'POST' },
];

/**
 * Dev-only helpers:
 *  - renders the page on the server like the production build does, so
 *    hydration problems show up locally instead of after deploying;
 *  - serves /api/bids and /api/bid from the api/ folder (the same code Vercel runs).
 */
function devServer(): Plugin {
  return {
    name: 'teacher-auction:dev-server',
    apply: 'serve',
    configureServer(server) {
      for (const { route, file, method } of API) {
        server.middlewares.use(route, async (req, res, next) => {
          try {
            if (req.method !== method) {
              res.statusCode = 405;
              res.setHeader('allow', method);
              res.end();
              return;
            }
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
              if (typeof value === 'string') headers.set(key, value);
            }
            headers.set('x-real-ip', req.socket.remoteAddress ?? '127.0.0.1');
            let body: string | undefined;
            if (method === 'POST') {
              const chunks: Buffer[] = [];
              for await (const chunk of req) chunks.push(chunk as Buffer);
              body = Buffer.concat(chunks).toString('utf8');
              headers.delete('content-length');
            }
            const url = new URL(req.originalUrl ?? route, 'http://localhost');
            const mod = await server.ssrLoadModule(file);
            const response: Response = await mod[method](new Request(url, { method, headers, body }));
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (error) {
            next(error);
          }
        });
      }
    },
    async transformIndexHtml(html, ctx) {
      if (!ctx.server) return html;
      const mod = await ctx.server.ssrLoadModule('/src/entry-server.tsx');
      return html
        .replace('<!--app-head-->', mod.renderHead({ siteUrl: 'http://localhost:5173', page: 'home' }))
        .replace('<!--app-html-->', mod.renderApp());
    },
  };
}

export default defineConfig(({ mode }) => {
  // Lets `npm run dev` read BIDS_SOURCE_URL and BIDS_SECRET from .env.local.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['BIDS_SOURCE_URL', 'BIDS_SECRET']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    appType: 'mpa',
    plugins: [react(), devServer()],
    build: {
      sourcemap: false,
      target: 'es2022',
    },
  };
});
