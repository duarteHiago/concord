import { ALL_PERMISSIONS, P, computeChannelPermissions, has } from '../../shared/permissions.ts';
import { config } from './config.ts';
import { all, get, type ChannelRow, type OverwriteRow, type RoleRow, type ServerRow } from './db.ts';
import { fail } from './http.ts';

export function getServer(serverId: string): ServerRow {
  return get<ServerRow>('SELECT * FROM servers WHERE id = ?', serverId) ?? fail(404, 'Servidor não encontrado');
}

export function getChannel(channelId: string): ChannelRow {
  return get<ChannelRow>('SELECT * FROM channels WHERE id = ?', channelId) ?? fail(404, 'Canal não encontrado');
}

export function getRole(roleId: string): RoleRow {
  return get<RoleRow>('SELECT * FROM roles WHERE id = ?', roleId) ?? fail(404, 'Cargo não encontrado');
}

export function isMember(serverId: string, userId: string): boolean {
  return !!get('SELECT 1 FROM members WHERE server_id = ? AND user_id = ?', serverId, userId);
}

export function memberRoles(serverId: string, userId: string): RoleRow[] {
  return all<RoleRow>(
    `SELECT r.* FROM roles r JOIN member_roles mr ON mr.role_id = r.id
     WHERE mr.server_id = ? AND mr.user_id = ?`,
    serverId,
    userId,
  );
}

export function everyoneRole(serverId: string): RoleRow {
  return get<RoleRow>('SELECT * FROM roles WHERE server_id = ? AND is_default = 1', serverId)!;
}

/** Permissões no nível do servidor (0 se não for membro). */
export function serverPermissions(serverId: string, userId: string): number {
  const server = get<ServerRow>('SELECT * FROM servers WHERE id = ?', serverId);
  if (!server || !isMember(serverId, userId)) return 0;
  if (server.owner_id === userId) return ALL_PERMISSIONS;
  let perms = everyoneRole(serverId).permissions;
  for (const r of memberRoles(serverId, userId)) perms |= r.permissions;
  return perms & P.ADMINISTRATOR ? ALL_PERMISSIONS : perms;
}

export function channelOverwrites(channelId: string) {
  return all<OverwriteRow>('SELECT * FROM channel_overwrites WHERE channel_id = ?', channelId).map((o) => ({
    roleId: o.role_id,
    allow: o.allow,
    deny: o.deny,
  }));
}

export function channelPermissions(channel: ChannelRow, userId: string): number {
  const base = serverPermissions(channel.server_id, userId);
  if (!base) return 0;
  const server = getServer(channel.server_id);
  if (server.owner_id === userId) return ALL_PERMISSIONS;
  return computeChannelPermissions(
    base,
    channelOverwrites(channel.id),
    everyoneRole(channel.server_id).id,
    memberRoles(channel.server_id, userId).map((r) => r.id),
  );
}

/** Posição do cargo mais alto do membro (dono = infinito). */
export function highestPosition(serverId: string, userId: string): number {
  if (getServer(serverId).owner_id === userId) return Infinity;
  return Math.max(0, ...memberRoles(serverId, userId).map((r) => r.position));
}

export function requireMember(serverId: string, userId: string) {
  const server = getServer(serverId);
  if (!isMember(serverId, userId)) fail(404, 'Servidor não encontrado');
  return server;
}

export function requireServerPerm(serverId: string, userId: string, flag: number) {
  const server = requireMember(serverId, userId);
  if (!has(serverPermissions(serverId, userId), flag)) fail(403, 'Você não tem permissão para isso');
  return server;
}

export function requireChannelPerm(channelId: string, userId: string, flag: number) {
  const channel = getChannel(channelId);
  const perms = channelPermissions(channel, userId);
  if (!perms) fail(404, 'Canal não encontrado');
  if (!has(perms, flag)) fail(403, 'Você não tem permissão para isso');
  return channel;
}

/** Autoridade da instalação (selo de verificado): quem tem Administrador no servidor configurado em
 * AUTHORITY_SERVER_ID pode verificar/desverificar qualquer servidor ou pessoa, não só o próprio. */
export function isInstanceAuthority(userId: string): boolean {
  if (!config.authorityServerId) return false;
  return has(serverPermissions(config.authorityServerId, userId), P.ADMINISTRATOR);
}

/** O ator pode agir sobre o alvo? (hierarquia de cargos) */
export function outranks(serverId: string, actorId: string, targetId: string): boolean {
  const server = getServer(serverId);
  if (targetId === server.owner_id) return false;
  if (actorId === server.owner_id) return true;
  return highestPosition(serverId, actorId) > highestPosition(serverId, targetId);
}
