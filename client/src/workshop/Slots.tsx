// Pontos onde a Oficina aparece dentro das telas de sempre (barra de servidores, cabeçalho, lista de canais,
// configurações). Cada um some sozinho quando a Oficina está desligada ou o servidor não usa a peça.
import { LayoutDashboard, Puzzle, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { P, has } from '../../../shared/permissions.ts';
import type { ServerDetail } from '../lib/types';
import { useApp } from '../store/app';
import { Button, Toggle, cx } from '../components/ui';
import { BannerArt, RailEffect } from './Art';
import { playPiece } from './runtime';
import { WORKSHOP_ENABLED, useActiveConfig, usePiece, useWorkshop, workshopPrefs, type WorkshopPrefs } from './store';

/** Efeito animado em volta do ícone do servidor (vai dentro do botão, que já é `relative`). */
export function RailIconEffect({ serverId }: { serverId: string }) {
  const pack = usePiece(serverId, 'icon');
  return pack ? <RailEffect pack={pack} /> : null;
}

/** Som de passar o mouse no ícone. */
export const railHover = (serverId: string) => () => {
  if (WORKSHOP_ENABLED) playPiece(serverId, 'hover', 'hover', 150);
};

/** Faixa animada atrás do nome do servidor. Devolve a cor do texto para o cabeçalho continuar legível. */
export function useServerBanner(serverId: string): { art: ReactNode; ink: string | null } {
  const pack = usePiece(serverId, 'banner');
  if (!pack) return { art: null, ink: null };
  return { art: <BannerArt pack={pack} />, ink: pack.colors.ink };
}

/** Entrada "Mural" no topo da lista de canais (ou "Montar o Mural" para quem gerencia). */
export function MuralEntry({ detail }: { detail: ServerDetail }) {
  const config = useActiveConfig(detail.server.id);
  const open = useWorkshop((s) => s.muralFor === detail.server.id);
  const canEdit = has(detail.permissions, P.MANAGE_SERVER);
  if (!WORKSHOP_ENABLED) return null;
  const hasMural = !!config?.mural.widgets.length;
  if (!hasMural && !canEdit) return null;
  return (
    <div className="space-y-1">
      {hasMural && (
        <button
          type="button"
          aria-current={open ? 'page' : undefined}
          onClick={() => useWorkshop.getState().openMural(detail.server.id)}
          className={cx(
            'flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition-colors',
            open ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg hover:bg-surface-4',
          )}
        >
          <LayoutDashboard size={17} />
          <span className="min-w-0 flex-1 truncate">{config!.mural.title}</span>
          <span className={cx('text-[11px] font-semibold', open ? 'opacity-80' : 'text-fg-muted')}>{config!.mural.widgets.length}</span>
        </button>
      )}
      {canEdit && !hasMural && (
        <button
          type="button"
          onClick={() => useWorkshop.getState().openStudio(detail.server.id)}
          className="flex w-full items-center gap-2.5 rounded-2xl border-2 border-dashed border-line-strong px-3 py-2 text-left text-sm font-semibold text-fg-muted hover:border-accent hover:text-accent"
        >
          <Puzzle size={16} />
          Montar na Oficina
        </button>
      )}
    </div>
  );
}

/** Aba "Oficina" nas configurações do servidor. */
export function WorkshopSettingsTab({ serverId }: { serverId: string }) {
  const config = useActiveConfig(serverId);
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        Oficina
        <span className="rounded-full bg-warn/25 px-2 py-0.5 text-[10px] font-black tracking-wider uppercase">só no teste</span>
      </h2>
      <p className="mt-1 mb-5 text-sm text-fg-muted">
        Dê a cara do servidor: ícone animado, sons, animação de entrada, notificação própria, anunciador nas salas e um Mural com widgets
        arrumados numa grade. Montar e testar é grátis; só aparece para os membros quando você publica.
      </p>
      <div className="flex items-center gap-3 rounded-3xl bg-surface-1 p-4 ring-1 ring-line">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-on-accent">
          <Wrench size={22} />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-bold">{config ? 'Publicado' : 'Nada publicado ainda'}</div>
          <div className="text-fg-muted">
            {config ? `${Object.keys(config.pieces).length} peças, ${config.mural.widgets.length} widgets no Mural` : 'Os membros veem o visual padrão do Concord.'}
          </div>
        </div>
        <Button onClick={() => useWorkshop.getState().openStudio(serverId)}>Abrir a Oficina</Button>
      </div>
    </section>
  );
}

/** Bloco em Configurações › Aparência: cada pessoa decide se quer os efeitos dos servidores. */
export function WorkshopAppearance() {
  const saveSettings = useApp((s) => s.saveSettings);
  useApp((s) => s.me?.settings);
  const prefs = workshopPrefs();
  const [volume, setVolume] = useState(prefs.volume);
  if (!WORKSHOP_ENABLED) return null;
  const save = (patch: Partial<WorkshopPrefs>) => void saveSettings({ workshop: { ...prefs, ...patch } } as never);
  const row = (label: string, hint: string, key: 'show' | 'sounds' | 'intros', disabled = false) => (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-fg-muted">{hint}</div>
      </div>
      <Toggle checked={prefs[key] && !disabled} disabled={disabled} onChange={(v) => save({ [key]: v })} />
    </div>
  );
  return (
    <div className="divide-y divide-line">
      {row('Mostrar a Oficina dos servidores', 'Ícones animados, faixas, Mural e avisos com o tema de cada servidor. Desligado, tudo fica no visual padrão.', 'show')}
      {row('Sons dos servidores', 'Sons ao passar o mouse, ao entrar, nas salas e nas menções.', 'sounds', !prefs.show)}
      {row('Animações de entrada', 'A intro que aparece na primeira vez que você abre um servidor na sessão. Com "reduzir animações" ligado, ela não aparece.', 'intros', !prefs.show)}
      <div className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Volume dos sons dos servidores</div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          disabled={!prefs.show || !prefs.sounds}
          onChange={(e) => setVolume(Number(e.target.value))}
          // salva ao soltar (arrastar não manda uma alteração por passo)
          onPointerUp={() => save({ volume })}
          onKeyUp={() => save({ volume })}
          className="w-40 accent-[var(--color-accent)]"
          aria-label="Volume dos sons dos servidores"
        />
        <span className="w-9 text-right text-xs text-fg-muted tabular-nums">{volume}%</span>
      </div>
    </div>
  );
}
