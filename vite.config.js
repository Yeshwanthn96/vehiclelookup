import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Upstream API sends no CORS headers, so proxy it in dev the same way vercel.json does in prod.
    proxy: {
      '/api/lookup': {
        target: 'https://vehicleinfobyterabaap.vercel.app',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/lookup', '/lookup'),
      },
    },
  },
});
