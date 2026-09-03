import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const ROUTES = ['/api/lookup', '/api/log', '/api/searches'];

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });

// Runs the same handlers as the Vercel functions so /api/* behaves identically in dev.
function devApi() {
  return {
    name: 'dev-api',
    configureServer(server) {
      for (const route of ROUTES) {
        server.middlewares.use(route, async (req, res) => {
          try {
            const url = new URL(req.url, 'http://localhost');
            const { default: handler } = await server.ssrLoadModule(`${route}.js`);
            const body = req.method === 'POST' ? await readBody(req) : undefined;

            await handler(
              {
                query: Object.fromEntries(url.searchParams),
                headers: req.headers,
                method: req.method,
                body,
                socket: req.socket,
              },
              {
                setHeader: (key, value) => res.setHeader(key, value),
                status(code) {
                  res.statusCode = code;
                  return this;
                },
                json(payload) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(payload));
                },
                send(payload) {
                  res.end(payload);
                },
                end() {
                  res.end();
                },
              },
            );
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose .env values to the dev API handlers, mirroring Vercel env vars.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return { plugins: [react(), devApi()] };
});
