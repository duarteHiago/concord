// Trocar o JWT_SECRET (sessões) não pode trancar quem tem 2FA: com o valor antigo em TWOFA_SECRET, os segredos
// guardados continuam abrindo. E o ticket entre a senha e o código sempre usa o JWT_SECRET atual.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { Client, startServer } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'concord-2fa-'));
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

const step = () => Math.floor(Date.now() / 30_000);

describe('trocar o JWT_SECRET com 2FA ligado', () => {
  it('com o valor antigo em TWOFA_SECRET, o código do app e o de backup continuam valendo', async () => {
    const before = await startServer({ DB_PATH, JWT_SECRET: 'segredo-antigo' });
    const c = new Client(before.url);
    assert.equal((await c.post('/auth/register', { username: 'com_2fa', password: 'senha-forte-123' })).status, 200);
    const login = await c.post('/auth/login', { username: 'com_2fa', password: 'senha-forte-123' });
    c.token = login.body.token;
    const setup = await c.post('/me/2fa/setup', { password: 'senha-forte-123' });
    assert.equal(setup.status, 200);
    const secret = fromBase32(setup.body.secret);
    const enabled = await c.post('/me/2fa/enable', { code: totp(secret, step()) });
    assert.equal(enabled.status, 200);
    const backup = enabled.body.backupCodes[0] as string;
    await before.stop();

    const after = await startServer({ DB_PATH, JWT_SECRET: 'segredo-novo', TWOFA_SECRET: 'segredo-antigo' });
    try {
      const anon = new Client(after.url);
      // a sessão antiga caiu com o JWT_SECRET novo
      const old = new Client(after.url);
      old.token = c.token;
      assert.equal((await old.get('/me')).status, 401);

      const first = await anon.post('/auth/login', { username: 'com_2fa', password: 'senha-forte-123' });
      assert.ok(first.body.mfa, 'pede o código');
      const byApp = await anon.post('/auth/2fa', { ticket: first.body.mfa, code: totp(secret, step() + 1) });
      assert.equal(byApp.status, 200, JSON.stringify(byApp.body));

      const second = await anon.post('/auth/login', { username: 'com_2fa', password: 'senha-forte-123' });
      const byBackup = await anon.post('/auth/2fa', { ticket: second.body.mfa, code: backup });
      assert.equal(byBackup.status, 200, JSON.stringify(byBackup.body));
    } finally {
      await after.stop();
    }
  });
});
