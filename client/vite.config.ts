import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.BACKEND_URL ?? 'http://localhost:3000';
const livekit = process.env.LIVEKIT_DEV_URL ?? 'http://localhost:7880';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
      '/livekit': { target: livekit, ws: true, rewrite: (p) => p.replace(/^\/livekit/, '') },
    },
  },
});
