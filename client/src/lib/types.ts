import type { SupporterTier } from '../../../shared/supporter.ts';
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
  /** selo de verificado: concedido pela autoridade da instalação, não pela pessoa nem pelo servidor */
  verified?: boolean;
  /** moldura animada da foto */
  frame?: string | null;
  /** fundo do mini perfil (imagem/GIF) */
  cardBgUrl?: string | null;
  /** patches costurados no cartão (não vêm junto das mensagens) */
  patches?: Patch[];
  /** patch de apoiador: o acabamento que a pessoa escolheu mostrar (só o servidor grava) */
  supporter?: { tier: SupporterTier } | null;
  /** tem o cargo de Mecenas da instalação (ver server/src/mecenas.ts) */
  mecenas?: true;
  /** tem um Mecenas: o @usuário dele */
  mecenasBy?: string;
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
  /** até 2 ao mesmo tempo, ex.: jogando e ouvindo Spotify (ver desktop/main.cjs: pollActivity) */
  activities: Activity[];
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
  // notificação do sistema: separada por tipo (antes era um "desktop" só, que sem querer também
  // controlava a de menção — ver client/src/lib/nudge.ts)
  nudgeDesktop: boolean;
  mentions: boolean; // avisar quando alguém mencionar você
  mentionDesktop: boolean;
}

export const DEFAULT_NOTIFY: NotifySettings = { nudges: true, shake: true, sound: true, nudgeDesktop: true, mentions: true, mentionDesktop: true };

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
  /** última edição de Novidades vista (id AAAA-MM-DD, ver releases/) */
  lastSeenRelease?: string;
  /** clicou "Depois eu vejo" no aviso do e-mail de recuperação: não mostra mais */
  emailPromptDismissed?: boolean;
  /** já viu o aviso de que virou Mecenas */
  mecenasSeen?: boolean;
}

export interface Me extends User {
  settings: UserSettings & Record<string, unknown>;
  hasRecoveryCode?: boolean;
  googleLinked?: boolean;
  hasPassword?: boolean;
  /** verificação em duas etapas (app autenticador) ligada */
  twoFactor?: boolean;
  /** códigos de backup do 2FA que ainda não foram usados */
  backupCodesLeft?: number;
  /** e-mail de recuperação confirmado */
  email?: string | null;
  /** e-mail esperando o clique no link de confirmação */
  emailPending?: string | null;
  /** pode conceder/revogar o selo de verificado em qualquer servidor ou pessoa */
  isAuthority?: boolean;
  /** está em ADMIN_USERS: entra no portal da equipe (/admin) */
  isAdmin?: boolean;
  /** é o Mecenas: o cargo e sobre quem tem os poderes (o selo público é `mecenas`) */
  /** página do perfil: contas conectadas e o que esta instalação oferece */
  steamLinked?: boolean;
  integrations?: { steam: boolean };
  mecenasPowers?: { title: string; target: { id: string; username: string; displayName: string } } | null;
  /** total já apoiado (centavos): decide os acabamentos liberados */
  supportTotal?: number;
  /** acabamento escolhido para o perfil (null = escondido ou ainda não apoiou) */
  supportTier?: SupporterTier | null;
}

export interface NudgeEvent {
  from: User & { nickname: string | null };
  serverId: string;
  serverName: string;
  channelId: string | null;
  at: number;
  /** mensagem opcional digitada por quem chamou a atenção, junto da tremida (sem opção de copiar) */
  message?: string;
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
  verified?: boolean;
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
  type: 'text' | 'voice' | 'forum';
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

/** Jam do Spotify fixada numa sala de voz (ver server/src/realtime.ts). */
export interface Jam {
  channelId: string;
  /** link completo da Jam (open.spotify.com/socialsession/...) */
  url: string;
  /** o link como a pessoa colou (pode ser o curto do celular, spotify.link/...) */
  sourceUrl: string;
  hostId: string;
  startedAt: number;
}

export interface ServerDetail {
  server: ServerSummary;
  permissions: number;
  highestPosition: number;
  roles: Role[];
  channels: Channel[];
  members: Member[];
  voiceStates: VoiceState[];
  jams?: Jam[];
  online: string[];
}

export type GameData =
  | { type: 'roulette'; items: string[]; result: number; turns: number }
  | { type: 'dice'; sides: number; count: number; rolls: number[] }
  | { type: 'coin'; result: 'cara' | 'coroa' };

/** Figurinha mandada no chat: guarda o endereço, então continua aparecendo mesmo se o pack for apagado. */
export interface StickerMessageData {
  stickerId: string;
  packId: string;
  packName: string;
  url: string;
}

/** Pack de figurinhas do chat, na biblioteca da pessoa. */
export interface StickerPack {
  id: string;
  name: string;
  author: string;
  /** foi a pessoa que importou (só ela edita) */
  mine: boolean;
  stickers: { id: string; url: string }[];
}

/** Arquivo anexado a uma mensagem. */
export interface Attachment {
  id: string;
  name: string;
  size: number;
  url: string;
  image: boolean;
}

export interface Message {
  id: string;
  /** id do canal, ou da conversa privada nas DMs */
  channelId: string;
  content: string;
  kind?: 'text' | 'game' | 'clip' | 'sticker';
  /** jogo (kind "game") ou figurinha (kind "sticker") */
  data?: GameData | StickerMessageData | null;
  attachments?: Attachment[];
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

/** Post de um canal de fórum. Na lista vem `excerpt`; aberto, vem `content` e as respostas. */
export interface ForumPost {
  id: string;
  channelId: string;
  title: string;
  excerpt?: string;
  content?: string;
  tag: string;
  status: string;
  pinned: boolean;
  locked: boolean;
  voteCount: number;
  replyCount: number;
  voted: boolean;
  createdAt: number;
  editedAt: number | null;
  lastActivityAt: number;
  author: User;
  replies?: ForumReply[];
}

export interface ForumReply {
  id: string;
  postId: string;
  content: string;
  createdAt: number;
  editedAt: number | null;
  author: User;
}
