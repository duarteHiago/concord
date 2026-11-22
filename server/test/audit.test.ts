// Registro de auditoria: só quem tem "Ver o registro de auditoria" lê; as ações de gerenciamento e moderação
// viram linhas com quem fez, o alvo e o que mudou; salvar sem mudar nada não vira linha; dá para filtrar por grupo.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { P } from '../../shared/permissions.ts';
import type { AuditEntry } from '../../shared/audit.ts';
import { signUp, startServer, type Client, type TestServer } from './helpers.ts';

let server: TestServer;
before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

async function scene() {
  const dono = await signUp(server, 'aud_dono');
  const serverId = (await dono.post('/servers', { name: 'Auditado' })).body.id as string;
  const code = (await dono.post(`/servers/${serverId}/invites`, {})).body.code as string;
  const membro = await signUp(server, 'aud_membro');
  assert.equal((await membro.post(`/invites/${code}`)).status, 200);
  const detail = (await dono.get(`/servers/${serverId}`)).body;
  const geral = detail.channels.find((c: { type: string }) => c.type === 'text').id as string;
  return { dono, membro, serverId, geral, code };
}

async function log(c: Client, serverId: string, query = '') {
  const res = await c.get(`/servers/${serverId}/audit-log${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as { entries: AuditEntry[]; next: number | null; actors: { id: string; name: string }[] };
}

describe('registro de auditoria', () => {
  it('membro comum não lê; o dono lê', async () => {
    const { dono, membro, serverId } = await scene();
    assert.equal((await membro.get(`/servers/${serverId}/audit-log`)).status, 403);
    assert.equal((await dono.get(`/servers/${serverId}/audit-log`)).status, 200);
  });

  it('cargo com a permissão nova lê', async () => {
    const { dono, membro, serverId } = await scene();
    const role = (await dono.post(`/servers/${serverId}/roles`, { name: 'Auditor' })).body;
    assert.equal((await dono.patch(`/roles/${role.id}`, { permissions: role.permissions | P.VIEW_AUDIT_LOG })).status, 200);
    assert.equal((await dono.put(`/servers/${serverId}/members/${membro.id}/roles`, { roleIds: [role.id] })).status, 200);
    const { entries } = await log(membro, serverId);
    const roles = entries.find((e) => e.action === 'member_roles')!;
    assert.equal(roles.target?.id, membro.id);
    assert.deepEqual(roles.changes[0].added, ['Auditor']);
    const perms = entries.find((e) => e.action === 'role_update')!;
    assert.deepEqual(perms.changes[0].added, ['Ver o registro de auditoria']);
  });

  it('edição do servidor guarda o antes e o depois; salvar igual não vira linha', async () => {
    const { dono, serverId } = await scene();
    await dono.patch(`/servers/${serverId}`, { name: 'Novo nome' });
    await dono.patch(`/servers/${serverId}`, { name: 'Novo nome' });
    const updates = (await log(dono, serverId)).entries.filter((e) => e.action === 'server_update');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].changes, [{ field: 'Nome', from: 'Auditado', to: 'Novo nome' }]);
    assert.equal(updates[0].actor.id, dono.id);
  });

  it('canais, convites, expulsão, banimento e mensagem apagada por outra pessoa', async () => {
    const { dono, membro, serverId, geral } = await scene();
    const sala = (await dono.post(`/servers/${serverId}/channels`, { name: 'Papo', type: 'voice' })).body.id as string;
    await dono.patch(`/channels/${sala}`, { name: 'Papo 2' });
    await dono.del(`/channels/${sala}`);

    // a própria mensagem apagada não entra; a de outra pessoa, sim (sem o texto)
    const minha = (await dono.post(`/channels/${geral}/messages`, { content: 'minha' })).body.id as string;
    await dono.del(`/messages/${minha}`);
    const dele = (await membro.post(`/channels/${geral}/messages`, { content: 'segredo' })).body.id as string;
    assert.equal((await dono.del(`/messages/${dele}`)).status, 200);

    assert.equal((await dono.del(`/servers/${serverId}/members/${membro.id}`)).status, 200);
    assert.equal((await dono.post(`/servers/${serverId}/bans`, { userId: membro.id, reason: 'spam' })).status, 200);
    assert.equal((await dono.del(`/servers/${serverId}/bans/${membro.id}`)).status, 200);

    const { entries, actors } = await log(dono, serverId);
    const actions = entries.map((e) => e.action);
    for (const a of ['invite_create', 'channel_create', 'channel_update', 'channel_delete', 'message_delete', 'member_kick', 'member_ban', 'member_unban']) {
      assert.ok(actions.includes(a as AuditEntry['action']), `faltou ${a}`);
    }
    assert.equal(actions.filter((a) => a === 'message_delete').length, 1, 'só a mensagem de outra pessoa');
    const del = entries.find((e) => e.action === 'message_delete')!;
    assert.equal(del.target?.id, membro.id);
    assert.ok(!JSON.stringify(del).includes('segredo'), 'o texto da mensagem não vai para o registro');
    assert.equal(entries.find((e) => e.action === 'member_ban')!.reason, 'spam');
    assert.deepEqual(entries.find((e) => e.action === 'channel_update')!.changes, [{ field: 'Nome', from: 'Papo', to: 'Papo 2' }]);
    assert.equal(entries.find((e) => e.action === 'channel_delete')!.target?.name, 'Papo 2', 'o nome fica mesmo com o canal apagado');
    // mais nova primeiro
    assert.equal(entries[0].action, 'member_unban');
    assert.deepEqual(actors.map((a) => a.id), [dono.id]);

    // filtro por grupo
    const mod = (await log(dono, serverId, '?action=moderation')).entries.map((e) => e.action);
    assert.deepEqual(mod, ['member_unban', 'member_ban', 'member_kick']);
    // filtro por quem fez (ninguém mais fez nada)
    assert.equal((await log(dono, serverId, `?actor=${membro.id}`)).entries.length, 0);
  });

  it('pagina de 50 em 50, da mais nova para a mais velha', async () => {
    const { dono, serverId } = await scene();
    for (let i = 0; i < 55; i++) await dono.patch(`/servers/${serverId}`, { description: `d${i}` });
    const first = await log(dono, serverId);
    assert.equal(first.entries.length, 50);
    assert.ok(first.next);
    const second = await log(dono, serverId, `?before=${first.next}`);
    assert.equal(second.next, null);
    const ids = [...first.entries, ...second.entries].map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'sem repetir');
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  });
});
