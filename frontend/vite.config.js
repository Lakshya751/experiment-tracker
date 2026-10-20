import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development, Vite forwards /api requests to Flask so the browser
// talks to a single origin. Set VITE_API_PROXY_TARGET to point elsewhere.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
});
