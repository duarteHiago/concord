import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const backend = process.env.BACKEND_URL ?? 'http://localhost:3000';
const livekit = process.env.LIVEKIT_DEV_URL ?? 'http://localhost:7880';

/** Commit em execução: o CI escreve build-commit.txt antes do deploy (a VPS não recebe o .git); fora dele, tenta o git. */
function buildCommit() {
  try {
    return readFileSync(new URL('./build-commit.txt', import.meta.url), 'utf8').trim().slice(0, 12);
  } catch {
    try {
      return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return 'dev';
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/uploads\//, /^\/inicio\//, /^\/privacidade\//, /^\/termos\//, /^\/contribuir\//, /^\/offline\.html/],
        offlineGoogleAnalytics: false,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-woff', expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /\/uploads\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'user-uploads', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 } },
          },
        ],
      },
      manifest: false,
    }),
  ],
  define: {
    // só pra mostrar no "Modo desenvolvedor" das configurações quando esse build do client foi gerado
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT__: JSON.stringify(buildCommit()),
  },
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
