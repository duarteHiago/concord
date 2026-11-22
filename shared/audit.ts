// Registro de auditoria dos servidores (como o do Discord): o que cada ação é, como aparece na lista e em que grupo
// do filtro ela cai. O servidor grava (server/src/audit.ts) e o app mostra (ServerSettingsModal, aba "Auditoria").

export const AUDIT_GROUPS = {
  server: 'Servidor',
  channels: 'Canais',
  roles: 'Cargos',
  members: 'Membros',
  moderation: 'Moderação',
  voice: 'Voz',
  messages: 'Mensagens',
  invites: 'Convites',
  content: 'Sons, stickers e patches',
  integrations: 'Bots e webhooks',
} as const;

export type AuditGroup = keyof typeof AUDIT_GROUPS;

/** `verb` completa a frase "Fulano <verb> <alvo>". */
export const AUDIT_ACTIONS = {
  server_update: { group: 'server', verb: 'atualizou o servidor' },
  server_icon: { group: 'server', verb: 'trocou o ícone do servidor' },
  server_icon_remove: { group: 'server', verb: 'tirou o ícone do servidor' },
  trust_rules: { group: 'server', verb: 'mudou as exigências de segurança de' },

  channel_create: { group: 'channels', verb: 'criou o canal' },
  channel_update: { group: 'channels', verb: 'editou o canal' },
  channel_delete: { group: 'channels', verb: 'apagou o canal' },
  channel_permissions: { group: 'channels', verb: 'mudou as permissões do canal' },
  category_create: { group: 'channels', verb: 'criou a categoria' },
  category_update: { group: 'channels', verb: 'editou a categoria' },
  category_delete: { group: 'channels', verb: 'apagou a categoria' },

  role_create: { group: 'roles', verb: 'criou o cargo' },
  role_update: { group: 'roles', verb: 'editou o cargo' },
  role_delete: { group: 'roles', verb: 'apagou o cargo' },

  member_roles: { group: 'members', verb: 'mudou os cargos de' },
  member_nickname: { group: 'members', verb: 'mudou o apelido de' },

  member_kick: { group: 'moderation', verb: 'expulsou' },
  member_ban: { group: 'moderation', verb: 'baniu' },
  member_unban: { group: 'moderation', verb: 'desbaniu' },

  voice_mute: { group: 'voice', verb: 'silenciou' },
  voice_unmute: { group: 'voice', verb: 'tirou o silêncio de' },
  voice_deafen: { group: 'voice', verb: 'ensurdeceu' },
  voice_undeafen: { group: 'voice', verb: 'tirou a surdez de' },
  voice_disconnect: { group: 'voice', verb: 'desconectou da sala' },
  stream_stop: { group: 'voice', verb: 'encerrou a transmissão de' },
  stickers_clear: { group: 'voice', verb: 'tirou todos os stickers da sala' },

  message_delete: { group: 'messages', verb: 'apagou uma mensagem de' },
  forum_post_delete: { group: 'messages', verb: 'apagou um post de' },
  forum_reply_delete: { group: 'messages', verb: 'apagou uma resposta de' },

  invite_create: { group: 'invites', verb: 'criou o convite' },
  invite_delete: { group: 'invites', verb: 'apagou o convite' },

  sound_create: { group: 'content', verb: 'adicionou o som' },
  sound_delete: { group: 'content', verb: 'apagou o som' },
  sticker_create: { group: 'content', verb: 'adicionou o sticker' },
  sticker_delete: { group: 'content', verb: 'apagou o sticker' },
  patch_create: { group: 'content', verb: 'criou um patch' },
  patch_delete: { group: 'content', verb: 'apagou um patch' },

  webhook_create: { group: 'integrations', verb: 'criou o webhook' },
  webhook_update: { group: 'integrations', verb: 'editou o webhook' },
  webhook_delete: { group: 'integrations', verb: 'apagou o webhook' },
  bot_add: { group: 'integrations', verb: 'adicionou o bot' },
  bot_remove: { group: 'integrations', verb: 'removeu o bot' },
} as const satisfies Record<string, { group: AuditGroup; verb: string }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const isAuditAction = (v: unknown): v is AuditAction => typeof v === 'string' && Object.hasOwn(AUDIT_ACTIONS, v);
export const isAuditGroup = (v: unknown): v is AuditGroup => typeof v === 'string' && Object.hasOwn(AUDIT_GROUPS, v);

/** Ações de um grupo do filtro. */
export const actionsOf = (group: AuditGroup) => (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((a) => AUDIT_ACTIONS[a].group === group);

/** Uma linha do "o que mudou": um campo que foi de `from` para `to`, ou uma lista que ganhou/perdeu itens. */
export interface AuditChange {
  field: string;
  from?: string | null;
  to?: string | null;
  added?: string[];
  removed?: string[];
}

export type AuditTargetType = 'server' | 'channel' | 'category' | 'role' | 'user' | 'invite' | 'sound' | 'sticker' | 'patch' | 'webhook';

/** Uma entrada como a API devolve. */
export interface AuditEntry {
  id: number;
  action: AuditAction;
  actor: { id: string | null; name: string; avatarUrl: string | null; avatarColor: string };
  target: { type: AuditTargetType; id: string | null; name: string | null } | null;
  changes: AuditChange[];
  reason: string | null;
  createdAt: number;
}

/** Quantos dias o registro guarda (depois disso a linha some sozinha). */
export const AUDIT_DAYS = 90;
