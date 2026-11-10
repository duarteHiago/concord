// Os limites de segurança (senha errada, código do 2FA) ficam no banco: reiniciar o servidor, como acontece a
// cada deploy, não devolve tentativas a quem está chutando.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { Client, startServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-limits-'));
const DB_PATH = join(dir, 'concord.db');
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

describe('limites que sobrevivem a um reinício', () => {
  it('senha errada e código do 2FA errado continuam bloqueados depois de reiniciar', async () => {
    let server = await startServer({ DB_PATH });
    const ana = new Client(server.url);
    assert.equal((await ana.post('/auth/register', { username: 'ana_limite', password: 'senha-forte-123' })).status, 200);
    assert.equal((await ana.post('/auth/register', { username: 'bia_limite', password: 'senha-forte-123' })).status, 200);
    // Bia liga o 2FA
    const bia = new Client(server.url);
    bia.token = (await bia.post('/auth/login', { username: 'bia_limite', password: 'senha-forte-123' })).body.token;
    const setup = await bia.post('/me/2fa/setup', { password: 'senha-forte-123' });
    const secret = fromBase32(setup.body.secret);
    assert.equal((await bia.post('/me/2fa/enable', { code: totp(secret, Math.floor(Date.now() / 30_000)) })).status, 200);

    for (let i = 0; i < 5; i++) assert.equal((await ana.post('/auth/login', { username: 'ana_limite', password: 'errada' })).status, 401);
    const ticket = (await bia.post('/auth/login', { username: 'bia_limite', password: 'senha-forte-123' })).body.mfa;
    for (let i = 0; i < 5; i++) assert.equal((await bia.post('/auth/2fa', { ticket, code: '000000' })).status, 400);
    await server.stop();

    server = await startServer({ DB_PATH });
    try {
      const anon = new Client(server.url);
      assert.equal((await anon.post('/auth/login', { username: 'ana_limite', password: 'senha-forte-123' })).status, 429);
      const again = (await anon.post('/auth/login', { username: 'bia_limite', password: 'senha-forte-123' })).body.mfa;
      assert.equal((await anon.post('/auth/2fa', { ticket: again, code: totp(secret, Math.floor(Date.now() / 30_000) + 1) })).status, 429);
    } finally {
      await server.stop();
    }
  });
});
