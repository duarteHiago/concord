import type { Overwrite } from '../../../shared/permissions.ts';
import type { Patch, StickerFinish } from '../../../shared/cosmetics.ts';

export type { Patch, StickerFinish };

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  bannerColor: string | null;
  bannerUrl?: string | null;
  bio: string;
  bot?: boolean;
  /** moldura animada da foto */
  frame?: string | null;
  /** fundo do mini perfil (imagem/GIF) */
  cardBgUrl?: string | null;
  /** patches costurados no cartão (não vêm junto das mensagens) */
  patches?: Patch[];
}

/** Patch compartilhado num servidor. */
export interface ServerPatch {
  id: string;
  serverId: string;
  creatorId: string | null;
  createdAt: number;
  patch: Patch;
}

/** Sticker enviado pela galera do servidor. */
export interface CustomSticker {
  id: string;
  serverId: string;
  name: string;
  url: string;
  uploaderId: string | null;
}

/** Sticker colado no palco de uma sala de voz. x/y vão de 0 a 1. */
export interface PlacedSticker {
  id: string;
  sticker: string; // "preset:<id>" ou "custom:<id>"
  finish: StickerFinish;
  x: number;
  y: number;
  rot: number;
  scale: number;
  authorId: string | null;
}

export interface Activity {
  type: 'playing' | 'listening';
  name: string;
  details?: string;
  since: number;
}

/** Presença de quem está online. */
export interface Presence {
  status: 'online' | 'dnd';
  customStatus: string;
  activity: Activity | null;
}

export interface Sound {
  id: string;
  serverId: string;
  name: string;
  url: string;
  uploaderId: string | null;
  createdAt: number;
}

export interface Bot extends User {
  ownerId: string;
  createdAt: number;
  servers: { id: string; name: string }[];
}

export type PresenceStatus = 'online' | 'dnd';

/** Preferências de "Chamar atenção" e notificações. */
export interface NotifySettings {
  nudges: boolean; // receber chamadas de atenção
  shake: boolean; // tremer a tela/janela
  sound: boolean;
  desktop: boolean; // notificação do sistema
  mentions: boolean; // avisar quando alguém mencionar você
}

export const DEFAULT_NOTIFY: NotifySettings = { nudges: true, shake: true, sound: true, desktop: true, mentions: true };

export interface UserSettings {
  theme?: Partial<ThemeSettings>;
  status?: PresenceStatus;
  customStatus?: string;
  /** mostrar o jogo/música detectados pelo app desktop */
  shareActivity?: boolean;
  /** atalhos personalizados (ação → "Ctrl+Shift+M") */
  shortcuts?: Record<string, string>;
  /** no app desktop, silenciar/ensurdecer funcionam com o app em segundo plano */
  globalShortcuts?: boolean;
  notifications?: Partial<NotifySettings>;
  mutedNudges?: string[];
  /** animações: sempre ligadas (padrão), seguir o sistema ou reduzidas */
  motion?: 'full' | 'system' | 'reduce';
  /** código compartilhado da sala */
  clips?: { receive?: boolean; autoCopy?: boolean };
  /** já viu o tutorial de boas-vindas (ele reaparece em "Configurações → Conta" a qualquer momento) */
  onboarded?: boolean;
}

export interface Me extends User {
  settings: UserSettings & Record<string, unknown>;
  hasRecoveryCode?: boolean;
}

export interface NudgeEvent {
  from: User & { nickname: string | null };
  serverId: string;
  serverName: string;
  channelId: string | null;
  at: number;
}

export interface ThemeSettings {
  preset: string;
  accent: string | null;
  background: { url: string | null; blur: number; dim: number };
  scale: number;
  customCss: string;
}

export interface ServerSummary {
  id: string;
  name: string;
  ownerId: string;
  iconColor: string;
  iconUrl: string | null;
}

export interface Role {
  id: string;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
  isDefault: boolean;
  hoist: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  topic: string;
  position: number;
  userLimit: number;
  overwrites: Overwrite[];
  permissions: number;
}

export interface Member extends User {
  nickname: string | null;
  joinedAt: number;
  roleIds: string[];
}

/** Nome exibido no servidor: apelido, se houver. */
export const memberName = (m: { nickname?: string | null; displayName: string }) => m.nickname || m.displayName;

export interface VoiceState {
  userId: string;
  serverId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  camera: boolean;
  serverMuted: boolean;
}

export interface ServerDetail {
  server: ServerSummary;
  permissions: number;
  highestPosition: number;
  roles: Role[];
  channels: Channel[];
  members: Member[];
  voiceStates: VoiceState[];
  online: string[];
}

export type GameData =
  | { type: 'roulette'; items: string[]; result: number; turns: number }
  | { type: 'dice'; sides: number; count: number; rolls: number[] }
  | { type: 'coin'; result: 'cara' | 'coroa' };

export interface Message {
  id: string;
  /** id do canal, ou da conversa privada nas DMs */
  channelId: string;
  content: string;
  kind?: 'text' | 'game' | 'clip';
  data?: GameData | null;
  createdAt: number;
  editedAt: number | null;
  author: User;
}

/** Conversa privada (DM). */
export interface DirectChannel {
  id: string;
  user: User;
  lastMessage: Message | null;
  lastMessageAt: number;
  unread: number;
}

export interface Invite {
  code: string;
  serverId: string;
  creatorId: string;
  creatorName?: string;
  uses: number;
  maxUses: number;
  expiresAt: number | null;
  createdAt: number;
}

export interface InvitePreview {
  code: string;
  server: ServerSummary;
  memberCount: number;
  alreadyMember: boolean;
}
