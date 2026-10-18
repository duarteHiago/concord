// Permissões em bitflags, no estilo do Discord. Compartilhado entre servidor e cliente.

export const P = {
  VIEW_CHANNEL: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  CONNECT: 1 << 2,
  SPEAK: 1 << 3,
  STREAM: 1 << 4,
  CREATE_INVITE: 1 << 5,
  MANAGE_MESSAGES: 1 << 6,
  MUTE_MEMBERS: 1 << 7,
  MOVE_MEMBERS: 1 << 8,
  KICK_MEMBERS: 1 << 9,
  MANAGE_CHANNELS: 1 << 10,
  MANAGE_ROLES: 1 << 11,
  MANAGE_SERVER: 1 << 12,
  ADMINISTRATOR: 1 << 13,
} as const;

export type PermissionKey = keyof typeof P;

export const ALL_PERMISSIONS = Object.values(P).reduce((a, b) => a | b, 0);

export const DEFAULT_EVERYONE =
  P.VIEW_CHANNEL | P.SEND_MESSAGES | P.CONNECT | P.SPEAK | P.STREAM | P.CREATE_INVITE;

export const DEFAULT_MODERATOR =
  DEFAULT_EVERYONE | P.MANAGE_MESSAGES | P.MUTE_MEMBERS | P.MOVE_MEMBERS | P.KICK_MEMBERS;

export interface PermissionInfo {
  key: PermissionKey;
  label: string;
  description: string;
  category: 'Geral' | 'Texto' | 'Voz e transmissão' | 'Moderação' | 'Administração';
  channel: boolean; // pode ser sobrescrita por canal
}

export const PERMISSION_INFO: PermissionInfo[] = [
  { key: 'VIEW_CHANNEL', label: 'Ver canais', description: 'Permite ver e acessar os canais.', category: 'Geral', channel: true },
  { key: 'CREATE_INVITE', label: 'Criar convites', description: 'Permite convidar novas pessoas.', category: 'Geral', channel: false },
  { key: 'SEND_MESSAGES', label: 'Enviar mensagens', description: 'Permite enviar mensagens nos canais de texto.', category: 'Texto', channel: true },
  { key: 'MANAGE_MESSAGES', label: 'Gerenciar mensagens', description: 'Permite apagar mensagens de outras pessoas.', category: 'Texto', channel: true },
  { key: 'CONNECT', label: 'Conectar', description: 'Permite entrar nas salas de voz.', category: 'Voz e transmissão', channel: true },
  { key: 'SPEAK', label: 'Falar', description: 'Permite usar o microfone nas salas.', category: 'Voz e transmissão', channel: true },
  { key: 'STREAM', label: 'Transmitir', description: 'Permite transmitir tela, janela ou câmera.', category: 'Voz e transmissão', channel: true },
  { key: 'MUTE_MEMBERS', label: 'Silenciar membros', description: 'Permite silenciar o microfone e a transmissão de outros.', category: 'Moderação', channel: true },
  { key: 'MOVE_MEMBERS', label: 'Desconectar membros', description: 'Permite remover pessoas das salas de voz.', category: 'Moderação', channel: true },
  { key: 'KICK_MEMBERS', label: 'Expulsar membros', description: 'Permite expulsar membros do servidor.', category: 'Moderação', channel: false },
  { key: 'MANAGE_CHANNELS', label: 'Gerenciar canais', description: 'Criar, editar e apagar canais e salas.', category: 'Administração', channel: true },
  { key: 'MANAGE_ROLES', label: 'Gerenciar cargos', description: 'Criar e editar cargos abaixo do seu e atribuí-los.', category: 'Administração', channel: false },
  { key: 'MANAGE_SERVER', label: 'Gerenciar servidor', description: 'Alterar nome e aparência do servidor.', category: 'Administração', channel: false },
  { key: 'ADMINISTRATOR', label: 'Administrador', description: 'Concede todas as permissões e ignora restrições de canal.', category: 'Administração', channel: false },
];

export function has(perms: number, flag: number): boolean {
  return (perms & P.ADMINISTRATOR) !== 0 || (perms & flag) === flag;
}

export interface Overwrite {
  roleId: string;
  allow: number;
  deny: number;
}

/** Aplica as sobrescritas de canal sobre as permissões base do membro. */
export function computeChannelPermissions(
  base: number,
  overwrites: Overwrite[],
  everyoneRoleId: string,
  memberRoleIds: string[],
): number {
  if (base & P.ADMINISTRATOR) return ALL_PERMISSIONS;
  let perms = base;
  const everyone = overwrites.find((o) => o.roleId === everyoneRoleId);
  if (everyone) perms = (perms & ~everyone.deny) | everyone.allow;
  let allow = 0;
  let deny = 0;
  for (const o of overwrites) {
    if (o.roleId !== everyoneRoleId && memberRoleIds.includes(o.roleId)) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  perms = (perms & ~deny) | allow;
  if (!(perms & P.VIEW_CHANNEL)) return 0;
  return perms;
}
