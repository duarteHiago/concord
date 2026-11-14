// Miniaturas dos blocos do sistema no editor da Oficina, com os dados reais do servidor (nomes dos canais,
// membros). Com a "situação" da prévia (em call, sala de voz aberta) e o tamanho real que o bloco teria na janela
// escolhida, a miniatura mostra o que aconteceria de verdade: sem os blocos que se adaptam, o "Na sala" corta e os
// botões da sala vazam; com eles, o bloco se rearruma.
import { Hash, Headphones, Mic, MonitorUp, PhoneOff, Users, Video, Volume2 } from 'lucide-react';
import type { BlockPlacement } from '../../../shared/workshop.ts';
import { Avatar, cx } from '../components/ui';
import type { ServerDetail } from '../lib/types';
import { useApp } from '../store/app';
import { blockMinPx } from './lab';

export interface MockSituation {
  inCall: boolean;
  voiceRoom: boolean;
  adaptive: boolean;
  /** tamanho que o bloco teria na janela da prévia (px); sem isso, a miniatura não julga se cabe */
  real?: { w: number; h: number };
}

export const NO_SITUATION: MockSituation = { inCall: false, voiceRoom: false, adaptive: false };

/** O bloco ficaria menor que o mínimo da situação? */
export function tooSmall(block: BlockPlacement['block'], sit: MockSituation) {
  if (!sit.real) return false;
  const min = blockMinPx(block, sit);
  return sit.real.w < min.w || sit.real.h < min.h;
}

export function BlockMock({ b, detail, dragging, compact, sit = NO_SITUATION }: { b: BlockPlacement; detail: ServerDetail; dragging: boolean; compact: boolean; sit?: MockSituation }) {
  const me = useApp((s) => s.me);
  const firstText = detail.channels.find((c) => c.type === 'text');
  const voice = detail.channels.find((c) => c.type === 'voice');
  const small = tooSmall(b.block, sit);
  // quebrado = menor que o mínimo e sem a adaptação para salvar
  const broken = small && !sit.adaptive;
  const shell = cx(
    'pointer-events-none flex h-full flex-col overflow-hidden rounded-2xl bg-surface-2 ring-1',
    broken ? 'ring-2 ring-danger' : 'ring-line',
    compact ? 'p-2 text-[11px]' : 'p-3 text-sm',
    dragging && 'opacity-90 shadow-2xl',
  );
  switch (b.block) {
    case 'channels':
      return (
        <div className={shell}>
          <div className="truncate font-display text-[13px] font-extrabold">{detail.server.name}</div>
          <div className="mb-1.5 text-[10px] text-fg-muted">{detail.online.length} online</div>
          <div className="min-h-0 space-y-0.5 overflow-hidden">
            {detail.channels.map((c) => (
              <div key={c.id} className="flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-fg-muted">
                {c.type === 'voice' ? <Volume2 size={11} /> : <Hash size={11} />}
                <span className="truncate">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'main':
      if (sit.voiceRoom) {
        // sala de voz: palco + barra de controles. Estreita demais: sem adaptação os botões vazam pelos lados
        // (cortados); com adaptação a barra quebra em duas linhas.
        const narrow = small;
        return (
          <div className={shell}>
            <div className="mb-1.5 flex items-center gap-1 truncate font-bold">
              <Volume2 size={12} className="text-fg-muted" />
              {voice?.name ?? 'Sala'}
            </div>
            <div className="mb-1.5 flex min-h-0 flex-1 items-center justify-center rounded-xl bg-surface-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{me?.displayName.slice(0, 1)}</span>
            </div>
            <div className={cx('flex shrink-0 items-center gap-1 rounded-2xl bg-surface-3 p-1', narrow && sit.adaptive ? 'flex-wrap justify-center' : 'justify-center')}>
              {[Mic, Headphones, Video, Users, Volume2, Hash, Mic, Users].map((I, i) => (
                <span key={i} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-4">
                  <I size={10} />
                </span>
              ))}
              <span className={cx('flex h-5 shrink-0 items-center gap-1 rounded-full bg-accent px-2 text-[9px] font-bold text-on-accent', narrow && sit.adaptive && 'w-5 justify-center px-0')}>
                <MonitorUp size={10} />
                {!(narrow && sit.adaptive) && 'Transmitir'}
              </span>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger text-white">
                <PhoneOff size={10} />
              </span>
            </div>
          </div>
        );
      }
      return (
        <div className={shell}>
          <div className="mb-2 flex items-center gap-1 font-bold">
            <Hash size={12} className="text-fg-muted" />
            {firstText?.name ?? 'conversa'}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
            {[70, 45, 85, 55, 30].map((w, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="h-4 w-4 shrink-0 rounded-full bg-surface-4" />
                <span className="mt-1 h-2 rounded-full bg-surface-4" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 truncate rounded-full bg-surface-3 px-2.5 py-1 text-[10px] text-fg-subtle">Mensagem em #{firstText?.name ?? 'geral'}</div>
        </div>
      );
    case 'members':
      return (
        <div className={shell}>
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-extrabold tracking-wider text-fg-subtle uppercase">
            <Users size={11} />
            Membros · {detail.members.length}
          </div>
          <div className="min-h-0 space-y-1 overflow-hidden">
            {detail.members.slice(0, 12).map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 truncate">
                <Avatar name={m.nickname || m.displayName} color={m.avatarColor} src={m.avatarUrl} size={16} />
                <span className="truncate">{m.nickname || m.displayName}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'voicebar': {
      const user = (
        <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-3 p-1.5">
          {me && <Avatar name={me.displayName} color={me.avatarColor} src={me.avatarUrl} size={18} />}
          <span className="min-w-0 flex-1 truncate font-semibold">{me?.displayName}</span>
          <Mic size={12} className="text-fg-muted" />
          <Headphones size={12} className="text-fg-muted" />
        </div>
      );
      if (!sit.inCall) return <div className={cx(shell, 'justify-end')}>{user}</div>;
      // em call: aparece o "Na sala". Baixo demais: sem adaptação o topo corta (era o print); com adaptação
      // vira uma linha só junto do perfil.
      if (small && sit.adaptive) {
        return (
          <div className={cx(shell, 'justify-end')}>
            <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-3 p-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />
              <span className="min-w-0 flex-1 truncate font-semibold">Na sala · {me?.displayName}</span>
              <Mic size={12} className="text-fg-muted" />
              <PhoneOff size={12} className="text-danger" />
            </div>
          </div>
        );
      }
      return (
        <div className={cx(shell, 'justify-end gap-1')}>
          <div className="shrink-0 rounded-xl bg-surface-3 p-1.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-ok" />
              <span className="font-bold">Na sala</span>
            </div>
            <div className="truncate text-[10px] text-fg-muted">
              {voice?.name ?? 'Sala'} · {detail.server.name}
            </div>
          </div>
          {user}
        </div>
      );
    }
  }
}
