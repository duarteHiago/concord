// Comandos de barra no chat (/kick, /mute, /nudge…). Cada um vira uma chamada que o app já faz pelos menus.
import { P, has } from '../../../shared/permissions.ts';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { useVoice } from '../store/voice';
import { api } from './api';
import { sendNudge } from './nudge';
import { memberName, type Channel, type Member, type ServerDetail } from './types';

export interface CommandContext {
  detail: ServerDetail;
  channel: Channel;
  /** envia uma mensagem normal no canal */
  send: (content: string) => Promise<void>;
}

export interface Command {
  name: string;
  usage: string;
  description: string;
  /** permissão necessária (no canal) para o comando aparecer */
  permission?: number;
  run: (ctx: CommandContext, args: string) => Promise<void> | void;
}

/** Encontra um membro por @usuario, apelido ou nome de exibição. */
export function findMember(detail: ServerDetail, raw: string): Member | undefined {
  const q = raw.trim().replace(/^@/, '').toLowerCase();
  if (!q) return undefined;
  return (
    detail.members.find((m) => m.username.toLowerCase() === q) ??
    detail.members.find((m) => memberName(m).toLowerCase() === q) ??
    detail.members.find((m) => m.displayName.toLowerCase() === q) ??
    detail.members.find((m) => memberName(m).toLowerCase().startsWith(q))
  );
}

function requireMember(ctx: CommandContext, args: string, usage: string): Member {
  const target = findMember(ctx.detail, args.split(/\s+/)[0] ?? '');
  if (!target) throw new Error(`Não achei esse membro. Use: ${usage}`);
  return target;
}

const memberAction = (path: string, body: unknown, ok: (name: string) => string) => async (ctx: CommandContext, args: string, usage: string) => {
  const target = requireMember(ctx, args, usage);
  await api.post(`/servers/${ctx.detail.server.id}/members/${target.id}/${path}`, body);
  toast.success(ok(memberName(target)));
};

export const COMMANDS: Command[] = [
  {
    name: 'nudge',
    usage: '/nudge @pessoa',
    description: 'Chama a atenção de alguém (a tela da pessoa treme)',
    run: async (ctx, args) => {
      const target = requireMember(ctx, args, '/nudge @pessoa');
      await sendNudge(ctx.detail.server.id, target.id, memberName(target));
    },
  },
  {
    name: 'all',
    usage: '/all mensagem',
    description: 'Envia uma mensagem que notifica todo mundo do canal',
    permission: P.MENTION_EVERYONE,
    run: (ctx, args) => ctx.send(`@todos ${args}`.trim()),
  },
  {
    name: 'me',
    usage: '/me ação',
    description: 'Mensagem de ação (ex.: /me foi buscar café)',
    run: (ctx, args) => {
      if (!args.trim()) throw new Error('Use: /me ação');
      return ctx.send(`/me ${args.trim()}`);
    },
  },
  {
    name: 'shrug',
    usage: '/shrug [texto]',
    description: 'Adiciona ¯\\_(ツ)_/¯ à mensagem',
    run: (ctx, args) => ctx.send(`${args} ¯\\_(ツ)_/¯`.trim()),
  },
  {
    name: 'sound',
    usage: '/sound nome',
    description: 'Toca um som da mesa de sons na sala em que você está',
    permission: P.USE_SOUNDBOARD,
    run: async (ctx, args) => {
      const st = useApp.getState();
      if (!st.sounds[ctx.detail.server.id]) await st.loadSounds(ctx.detail.server.id);
      const list = useApp.getState().sounds[ctx.detail.server.id] ?? [];
      const q = args.trim().toLowerCase();
      const sound = list.find((s) => s.name.toLowerCase() === q) ?? list.find((s) => s.name.toLowerCase().includes(q));
      if (!sound) throw new Error(q ? `Nenhum som chamado "${args.trim()}"` : 'Use: /sound nome');
      await api.post(`/sounds/${sound.id}/play`);
    },
  },
  {
    name: 'nick',
    usage: '/nick novo apelido',
    description: 'Muda seu apelido neste servidor (vazio remove)',
    run: async (ctx, args) => {
      await api.put(`/servers/${ctx.detail.server.id}/members/@me/nickname`, { nickname: args.trim() || null });
      toast.success(args.trim() ? `Seu apelido agora é "${args.trim()}"` : 'Apelido removido');
    },
  },
  {
    name: 'status',
    usage: '/status texto',
    description: 'Define seu status personalizado (vazio limpa)',
    run: async (_ctx, args) => {
      await useApp.getState().saveSettings({ customStatus: args.trim().slice(0, 80) });
      toast.success(args.trim() ? 'Status atualizado' : 'Status removido');
    },
  },
  {
    name: 'dnd',
    usage: '/dnd',
    description: 'Ativa o "Não perturbe"',
    run: async () => {
      await useApp.getState().saveSettings({ status: 'dnd' });
      toast.info('Não perturbe ativado');
    },
  },
  {
    name: 'online',
    usage: '/online',
    description: 'Volta a ficar online (desativa o "Não perturbe")',
    run: async () => {
      await useApp.getState().saveSettings({ status: 'online' });
      toast.info('Você está online');
    },
  },
  {
    name: 'mute',
    usage: '/mute @pessoa',
    description: 'Silencia alguém nas salas de voz (moderação)',
    permission: P.MUTE_MEMBERS,
    run: (ctx, args) => memberAction('voice-mute', { muted: true }, (n) => `${n} foi silenciado`)(ctx, args, '/mute @pessoa'),
  },
  {
    name: 'unmute',
    usage: '/unmute @pessoa',
    description: 'Remove o silenciamento de alguém (moderação)',
    permission: P.MUTE_MEMBERS,
    run: (ctx, args) => memberAction('voice-mute', { muted: false }, (n) => `${n} pode falar de novo`)(ctx, args, '/unmute @pessoa'),
  },
  {
    name: 'disconnect',
    usage: '/disconnect @pessoa',
    description: 'Tira alguém da sala de voz (moderação)',
    permission: P.MOVE_MEMBERS,
    run: (ctx, args) => memberAction('voice-disconnect', {}, (n) => `${n} foi desconectado da sala`)(ctx, args, '/disconnect @pessoa'),
  },
  {
    name: 'kick',
    usage: '/kick @pessoa',
    description: 'Expulsa alguém do servidor (moderação)',
    permission: P.KICK_MEMBERS,
    run: (ctx, args) => {
      const target = requireMember(ctx, args, '/kick @pessoa');
      useApp.getState().openModal({
        type: 'confirm',
        title: `Expulsar ${memberName(target)}`,
        message: `${memberName(target)} será removido do servidor e só poderá voltar com um novo convite.`,
        confirmLabel: 'Expulsar',
        danger: true,
        onConfirm: async () => {
          await api.del(`/servers/${ctx.detail.server.id}/members/${target.id}`);
        },
      });
    },
  },
  {
    name: 'leave',
    usage: '/leave',
    description: 'Sai da sala de voz',
    run: () => useVoice.getState().leave(),
  },
  {
    name: 'help',
    usage: '/help',
    description: 'Mostra os comandos disponíveis',
    run: () => {
      toast.info('Digite / no campo de mensagem para ver todos os comandos.');
    },
  },
];

export function availableCommands(channel: Channel): Command[] {
  return COMMANDS.filter((c) => !c.permission || has(channel.permissions, c.permission));
}

/** Executa "/comando argumentos". Devolve false se não for um comando conhecido. */
export async function runCommand(text: string, ctx: CommandContext): Promise<boolean> {
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return false;
  const command = availableCommands(ctx.channel).find((c) => c.name === m[1].toLowerCase());
  if (!command) return false;
  try {
    await command.run(ctx, m[2]);
  } catch (err) {
    toast.error(err);
  }
  return true;
}
