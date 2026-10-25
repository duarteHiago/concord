// Regras de permissão compartilhadas entre o servidor e o cliente (shared/permissions.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_PERMISSIONS, computeChannelPermissions, DEFAULT_EVERYONE, has, P } from '../../shared/permissions.ts';

const EVERYONE = 'everyone';
const MOD = 'mod';

describe('has', () => {
  it('confere a permissão pedida', () => {
    assert.equal(has(P.SEND_MESSAGES, P.SEND_MESSAGES), true);
    assert.equal(has(P.SEND_MESSAGES, P.KICK_MEMBERS), false);
  });

  it('exige todas as permissões quando pede mais de uma', () => {
    assert.equal(has(P.CONNECT, P.CONNECT | P.SPEAK), false);
    assert.equal(has(P.CONNECT | P.SPEAK, P.CONNECT | P.SPEAK), true);
  });

  it('Administrador tem tudo', () => {
    assert.equal(has(P.ADMINISTRATOR, P.MANAGE_SERVER), true);
    assert.equal(has(P.ADMINISTRATOR, P.KICK_MEMBERS | P.MANAGE_ROLES), true);
  });
});

describe('computeChannelPermissions', () => {
  it('sem sobrescrita, valem as permissões do servidor', () => {
    assert.equal(computeChannelPermissions(DEFAULT_EVERYONE, [], EVERYONE, []), DEFAULT_EVERYONE);
  });

  it('negar no @everyone tira de todo mundo', () => {
    const perms = computeChannelPermissions(DEFAULT_EVERYONE, [{ roleId: EVERYONE, allow: 0, deny: P.SEND_MESSAGES }], EVERYONE, []);
    assert.equal(has(perms, P.SEND_MESSAGES), false);
    assert.equal(has(perms, P.VIEW_CHANNEL), true);
  });

  it('o cargo da pessoa vence o @everyone (canal só leitura onde a moderação escreve)', () => {
    const overwrites = [
      { roleId: EVERYONE, allow: 0, deny: P.SEND_MESSAGES },
      { roleId: MOD, allow: P.SEND_MESSAGES, deny: 0 },
    ];
    assert.equal(has(computeChannelPermissions(DEFAULT_EVERYONE, overwrites, EVERYONE, [MOD]), P.SEND_MESSAGES), true);
    assert.equal(has(computeChannelPermissions(DEFAULT_EVERYONE, overwrites, EVERYONE, []), P.SEND_MESSAGES), false);
  });

  it('cargo que não é da pessoa não muda nada', () => {
    const perms = computeChannelPermissions(DEFAULT_EVERYONE, [{ roleId: MOD, allow: 0, deny: P.SEND_MESSAGES }], EVERYONE, []);
    assert.equal(has(perms, P.SEND_MESSAGES), true);
  });

  it('entre cargos da pessoa, permitir vence negar', () => {
    const overwrites = [
      { roleId: 'a', allow: 0, deny: P.STREAM },
      { roleId: 'b', allow: P.STREAM, deny: 0 },
    ];
    assert.equal(has(computeChannelPermissions(DEFAULT_EVERYONE, overwrites, EVERYONE, ['a', 'b']), P.STREAM), true);
  });

  it('sem "Ver canais" a pessoa não tem nada no canal (canal privado)', () => {
    const perms = computeChannelPermissions(DEFAULT_EVERYONE, [{ roleId: EVERYONE, allow: 0, deny: P.VIEW_CHANNEL }], EVERYONE, []);
    assert.equal(perms, 0);
  });

  it('Administrador ignora as sobrescritas do canal', () => {
    const perms = computeChannelPermissions(P.ADMINISTRATOR, [{ roleId: EVERYONE, allow: 0, deny: P.VIEW_CHANNEL }], EVERYONE, []);
    assert.equal(perms, ALL_PERMISSIONS);
  });
});
