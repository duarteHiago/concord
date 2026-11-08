// O código de 6 dígitos do 2FA tem limite de tentativas (5 erros a cada 15 min, por conta; ver checkCode): sem
// ele, quem já tem a senha tentaria todos os códigos dentro dos 5 min do ticket. Entrar de novo não zera.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { Client, startServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-2fa-limit-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function fromBase32(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const step = () => Math.floor(Date.now() / 30_000);

describe('limite de tentativas do código do 2FA', () => {
  it('depois de 5 códigos errados, nem o código certo passa, mesmo entrando de novo', async () => {
    const server = await startServer({ DB_PATH: join(dir, 'concord.db') });
    try {
      const c = new Client(server.url);
      assert.equal((await c.post('/auth/register', { username: 'alvo_2fa', password: 'senha-forte-123' })).status, 200);
      c.token = (await c.post('/auth/login', { username: 'alvo_2fa', password: 'senha-forte-123' })).body.token;
      const setup = await c.post('/me/2fa/setup', { password: 'senha-forte-123' });
      const secret = fromBase32(setup.body.secret);
      assert.equal((await c.post('/me/2fa/enable', { code: totp(secret, step()) })).status, 200);

      // um código que com certeza está errado (fora da janela de tolerância do relógio)
      const valid = new Set([-2, -1, 0, 1, 2].map((d) => totp(secret, step() + d)));
      let wrong = 0;
      while (valid.has(String(wrong).padStart(6, '0'))) wrong++;
      const wrongCode = String(wrong).padStart(6, '0');

      const anon = new Client(server.url);
      const ticket = (await anon.post('/auth/login', { username: 'alvo_2fa', password: 'senha-forte-123' })).body.mfa;
      assert.ok(ticket, 'pede o código');
      for (let i = 0; i < 5; i++) {
        assert.equal((await anon.post('/auth/2fa', { ticket, code: wrongCode })).status, 400, `tentativa ${i + 1}`);
      }
      const blocked = await anon.post('/auth/2fa', { ticket, code: totp(secret, step()) });
      assert.equal(blocked.status, 429, 'o código certo também é barrado');

      const again = (await anon.post('/auth/login', { username: 'alvo_2fa', password: 'senha-forte-123' })).body.mfa;
      assert.equal((await anon.post('/auth/2fa', { ticket: again, code: totp(secret, step()) })).status, 429, 'ticket novo não zera');
    } finally {
      await server.stop();
    }
  });
});
