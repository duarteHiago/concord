import { useStickers } from './stickers';
import { receiveClip, type ClipEvent } from '../lib/clip';
import type { PlacedSticker } from '../lib/types';
import { create } from 'zustand';
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { applyTheme, DEFAULT_THEME, normalizeTheme } from '../lib/theme';
import { receiveDirectMessage, receiveMention, type MentionEvent } from '../lib/mentions';
import { receiveNudge } from '../lib/nudge';
import { startActivityReporter } from '../lib/activity';
import { installShortcuts, syncGlobalShortcuts } from '../lib/shortcuts';
import { announceGame } from '../lib/liveGames';
import { desktop } from '../lib/desktop';
import { playSoundboard } from '../lib/soundboard';
import type {
  DirectChannel,
  Jam,
  Me,
  Message,
  NudgeEvent,
  Presence,
  ServerDetail,
  ServerSummary,
  Sound,
  ThemeSettings,
  UserSettings,
  VoiceState,
} from '../lib/types';

/** Seções da página de Configurações (ver components/settings/SettingsPage.tsx). */
export type SettingsTab = 'profile' | 'account' | 'privacy' | 'support' | 'mecenato' | 'appearance' | 'notifications' | 'audio' | 'shortcuts' | 'bots' | 'dev';

/** activeServerId especial: a tela de conversas privadas. */
export const HOME = '@me';
import { toast } from './toast';
import { FORUM_STATUSES } from '../../../shared/forum.ts';
import { useVoice } from './voice';
import { useStickerPacks } from './stickerPacks';
import { useContracts } from './contracts';

export type Modal =
  | { type: 'addServer'; tab?: 'create' | 'join'; code?: string }
  | { type: 'invite'; serverId: string }
  | { type: 'serverSettings'; serverId: string; tab?: string }
  | { type: 'channelSettings'; channelId: string; serverId: string }
  | { type: 'createChannel'; serverId: string; kind: 'text' | 'voice' | 'forum' }
  | { type: 'userSettings'; tab?: SettingsTab | 'style' }
  | { type: 'support' }
  | { type: 'shareScreen' }
  | { type: 'nickname'; serverId: string; userId: string }
  | { type: 'recoveryCode'; code: string; next?: Modal; afterReset?: boolean }
  | { type: 'backupCodes'; codes: string[]; next?: Modal }
  | { type: 'image'; src: string; alt: string }
  | { type: 'roulette'; target: { kind: 'channel' | 'dm'; id: string } }
  | { type: 'quickSwitch' }
  | { type: 'onboarding' }
  | { type: 'whatsNew'; ids: string[] }
  | { type: 'emailPrompt' }
  | { type: 'mecenas' }
  | { type: 'pranks' }
  | { type: 'contractRenewal' }
  | { type: 'finePix'; fineId: string; amountCents: number }
  | { type: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void };

interface AppState {
  ready: boolean;
  me: Me | null;
  servers: ServerSummary[];
  details: Record<string, ServerDetail>;
  activeServerId: string | null;
  activeChannels: Record<string, string>;
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  voiceStates: Record<string, VoiceState[]>;
  /** Jams do Spotify fixadas nas salas, por servidor */
  jams: Record<string, Jam[]>;
  online: Record<string, Presence>;
  sounds: Record<string, Sound[]>;
  loadSounds: (serverId: string) => Promise<void>;
  /** chamada de atenção recebida, mostrada no cartão do app */
  nudge: NudgeEvent | null;
  typing: Record<string, Record<string, number>>;
  modal: Modal | null;
  memberListOpen: boolean;
  /** página "Novidades" aberta no lugar da conversa (abrir um servidor, canal ou conversa fecha) */
  releasesOpen: boolean;
  openReleases: () => void;
  closeReleases: () => void;
  /** página do perfil de alguém aberta no lugar da conversa (mesmas regras de fechar que a de Novidades) */
  profile: { userId: string; serverId: string | null } | null;
  /** página de Configurações aberta (na seção indicada), no lugar da conversa */
  settings: SettingsTab | null;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  openProfile: (userId: string, serverId?: string | null) => void;
  closeProfile: () => void;
  pendingInvite: string | null;
  /** cadastro pelo Google esperando a pessoa escolher o nome de usuário */
  googleSignup: string | null;
  /** link de "esqueci minha senha" aberto do e-mail: a tela pede a senha nova */
  emailReset: string | null;
  emailResetSubmit: (newPassword: string) => Promise<void>;
  /** mensagem sendo respondida em cada canal/conversa (a faixa em cima do campo de texto) */
  replying: Record<string, Message>;
  setReplying: (conversationId: string, message: Message | null) => void;
  /** senha (ou Google) conferida, falta o código do app autenticador: o ticket da segunda etapa */
  mfaTicket: string | null;
  submitTwoFactor: (code: string) => Promise<void>;

  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  googleSignupSubmit: (username: string, displayName: string) => Promise<'done' | 'desktop'>;
  /** já tem conta no Concord: entra com usuário e senha e conecta o Google a ela */
  googleSignupLink: (username: string, password: string) => Promise<'done' | 'desktop'>;
  register: (username: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (username: string, code: string, newPassword: string) => Promise<void>;
  logout: () => void;
  setMe: (me: Me) => void;
  saveTheme: (theme: ThemeSettings) => void;
  saveSettings: (patch: Partial<UserSettings>) => Promise<void>;
  loadServers: () => Promise<void>;
  loadDetail: (serverId: string) => Promise<void>;
  openServer: (serverId: string) => void;
  /** conversas privadas (null = ainda não carregou) */
  dms: DirectChannel[] | null;
  activeDmId: string | null;
  loadDms: () => Promise<void>;
  openDm: (userId: string) => Promise<void>;
  openDmById: (dmId: string) => void;
  loadDmMessages: (dmId: string, older?: boolean) => Promise<void>;
  markDmRead: (dmId: string) => void;
  openChannel: (serverId: string, channelId: string) => void;
  loadMessages: (channelId: string, older?: boolean) => Promise<void>;
  openModal: (modal: Modal) => void;
  closeModal: () => void;
  toggleMemberList: () => void;
}

const LAST_KEY = 'concord.last';
function saveLast(serverId: string, channels: Record<string, string>) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ serverId, channels }));
  } catch {
    // ignorado
  }
}
function loadLast(): { serverId?: string; channels?: Record<string, string> } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const reloadTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let themeSaveTimer: ReturnType<typeof setTimeout> | undefined;
/** quando este aparelho mexeu nas preferências pela última vez (ignora o eco do servidor logo depois) */
let localSettingsAt = 0;

/** Resposta de um login: a sessão, ou (com 2FA) só o ticket para pedir o código. */
type LoginResponse = { token?: string; user?: Me; recoveryCode?: string; mfa?: string };

export const useApp = create<AppState>((set, get) => {
  /** Com 2FA, guarda o ticket (a tela de login passa a pedir o código) e avisa que ainda não entrou. */
  function needsCode(res: LoginResponse): boolean {
    if (!res.mfa) return false;
    set({ mfaTicket: res.mfa });
    return true;
  }

  /** Mensagem editada: troca ela na lista e atualiza a citação nas respostas a ela. */
  function replaceMessage(list: Message[], msg: Message): Message[] {
    return list.map((m) =>
      m.id === msg.id
        ? msg
        : m.replyTo?.id === msg.id && !m.replyTo.deleted
          ? { ...m, replyTo: { ...m.replyTo, content: msg.content.slice(0, 200) } }
          : m,
    );
  }

  /** Mensagem apagada: sai da lista, as respostas a ela passam a mostrar "mensagem apagada". */
  function removeMessage(list: Message[], id: string): Message[] {
    return list.filter((m) => m.id !== id).map((m) => (m.replyTo?.id === id ? { ...m, replyTo: { id, deleted: true as const } } : m));
  }

  /** Se a mensagem que a pessoa estava respondendo foi apagada, a faixa some. */
  function dropReplying(conversationId: string, id: string) {
    if (get().replying[conversationId]?.id === id) get().setReplying(conversationId, null);
  }

  /** Insere/atualiza uma conversa e mantém a lista ordenada pela última mensagem. */
  function upsertDm(dm: DirectChannel) {
    const list = (get().dms ?? []).filter((d) => d.id !== dm.id);
    set({ dms: [dm, ...list].sort((a, b) => b.lastMessageAt - a.lastMessageAt) });
  }

  function startSession(token: string, me: Me) {
    setToken(token);
    applyTheme(normalizeTheme(me.settings?.theme));
    const code = get().pendingInvite;
    set({
      me,
      pendingInvite: null,
      ...(code
        ? { modal: { type: 'addServer', tab: 'join', code } }
        : !me.settings?.onboarded
          ? { modal: { type: 'onboarding' } }
          : {}),
    });
    const socket = connectSocket(token);

    socket.on('connect', () => {
      void get().loadServers();
      useVoice.getState().resync();
      // contrato de Mecenato: a renovação do contrato antigo aparece logo ao entrar (ver Mecenato.tsx)
      void useContracts.getState().load();
    });
    socket.on('contract:updated', () => void useContracts.getState().load());
    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') get().logout();
    });
    // o servidor derrubou a conexão (ex.: a senha foi trocada em outro aparelho): se o token ainda
    // vale, reconecta; se não, a API responde 401 e a sessão é encerrada
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') void api.get<Me>('/me').then(() => socket.connect(), () => {});
    });
    socket.on('server:changed', ({ serverId }: { serverId: string }) => {
      clearTimeout(reloadTimers[serverId]);
      reloadTimers[serverId] = setTimeout(() => {
        if (get().details[serverId]) void get().loadDetail(serverId);
        // servidores ainda não abertos: só atualiza nome/ícone na barra
        else void api.get<ServerSummary[]>('/servers').then((servers) => set({ servers }), () => {});
      }, 120);
    });
    socket.on('server:removed', ({ serverId, reason }: { serverId: string; reason: string }) => {
      if (useVoice.getState().serverId === serverId) void useVoice.getState().leave();
      const { [serverId]: _d, ...details } = get().details;
      const servers = get().servers.filter((s) => s.id !== serverId);
      set({ servers, details, activeServerId: get().activeServerId === serverId ? (servers[0]?.id ?? null) : get().activeServerId });
      const next = get().activeServerId;
      if (next) get().openServer(next);
      toast.info(reason);
    });
    socket.on('voice:states', ({ serverId, states }: { serverId: string; states: VoiceState[] }) => {
      set({ voiceStates: { ...get().voiceStates, [serverId]: states } });
    });
    socket.on('voice:jams', ({ serverId, jams }: { serverId: string; jams: Jam[] }) => {
      set({ jams: { ...get().jams, [serverId]: jams } });
    });
    type PresencePayload = Partial<Presence> & { userId: string; online?: boolean };
    const toPresence = (p: PresencePayload): Presence => ({
      status: p.status === 'dnd' ? 'dnd' : 'online',
      customStatus: p.customStatus ?? '',
      activities: p.activities ?? [],
    });
    socket.on('presence:list', (list: PresencePayload[]) => {
      set({ online: Object.fromEntries(list.map((p) => [p.userId, toPresence(p)])) });
    });
    socket.on('presence', (p: PresencePayload) => {
      const next = { ...get().online };
      if (p.online) next[p.userId] = toPresence(p);
      else delete next[p.userId];
      set({ online: next });
    });
    socket.on('nudge', (n: NudgeEvent) => receiveNudge(n));
    socket.on('reaction', (r: unknown) => window.dispatchEvent(new CustomEvent('concord:reaction', { detail: r })));
    socket.on('mention', (m: MentionEvent) => receiveMention(m));
    socket.on('sounds:changed', ({ serverId }: { serverId: string }) => {
      if (get().sounds[serverId]) void get().loadSounds(serverId);
    });
    socket.on('clip', (e: ClipEvent) => receiveClip(e));
    socket.on('sticker-packs:changed', () => useStickerPacks.getState().changed());
    // fórum: a tela aberta recarrega; quem postou fica sabendo de respostas e mudanças de status
    socket.on('forum:changed', (d: { channelId: string; postId?: string }) => window.dispatchEvent(new CustomEvent('concord:forum', { detail: d })));
    socket.on('forum:status', (d: { title: string; status: string }) => {
      const label = FORUM_STATUSES.find((x) => x.id === d.status)?.label ?? d.status;
      toast.success(`Seu post "${d.title}" agora está: ${label}`);
    });
    socket.on('forum:reply', (d: { title: string; reply: { author: { displayName: string } } }) => {
      toast.info(`${d.reply.author.displayName} respondeu seu post "${d.title}"`);
    });
    // mudanças feitas em outro aparelho (preferências, status, perfil)
    socket.on('me:updated', (next: Me) => {
      const cur = get().me;
      if (!cur || cur.id !== next.id) return;
      const echo = Date.now() - localSettingsAt < 4000; // provavelmente a resposta da mudança feita aqui mesmo
      if (echo || JSON.stringify(cur.settings) === JSON.stringify(next.settings)) {
        set({ me: { ...cur, ...next, settings: cur.settings } });
        return;
      }
      set({ me: { ...cur, ...next } });
      applyTheme(normalizeTheme(next.settings?.theme));
    });
    socket.on('server-patches:changed', (d: { serverId: string }) =>
      window.dispatchEvent(new CustomEvent('concord:server-patches', { detail: d })),
    );
    socket.on('stickers:changed', ({ channelId, stickers }: { channelId: string; stickers: PlacedSticker[] }) =>
      useStickers.getState().setPlaced(channelId, stickers),
    );
    socket.on('custom-stickers:changed', ({ serverId }: { serverId: string }) => {
      if (useStickers.getState().custom[serverId]) void useStickers.getState().loadCustom(serverId);
    });
    socket.on('sound:play', (e: { url: string; userId: string; channelId: string; name: string }) => playSoundboard(e));
    socket.on('message:new', (msg: Message) => {
      if (msg.kind === 'game') announceGame(msg, { kind: 'channel', id: msg.channelId });
      const list = get().messages[msg.channelId];
      const typing = { ...get().typing[msg.channelId] };
      delete typing[msg.author.id];
      set({
        typing: { ...get().typing, [msg.channelId]: typing },
        ...(list && !list.some((m) => m.id === msg.id) ? { messages: { ...get().messages, [msg.channelId]: [...list, msg] } } : {}),
      });
    });
    socket.on('message:update', (msg: Message) => {
      const list = get().messages[msg.channelId];
      if (list) set({ messages: { ...get().messages, [msg.channelId]: replaceMessage(list, msg) } });
    });
    socket.on('message:delete', ({ id, channelId }: { id: string; channelId: string }) => {
      const list = get().messages[channelId];
      if (list) set({ messages: { ...get().messages, [channelId]: removeMessage(list, id) } });
      dropReplying(channelId, id);
    });
    socket.on('dm:message', ({ dm, message }: { dm: DirectChannel; message: Message }) => {
      if (message.kind === 'game') announceGame(message, { kind: 'dm', id: dm.id });
      const list = get().messages[dm.id];
      if (list && !list.some((m) => m.id === message.id)) set({ messages: { ...get().messages, [dm.id]: [...list, message] } });
      const viewing = get().activeServerId === HOME && get().activeDmId === dm.id && document.hasFocus();
      upsertDm(viewing ? { ...dm, unread: 0 } : dm);
      if (message.author.id === get().me?.id) return;
      if (viewing) void api.post(`/dms/${dm.id}/read`).catch(() => {});
      else receiveDirectMessage(dm, message);
    });
    socket.on('dm:update', ({ message }: { message: Message }) => {
      const list = get().messages[message.channelId];
      if (list) set({ messages: { ...get().messages, [message.channelId]: replaceMessage(list, message) } });
    });
    socket.on('dm:delete', ({ dm, message }: { dm: DirectChannel; message: { id: string; channelId: string } }) => {
      const list = get().messages[message.channelId];
      if (list) set({ messages: { ...get().messages, [message.channelId]: removeMessage(list, message.id) } });
      dropReplying(message.channelId, message.id);
      upsertDm(dm);
    });
    socket.on('typing', ({ channelId, userId }: { channelId: string; userId: string }) => {
      if (userId === get().me?.id) return;
      set({ typing: { ...get().typing, [channelId]: { ...get().typing[channelId], [userId]: Date.now() + 6000 } } });
    });
    useVoice.getState().bindSocket(socket);
    startActivityReporter(socket);
    installShortcuts();
    syncGlobalShortcuts();
  }

  return {
    ready: false,
    me: null,
    servers: [],
    details: {},
    activeServerId: null,
    activeChannels: loadLast().channels ?? {},
    messages: {},
    hasMore: {},
    voiceStates: {},
    jams: {},
    online: {},
    nudge: null,
    sounds: {},
    loadSounds: async (serverId) => {
      try {
        const list = await api.get<Sound[]>(`/servers/${serverId}/sounds`);
        set({ sounds: { ...get().sounds, [serverId]: list } });
      } catch (err) {
        toast.error(err);
      }
    },
    typing: {},
    modal: null,
    memberListOpen: true,
    pendingInvite: null,
    googleSignup: null,
    emailReset: null,
    mfaTicket: null,
    replying: {},
    setReplying: (conversationId, message) => {
      const { [conversationId]: _old, ...rest } = get().replying;
      set({ replying: message ? { ...rest, [conversationId]: message } : rest });
    },

    bootstrap: async () => {
      setUnauthorizedHandler(() => get().logout());
      const match = location.pathname.match(/^\/invite\/([\w-]+)/);
      if (match) {
        // o convite só é aberto depois do login (startSession)
        history.replaceState(null, '', '/');
        set({ pendingInvite: match[1] });
      }
      // volta do login com Google: o resultado vem no fragmento (#) e é apagado da barra de endereço
      const hash = new URLSearchParams(location.hash.slice(1));
      let googleNote: (() => void) | null = null;
      if ([...hash.keys()].some((k) => k.startsWith('google-'))) {
        history.replaceState(null, '', location.pathname + location.search);
        if (hash.get('google-token')) setToken(hash.get('google-token'));
        if (hash.get('google-mfa')) set({ mfaTicket: hash.get('google-mfa') });
        if (hash.get('google-signup')) set({ googleSignup: hash.get('google-signup') });
        const err = hash.get('google-error');
        if (err) googleNote = () => toast.error(err);
        if (hash.get('google-linked')) googleNote = () => toast.success('Conta Google conectada. Agora você também entra com ela.');
      }
      // links dos e-mails: trocar a senha ou confirmar o endereço
      const verifyEmail = hash.get('verify-email');
      if (hash.get('reset-email') || verifyEmail) {
        history.replaceState(null, '', location.pathname + location.search);
        if (hash.get('reset-email')) set({ emailReset: hash.get('reset-email') });
        if (verifyEmail) {
          googleNote = () =>
            void api.post<{ email: string }>('/auth/email/verify', { token: verifyEmail }).then(
              ({ email }) => toast.success(`E-mail ${email} confirmado. Se esquecer a senha, o link de recuperação vai para ele.`),
              toast.error,
            );
        }
      }
      const token = getToken();
      if (token) {
        try {
          const me = await api.get<Me>('/me');
          startSession(token, me);
        } catch {
          setToken(null);
        }
      }
      set({ ready: true });
      googleNote?.();
    },

    loginWithToken: async (token) => {
      setToken(token);
      startSession(token, await api.get<Me>('/me'));
    },

    googleSignupSubmit: async (username, displayName) => {
      const res = await api.post<LoginResponse & { desktopRedirect?: string }>('/auth/google/signup', {
        ticket: get().googleSignup,
        username,
        displayName,
      });
      set({ googleSignup: null });
      // pedido pelo app desktop: o navegador leva o resultado até o endereço local do app
      if (res.desktopRedirect) {
        location.href = res.desktopRedirect;
        return 'desktop';
      }
      if (needsCode(res)) return 'done';
      startSession(res.token!, res.user!);
      if (res.recoveryCode) set({ modal: { type: 'recoveryCode', code: res.recoveryCode, next: get().modal ?? undefined } });
      return 'done';
    },

    googleSignupLink: async (username, password) => {
      const res = await api.post<LoginResponse & { desktopRedirect?: string }>('/auth/google/signup/link', {
        ticket: get().googleSignup,
        username,
        password,
      });
      set({ googleSignup: null });
      // pedido pelo app desktop: o navegador leva o resultado até o endereço local do app
      if (res.desktopRedirect) {
        location.href = res.desktopRedirect;
        return 'desktop';
      }
      if (needsCode(res)) return 'done';
      startSession(res.token!, res.user!);
      toast.success('Conta Google conectada. Da próxima vez é só usar "Entrar com Google".');
      return 'done';
    },

    emailResetSubmit: async (newPassword) => {
      const res = await api.post<LoginResponse>('/auth/reset-email', { token: get().emailReset, newPassword });
      if (get().me) get().logout();
      set({ emailReset: null });
      toast.success('Senha nova salva. Os outros aparelhos saíram da conta.');
      if (needsCode(res)) return;
      startSession(res.token!, res.user!);
    },

    login: async (username, password) => {
      const res = await api.post<LoginResponse>('/auth/login', { username, password });
      if (needsCode(res)) return;
      startSession(res.token!, res.user!);
    },

    submitTwoFactor: async (code) => {
      const res = await api.post<{ token: string; user: Me; recoveryCode?: string; usedBackup?: boolean }>('/auth/2fa', { ticket: get().mfaTicket, code });
      set({ mfaTicket: null });
      startSession(res.token, res.user);
      // entrou pelo código de recuperação: o novo só aparece agora, depois da segunda etapa
      if (res.recoveryCode) set({ modal: { type: 'recoveryCode', code: res.recoveryCode, next: get().modal ?? undefined, afterReset: true } });
      if (res.usedBackup) {
        const left = res.user.backupCodesLeft ?? 0;
        toast.info(
          left > 2
            ? `Código de backup usado. Restam ${left}.`
            : `Código de backup usado. Restam só ${left}: gere novos em Configurações > Conta.`,
        );
      }
    },

    register: async (username, password, displayName) => {
      const { token, user, recoveryCode } = await api.post<{ token: string; user: Me; recoveryCode: string }>('/auth/register', {
        username,
        password,
        displayName,
      });
      startSession(token, user);
      // mostra o código de recuperação primeiro; um convite pendente abre depois
      set({ modal: { type: 'recoveryCode', code: recoveryCode, next: get().modal ?? undefined } });
    },

    resetPassword: async (username, code, newPassword) => {
      const res = await api.post<LoginResponse>('/auth/reset', {
        username,
        code,
        newPassword,
      });
      if (needsCode(res)) return;
      startSession(res.token!, res.user!);
      set({ modal: { type: 'recoveryCode', code: res.recoveryCode!, next: get().modal ?? undefined, afterReset: true } });
    },

    logout: () => {
      void useVoice.getState().leave();
      void desktop?.setGlobalShortcuts?.({});
      disconnectSocket();
      setToken(null);
      applyTheme(DEFAULT_THEME);
      set({ me: null, servers: [], details: {}, activeServerId: null, messages: {}, voiceStates: {}, modal: null, mfaTicket: null });
    },

    setMe: (me) => set({ me }),

    saveSettings: async (patch) => {
      localSettingsAt = Date.now();
      const me = get().me;
      if (!me) return;
      const previous = me.settings;
      const settings = { ...previous, ...patch };
      set({ me: { ...me, settings } });
      try {
        await api.patch('/me', { settings });
      } catch (err) {
        set({ me: { ...get().me!, settings: previous } });
        toast.error(err);
      }
    },

    saveTheme: (theme) => {
      localSettingsAt = Date.now();
      applyTheme(theme);
      const me = get().me;
      if (!me) return;
      const settings = { ...me.settings, theme };
      set({ me: { ...me, settings } });
      // salva no perfil com atraso, para não mandar uma requisição a cada movimento de slider
      clearTimeout(themeSaveTimer);
      themeSaveTimer = setTimeout(() => void api.patch('/me', { settings }).catch(toast.error), 600);
    },

    loadServers: async () => {
      const servers = await api.get<ServerSummary[]>('/servers');
      set({ servers });
      void get().loadDms();
      const current = get().activeServerId;
      const last = loadLast().serverId;
      const target =
        current === HOME || (!current && last === HOME)
          ? HOME
          : (servers.find((s) => s.id === current)?.id ?? servers.find((s) => s.id === last)?.id ?? servers[0]?.id);
      // reconectar reabre o servidor atual, mas não deve tirar a pessoa da página de Novidades
      const keepReleases = get().releasesOpen;
      const keepProfile = get().profile;
      const keepSettings = get().settings;
      if (target) get().openServer(target);
      else set({ activeServerId: null });
      if (keepReleases) set({ releasesOpen: true });
      if (keepProfile) set({ profile: keepProfile });
      if (keepSettings) set({ settings: keepSettings });
      // recarrega os servidores já abertos (reconexão)
      for (const id of Object.keys(get().details)) if (id !== target) void get().loadDetail(id);
    },

    loadDetail: async (serverId) => {
      try {
        const detail = await api.get<ServerDetail>(`/servers/${serverId}`);
        set({
          details: { ...get().details, [serverId]: detail },
          // mantém a barra de servidores em dia (nome e ícone mudam sem precisar recarregar)
          servers: get().servers.map((s) => (s.id === serverId ? detail.server : s)),
          voiceStates: { ...get().voiceStates, [serverId]: detail.voiceStates },
          jams: { ...get().jams, [serverId]: detail.jams ?? [] },
        });
        // canal ativo sumiu (apagado ou sem permissão)? escolhe outro
        const active = get().activeChannels[serverId];
        if (!active || !detail.channels.some((c) => c.id === active)) {
          const first = detail.channels.find((c) => c.type === 'text') ?? detail.channels[0];
          if (first) get().openChannel(serverId, first.id);
        } else if (get().activeServerId === serverId) {
          const ch = detail.channels.find((c) => c.id === active);
          if (ch?.type === 'text' && !get().messages[ch.id]) void get().loadMessages(ch.id);
        }
      } catch (err) {
        toast.error(err);
      }
    },

    openServer: (serverId) => {
      set({ activeServerId: serverId, releasesOpen: false, profile: null, settings: null });
      saveLast(serverId, get().activeChannels);
      if (serverId === HOME) {
        void get().loadDms();
        return;
      }
      void get().loadDetail(serverId);
    },

    // ---- conversas privadas ----
    dms: null,
    activeDmId: null,

    loadDms: async () => {
      try {
        set({ dms: await api.get<DirectChannel[]>('/dms') });
      } catch {
        // tenta de novo na próxima vez
      }
    },

    openDm: async (userId) => {
      try {
        const dm = await api.post<DirectChannel>('/dms', { userId });
        upsertDm(dm);
        get().openDmById(dm.id);
      } catch (err) {
        toast.error(err);
      }
    },

    openDmById: (dmId) => {
      set({ activeServerId: HOME, activeDmId: dmId, releasesOpen: false, profile: null, settings: null });
      saveLast(HOME, get().activeChannels);
      if (!get().messages[dmId]) void get().loadDmMessages(dmId);
      get().markDmRead(dmId);
    },

    loadDmMessages: async (dmId, older = false) => {
      const current = get().messages[dmId] ?? [];
      const before = older && current.length ? `&before=${current[0].createdAt}` : '';
      try {
        const batch = await api.get<Message[]>(`/dms/${dmId}/messages?limit=50${before}`);
        set({
          messages: { ...get().messages, [dmId]: older ? [...batch, ...current] : batch },
          hasMore: { ...get().hasMore, [dmId]: batch.length === 50 },
        });
      } catch (err) {
        toast.error(err);
      }
    },

    markDmRead: (dmId) => {
      const dm = get().dms?.find((d) => d.id === dmId);
      if (!dm || dm.unread === 0) return;
      upsertDm({ ...dm, unread: 0 });
      void api.post(`/dms/${dmId}/read`).catch(() => {});
    },

    openChannel: (serverId, channelId) => {
      const activeChannels = { ...get().activeChannels, [serverId]: channelId };
      set({ activeChannels, releasesOpen: false, profile: null, settings: null });
      saveLast(serverId, activeChannels);
      const ch = get().details[serverId]?.channels.find((c) => c.id === channelId);
      if (ch?.type === 'text' && !get().messages[channelId]) void get().loadMessages(channelId);
    },

    loadMessages: async (channelId, older = false) => {
      const current = get().messages[channelId] ?? [];
      const before = older && current.length ? `&before=${current[0].createdAt}` : '';
      try {
        const batch = await api.get<Message[]>(`/channels/${channelId}/messages?limit=50${before}`);
        const merged = older ? [...batch, ...current] : batch;
        set({
          messages: { ...get().messages, [channelId]: merged },
          hasMore: { ...get().hasMore, [channelId]: batch.length === 50 },
        });
      } catch (err) {
        toast.error(err);
      }
    },

    // as Configurações viraram página: quem pede a "janela" de configurações (de qualquer lugar do app) abre ela
    openModal: (modal) =>
      modal.type === 'userSettings'
        ? set({ settings: modal.tab === 'style' || !modal.tab ? 'profile' : modal.tab, profile: null, releasesOpen: false, modal: null })
        : set({ modal }),
    closeModal: () => set({ modal: null }),
    toggleMemberList: () => set({ memberListOpen: !get().memberListOpen }),
    releasesOpen: false,
    openReleases: () => set({ releasesOpen: true, profile: null, settings: null }),
    profile: null,
    openProfile: (userId, serverId = null) => set({ profile: { userId, serverId }, releasesOpen: false, settings: null }),
    settings: null,
    openSettings: (tab = 'profile') => set({ settings: tab, profile: null, releasesOpen: false }),
    closeSettings: () => set({ settings: null }),
    closeProfile: () => set({ profile: null }),
    closeReleases: () => set({ releasesOpen: false }),
  };
});

// ---- Seletores utilitários ----

export function useActiveDetail(): ServerDetail | undefined {
  return useApp((s) => (s.activeServerId ? s.details[s.activeServerId] : undefined));
}

export function memberTopRole(detail: ServerDetail, userId: string) {
  const m = detail.members.find((x) => x.id === userId);
  if (!m) return undefined;
  return detail.roles.filter((r) => m.roleIds.includes(r.id)).sort((a, b) => b.position - a.position)[0];
}

export function memberColor(detail: ServerDetail | undefined, userId: string): string | undefined {
  if (!detail) return undefined;
  const m = detail.members.find((x) => x.id === userId);
  if (!m) return undefined;
  return detail.roles
    .filter((r) => m.roleIds.includes(r.id) && r.color)
    .sort((a, b) => b.position - a.position)[0]?.color ?? undefined;
}

/** Posição do cargo mais alto (para checar hierarquia no cliente). */
export function memberPosition(detail: ServerDetail, userId: string): number {
  if (detail.server.ownerId === userId) return 1e9;
  const m = detail.members.find((x) => x.id === userId);
  return Math.max(0, ...detail.roles.filter((r) => m?.roleIds.includes(r.id)).map((r) => r.position));
}
