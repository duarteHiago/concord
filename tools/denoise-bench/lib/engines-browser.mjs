// Roda a cadeia inteira do app (Chain de client/src/lib/voiceEffects.ts: mono, medidores, IA, portão, nivelador)
// num Chromium headless (Playwright) sobre um OfflineAudioContext, servida pelo Vite do cliente. É o modo que
// mede o que a pessoa de fato ouve. Precisa de `npm install playwright` nesta pasta (e do Chromium dele).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const client = join(here, '..', '..', '..', 'client');
const require = createRequire(import.meta.url);

let shared = null;
async function boot() {
  if (shared) return shared;
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [client] })).href);
  const vite = await createServer({ root: client, configFile: join(client, 'vite.config.ts'), server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
  await vite.listen();
  const port = vite.config.server.port ?? vite.httpServer.address().port;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error('[browser]', m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/bench/index.html`);
  await page.waitForFunction(() => typeof window.renderChain === 'function', null, { timeout: 60_000 });
  shared = { vite, browser, page };
  const close = async () => {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  };
  process.once('exit', () => void close());
  process.once('SIGINT', () => void close().then(() => process.exit(130)));
  return shared;
}

const toB64 = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64');
const fromB64 = (b64) => {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

export async function makeEngine(mode, { strength = 45, gate = { mode: 'off', threshold: -50 }, level = true } = {}) {
  const { page } = await boot();
  const errors = [];
  return {
    name: `browser:${mode}`,
    process(x) {
      // síncrono por fora (a bancada é sequencial); por dentro espera o render
      throw new Error('use processAsync no modo browser');
    },
    async processAsync(x) {
      const r = await page.evaluate(({ b64, settings }) => window.renderChain(b64, settings), { b64: toB64(x), settings: { noise: mode, strength, gate, level, effect: 'none' } });
      if (r.error) throw new Error(r.error);
      if (r.active !== mode) errors.push({ type: 'fallback', message: `pedi ${mode}, valeu ${r.active}: ${r.reason}` });
      return fromB64(r.b64);
    },
    errors: () => errors,
    destroy() {},
  };
}
