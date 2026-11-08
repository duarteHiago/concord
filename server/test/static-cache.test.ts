// O service worker decide quando o app atualiza: ele não pode ficar guardado em cache (nem no navegador, nem no
// Cloudflare). O resto dos arquivos do app continua com cache.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { startServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-static-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('cache dos arquivos do app', () => {
  it('sw.js, registerSW.js e o manifesto saem com no-cache; o resto, com max-age', async () => {
    const pub = join(dir, 'public');
    mkdirSync(join(pub, 'assets'), { recursive: true });
    for (const f of ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest', 'assets/app-abc123.js']) writeFileSync(join(pub, f), '//');
    const server = await startServer({ PUBLIC_DIR: pub });
    try {
      for (const f of ['sw.js', 'registerSW.js', 'manifest.webmanifest']) {
        const res = await fetch(`${server.url}/${f}`);
        assert.equal(res.status, 200, f);
        assert.equal(res.headers.get('cache-control'), 'no-cache', f);
      }
      const asset = await fetch(`${server.url}/assets/app-abc123.js`);
      assert.match(asset.headers.get('cache-control') ?? '', /max-age=3600/);
    } finally {
      await server.stop();
    }
  });
});
