// Cabeçalhos de segurança e o relatório da CSP (server/src/security.ts).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { startServer, type TestServer } from './helpers.ts';

const INLINE = "\n      if (location.pathname === '/') location.replace('/inicio/');\n    ";
let server: TestServer;
let publicDir: string;

before(async () => {
  // um "client/dist" de mentira, com um <script> inline como o do index.html de verdade
  publicDir = mkdtempSync(join(tmpdir(), 'concord-public-'));
  mkdirSync(join(publicDir, 'inicio'));
  writeFileSync(join(publicDir, 'index.html'), `<!doctype html><html><head><script>${INLINE}</script><script type="module" src="/assets/app.js"></script></head></html>`);
  writeFileSync(join(publicDir, 'inicio', 'index.html'), '<!doctype html><html></html>');
  server = await startServer({ PUBLIC_DIR: publicDir });
});
after(async () => {
  await server.stop();
  rmSync(publicDir, { recursive: true, force: true });
});

describe('cabeçalhos de segurança', () => {
  it('nenhum site embute o Concord num iframe', async () => {
    const res = await fetch(`${server.url}/`);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  });

  it('vale também para a API e os arquivos', async () => {
    for (const path of ['/health', '/api/config']) {
      const res = await fetch(`${server.url}${path}`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
    }
  });

  it('a CSP em teste libera o script inline da página pelo hash, sem unsafe-inline', async () => {
    const policy = (await fetch(`${server.url}/`)).headers.get('content-security-policy-report-only') ?? '';
    const script = policy.split('; ').find((d) => d.startsWith('script-src'))!;
    assert.ok(script.includes(`'sha256-${createHash('sha256').update(INLINE).digest('base64')}'`), script);
    assert.ok(!script.includes("'unsafe-inline'"));
    assert.match(policy, /report-uri \/api\/csp-report/);
  });

  it('sem HTTPS, sem HSTS', async () => {
    assert.equal((await fetch(`${server.url}/health`)).headers.get('strict-transport-security'), null);
  });

  it('atrás do proxy com HTTPS, manda HSTS', async () => {
    const res = await fetch(`${server.url}/health`, { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(res.headers.get('strict-transport-security') ?? '', /max-age=\d+/);
  });
});

describe('relatório da CSP', () => {
  it('aceita o formato do report-uri sem login', async () => {
    const res = await fetch(`${server.url}/api/csp-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'https://exemplo.com/x.png', 'document-uri': 'https://concord/' } }),
    });
    assert.equal(res.status, 204);
  });

  it('aceita o formato da Reporting API', async () => {
    const res = await fetch(`${server.url}/api/csp-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/reports+json' },
      body: JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'connect-src', blockedURL: 'wss://outro/' } }]),
    });
    assert.equal(res.status, 204);
  });
});
