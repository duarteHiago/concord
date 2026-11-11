// Widgets oficiais do Mural. Componentes nativos (sem iframe nem HTML de fora): o texto é sempre texto.
import { ExternalLink, Hash, Headphones, Music2, Pause, Play, Trophy, Volume2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { WidgetPlacement, WidgetProps } from '../../../shared/workshop.ts';
import { api } from '../lib/api';
import { memberName, type Member } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Avatar, cx } from '../components/ui';
import type { Pack } from './packs';
import { useWorkshop } from './store';

export interface WidgetContext {
  serverId: string;
  /** pacote do fundo do Mural: os cards ficam com a cara dele */
  pack: Pack | null;
  /** no editor: sem ações de verdade (abrir canal, começar pomodoro) */
  editing?: boolean;
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const muted = (ctx: WidgetContext) => (ctx.pack ? 'ws-muted' : 'text-fg-muted');
const accent = (ctx: WidgetContext) => (ctx.pack ? 'ws-accent' : 'text-accent');
const chip = (ctx: WidgetContext) => (ctx.pack ? 'ws-chip' : 'bg-surface-3');

function Title({ ctx, children, icon }: { ctx: WidgetContext; children: ReactNode; icon?: ReactNode }) {
  if (!children) return null;
  return (
    <div className={cx('mb-2 flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider uppercase', muted(ctx))}>
      {icon}
      <span className="truncate">{children}</span>
    </div>
  );
}

export function WidgetBody({ w, ctx }: { w: WidgetPlacement; ctx: WidgetContext }) {
  switch (w.type) {
    case 'text':
      return <TextWidget p={w.props} ctx={ctx} />;
    case 'rules':
      return <RulesWidget p={w.props} ctx={ctx} />;
    case 'countdown':
      return <CountdownWidget p={w.props} ctx={ctx} />;
    case 'voice':
      return <VoiceWidget p={w.props} ctx={ctx} />;
    case 'online':
      return <OnlineWidget p={w.props} ctx={ctx} />;
    case 'scoreboard':
      return <ScoreWidget p={w.props} ctx={ctx} />;
    case 'pomodoro':
      return <PomodoroWidget id={w.id} p={w.props} ctx={ctx} />;
    case 'channels':
      return <ChannelsWidget p={w.props} ctx={ctx} />;
    case 'clock':
      return <ClockWidget p={w.props} ctx={ctx} />;
    case 'image':
      return <ImageWidget p={w.props} ctx={ctx} />;
    case 'links':
      return <LinksWidget p={w.props} ctx={ctx} />;
    case 'jam':
      return <JamWidget p={w.props} ctx={ctx} />;
  }
}

function TextWidget({ p, ctx }: { p: WidgetProps['text']; ctx: WidgetContext }) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cx(
          'mb-1.5 font-display text-lg leading-tight font-extrabold',
          p.tone === 'accent' && accent(ctx),
          p.tone === 'warn' && 'text-danger',
        )}
      >
        {p.title}
      </div>
      <p className={cx('min-h-0 flex-1 overflow-auto text-sm leading-relaxed whitespace-pre-wrap', muted(ctx))}>{p.body}</p>
    </div>
  );
}

function RulesWidget({ p, ctx }: { p: WidgetProps['rules']; ctx: WidgetContext }) {
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx}>{p.title}</Title>
      <ol className="min-h-0 flex-1 space-y-1.5 overflow-auto text-sm">
        {p.items.map((r, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black', chip(ctx), accent(ctx))}>{i + 1}</span>
            <span className="leading-snug">{r}</span>
          </li>
        ))}
        {!p.items.length && <li className={muted(ctx)}>Nenhuma regra ainda.</li>}
      </ol>
    </div>
  );
}

function CountdownWidget({ p, ctx }: { p: WidgetProps['countdown']; ctx: WidgetContext }) {
  const now = useNow(1000);
  const left = Math.max(0, p.at - now);
  const parts = [
    [Math.floor(left / 86400_000), 'dias'],
    [Math.floor(left / 3600_000) % 24, 'h'],
    [Math.floor(left / 60_000) % 60, 'min'],
    [Math.floor(left / 1000) % 60, 's'],
  ] as const;
  const when = new Date(p.at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx}>{p.title}</Title>
      {left === 0 ? (
        <div className={cx('flex flex-1 items-center font-display text-2xl font-black', accent(ctx))}>{p.doneText || 'Começou!'}</div>
      ) : (
        <div className="flex flex-1 items-center gap-2">
          {parts.map(([n, label]) => (
            <div key={label} className={cx('min-w-0 flex-1 rounded-2xl px-1 py-2 text-center', chip(ctx))}>
              <div className="font-display text-2xl leading-none font-black tabular-nums">{String(n).padStart(2, '0')}</div>
              <div className={cx('mt-1 text-[10px] font-bold uppercase', muted(ctx))}>{label}</div>
            </div>
          ))}
        </div>
      )}
      <div className={cx('mt-2 truncate text-xs capitalize', muted(ctx))}>{when}</div>
    </div>
  );
}

function useDetail(serverId: string) {
  return useApp((s) => s.details[serverId]);
}

function Person({ m, size = 22 }: { m: Member; size?: number }) {
  return <Avatar name={memberName(m)} color={m.avatarColor} src={m.avatarUrl} size={size} />;
}

function VoiceWidget({ p, ctx }: { p: WidgetProps['voice']; ctx: WidgetContext }) {
  const detail = useDetail(ctx.serverId);
  const states = useApp((s) => s.voiceStates[ctx.serverId]) ?? [];
  const rooms = (detail?.channels ?? []).filter((c) => c.type === 'voice');
  const members = new Map((detail?.members ?? []).map((m) => [m.id, m]));
  const busy = rooms.map((r) => ({ room: r, people: states.filter((v) => v.channelId === r.id) })).filter((r) => r.people.length);
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx} icon={<Volume2 size={12} />}>
        {p.title}
      </Title>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-auto">
        {busy.map(({ room, people }) => (
          <button
            key={room.id}
            type="button"
            disabled={ctx.editing}
            onClick={() => useApp.getState().openChannel(ctx.serverId, room.id)}
            className={cx('block w-full rounded-2xl p-2.5 text-left transition-transform enabled:hover:scale-[1.01]', chip(ctx))}
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
              <Headphones size={14} className={accent(ctx)} />
              <span className="truncate">{room.name}</span>
              <span className={cx('ml-auto text-xs', muted(ctx))}>{people.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {people.map((v) => {
                const m = members.get(v.userId);
                return m ? (
                  <span key={v.userId} className="flex items-center gap-1.5 text-xs">
                    <Person m={m} size={20} />
                    <span className="max-w-24 truncate">{memberName(m)}</span>
                    {v.streaming && <span className="rounded bg-danger px-1 text-[9px] font-black text-white">AO VIVO</span>}
                  </span>
                ) : null;
              })}
            </div>
          </button>
        ))}
        {!busy.length && <div className={cx('text-sm', muted(ctx))}>Ninguém nas salas agora.</div>}
      </div>
    </div>
  );
}

function OnlineWidget({ p, ctx }: { p: WidgetProps['online']; ctx: WidgetContext }) {
  const detail = useDetail(ctx.serverId);
  const online = useApp((s) => s.online);
  const people = (detail?.members ?? []).filter((m) => online[m.id]);
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx}>{p.title}</Title>
      <div className="flex items-baseline gap-2">
        <span className={cx('font-display text-4xl leading-none font-black', accent(ctx))}>{people.length}</span>
        <span className={cx('text-sm', muted(ctx))}>de {detail?.members.length ?? 0}</span>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-hidden">
        {people.slice(0, 24).map((m) => (
          <span key={m.id} title={memberName(m)}>
            <Person m={m} size={24} />
          </span>
        ))}
      </div>
    </div>
  );
}

const MEDALS = ['#f5c542', '#c0c7d1', '#d08a4b'];

function ScoreWidget({ p, ctx }: { p: WidgetProps['scoreboard']; ctx: WidgetContext }) {
  const rows = [...p.rows].sort((a, b) => (p.order === 'desc' ? b.score - a.score : a.score - b.score));
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx} icon={<Trophy size={12} />}>
        {p.title}
      </Title>
      <ol className="min-h-0 flex-1 space-y-1 overflow-auto">
        {rows.map((r, i) => (
          <li key={i} className={cx('flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm', i < 3 && chip(ctx))}>
            <span className="w-5 text-center font-display font-black" style={{ color: MEDALS[i] }}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <span className="font-display font-black tabular-nums">{r.score}</span>
          </li>
        ))}
        {!rows.length && <li className={cx('text-sm', muted(ctx))}>Placar vazio.</li>}
      </ol>
    </div>
  );
}

function PomodoroWidget({ id, p, ctx }: { id: string; p: WidgetProps['pomodoro']; ctx: WidgetContext }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const cycle = (p.focus + p.pause) * 60_000;
  let phase: 'idle' | 'focus' | 'pause' = 'idle';
  let left = p.focus * 60_000;
  let total = left;
  if (p.startedAt) {
    const into = (now - p.startedAt) % cycle;
    phase = into < p.focus * 60_000 ? 'focus' : 'pause';
    total = phase === 'focus' ? p.focus * 60_000 : p.pause * 60_000;
    left = phase === 'focus' ? p.focus * 60_000 - into : cycle - into;
  }
  const mm = String(Math.floor(left / 60_000)).padStart(2, '0');
  const ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  const progress = 1 - left / total;
  const toggle = async () => {
    if (ctx.editing) return;
    setBusy(true);
    try {
      const r = await api.post<{ published: never }>(`/servers/${ctx.serverId}/workshop/pomodoro/${id}`, { start: !p.startedAt });
      useWorkshop.getState().setConfig(ctx.serverId, r.published);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx}>{p.title}</Title>
      <div className="flex flex-1 items-center gap-3">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={phase === 'pause' ? 'var(--color-ok, #3ba55c)' : ctx.pack ? 'var(--wa)' : 'var(--color-accent)'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${progress * 97.4} 97.4`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-display text-base font-black tabular-nums">
            {mm}:{ss}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold">{phase === 'idle' ? 'Parado' : phase === 'focus' ? 'Foco' : 'Pausa'}</div>
          <div className={cx('text-xs', muted(ctx))}>
            {p.focus} min de foco, {p.pause} de pausa
          </div>
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy || ctx.editing}
            className={cx('mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold disabled:opacity-50', chip(ctx))}
          >
            {p.startedAt ? <Pause size={12} /> : <Play size={12} />}
            {p.startedAt ? 'Parar' : 'Começar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelsWidget({ p, ctx }: { p: WidgetProps['channels']; ctx: WidgetContext }) {
  const detail = useDetail(ctx.serverId);
  const channels = p.channelIds.map((id) => detail?.channels.find((c) => c.id === id)).filter((c) => !!c);
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx}>{p.title}</Title>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1.5 overflow-auto">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={ctx.editing}
            onClick={() => useApp.getState().openChannel(ctx.serverId, c.id)}
            className={cx('flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition-transform enabled:hover:scale-[1.02]', chip(ctx))}
          >
            {c.type === 'voice' ? <Volume2 size={14} className={accent(ctx)} /> : <Hash size={14} className={accent(ctx)} />}
            <span className="truncate">{c.name}</span>
          </button>
        ))}
        {!channels.length && <div className={cx('text-sm', muted(ctx))}>Escolha os canais na Oficina.</div>}
      </div>
    </div>
  );
}

function ClockWidget({ p, ctx }: { p: WidgetProps['clock']; ctx: WidgetContext }) {
  const now = useNow(1000);
  const time = new Date(now).toLocaleTimeString('pt-BR', { timeZone: p.tz, hour: '2-digit', minute: '2-digit' });
  const day = new Date(now).toLocaleDateString('pt-BR', { timeZone: p.tz, weekday: 'long' });
  // cabe numa linha só da grade: hora à esquerda, título e dia à direita
  return (
    <div className="flex h-full items-center gap-3">
      <div className="font-display text-3xl leading-none font-black tabular-nums">{time}</div>
      <div className="min-w-0">
        <div className={cx('truncate text-[11px] font-extrabold tracking-wider uppercase', muted(ctx))}>{p.title}</div>
        <div className={cx('truncate text-xs capitalize', muted(ctx))}>
          {day.split('-')[0]} · {p.tz.split('/').pop()?.replace('_', ' ')}
        </div>
      </div>
    </div>
  );
}

function ImageWidget({ p, ctx }: { p: WidgetProps['image']; ctx: WidgetContext }) {
  if (!p.url) return <div className={cx('flex h-full items-center justify-center text-sm', muted(ctx))}>Envie uma imagem na Oficina.</div>;
  return (
    <figure className="relative -m-4 h-[calc(100%+2rem)] overflow-hidden">
      <img src={p.url} alt={p.caption} className={cx('h-full w-full', p.fit === 'cover' ? 'object-cover' : 'object-contain')} draggable={false} />
      {p.caption && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pt-6 pb-2.5 text-sm font-semibold text-white">{p.caption}</figcaption>}
    </figure>
  );
}

function LinksWidget({ p, ctx }: { p: WidgetProps['links']; ctx: WidgetContext }) {
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx}>{p.title}</Title>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto">
        {p.items.map((l, i) => (
          <a
            key={i}
            href={ctx.editing ? undefined : l.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={cx('flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm', chip(ctx))}
          >
            <ExternalLink size={14} className={cx('shrink-0', accent(ctx))} />
            <span className="min-w-0 flex-1 truncate font-semibold">{l.label}</span>
            {/* o domínio sempre à mostra: o rótulo não consegue disfarçar para onde o link leva */}
            <span className={cx('shrink-0 text-xs', muted(ctx))}>{new URL(l.url).hostname.replace(/^www\./, '')}</span>
          </a>
        ))}
        {!p.items.length && <div className={cx('text-sm', muted(ctx))}>Adicione links na Oficina.</div>}
      </div>
    </div>
  );
}

function JamWidget({ p, ctx }: { p: WidgetProps['jam']; ctx: WidgetContext }) {
  const detail = useDetail(ctx.serverId);
  const jams = useApp((s) => s.jams[ctx.serverId]) ?? [];
  const members = new Map((detail?.members ?? []).map((m) => [m.id, m]));
  return (
    <div className="flex h-full flex-col">
      <Title ctx={ctx} icon={<Music2 size={12} />}>
        {p.title}
      </Title>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto">
        {jams.map((j) => {
          const host = members.get(j.hostId);
          const room = detail?.channels.find((c) => c.id === j.channelId);
          return (
            <a
              key={`${j.channelId}:${j.hostId}`}
              href={ctx.editing ? undefined : j.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cx('flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm', chip(ctx))}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1db954] text-black">
                <Music2 size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">Jam de {host ? memberName(host) : 'alguém'}</span>
                <span className={cx('block truncate text-xs', muted(ctx))}>{room?.name ?? 'sala'}</span>
              </span>
            </a>
          );
        })}
        {!jams.length && <div className={cx('text-sm', muted(ctx))}>Nenhuma Jam aberta. Abra uma numa sala de voz.</div>}
      </div>
    </div>
  );
}
