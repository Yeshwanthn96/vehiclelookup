import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Runs the same handler as the Vercel function so /api/lookup works in dev too.
function devLookupApi() {
  return {
    name: 'dev-lookup-api',
    configureServer(server) {
      server.middlewares.use('/api/lookup', async (req, res) => {
        const rc = new URL(req.url, 'http://localhost').searchParams.get('rc');
        const { default: handler } = await server.ssrLoadModule('/api/lookup.js');
        await handler(
          { query: { rc }, headers: req.headers, method: req.method },
          {
            setHeader: (key, value) => res.setHeader(key, value),
            status(code) {
              res.statusCode = code;
              return this;
            },
            json(body) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(body));
            },
          },
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devLookupApi()],
});
