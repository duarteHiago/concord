// Botão flutuante do laboratório de layout (só no Concord de testes): mostra o modo em que a tela do servidor
// está, com o número, o nome e a cor do modo, e abre os três cartões para trocar. A montagem de cada modo é na
// Oficina (botão "Editar na Oficina").
import { FlaskConical, X } from 'lucide-react';
import { motion } from 'motion/react';
import { P, has } from '../../../shared/permissions.ts';
import { Button, cx } from '../components/ui';
import { HOME, useApp } from '../store/app';
import { LAB_MODES, labMode, useLab, type LabMode } from './lab';
import { springs } from './motion';
import { useActiveConfig, useWorkshop } from './store';

export function LabPanel() {
  const { mode, open, setOpen, setMode } = useLab();
  const serverId = useApp((s) => (s.activeServerId && s.activeServerId !== HOME ? s.activeServerId : null));
  const detail = useApp((s) => (serverId ? s.details[serverId] : undefined));
  const config = useActiveConfig(serverId);
  const current = labMode(mode);
  const built = !!config && !!(config.screen || config.slots || config.room);
  const canEdit = !!detail && has(detail.permissions, P.MANAGE_SERVER);
  // dentro da Oficina o botão some (cobriria o "Publicar"): lá a troca fica na faixa do modo, no editor
  const studioOpen = useWorkshop((s) => !!s.studioFor);

  if (!open) {
    if (studioOpen) return null;
    return (
      <motion.button
        type="button"
        layout
        onClick={() => setOpen(true)}
        title="Laboratório de layout: modo da tela do servidor (só no Concord de testes)"
        className="fixed top-[30px] right-8 z-[55] flex h-11 items-center gap-2 rounded-full pr-4 pl-1.5 text-sm font-bold text-white shadow-xl"
        style={{ background: current.color }}
        transition={springs.snappy}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 font-display text-base font-extrabold">{current.n}</span>
        {current.short}
      </motion.button>
    );
  }

  return (
    <aside aria-label="Modo da tela do servidor" className="fixed top-4 right-4 z-[55] w-[min(560px,calc(100vw-2rem))] animate-pop-in rounded-[24px] bg-popover p-4 shadow-2xl ring-1 ring-line">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical size={18} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-extrabold">Modo da tela do servidor</div>
          <div className="text-[11px] text-fg-muted">Em teste. A escolha vale só no seu navegador, nos servidores com tela montada na Oficina.</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-full p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Modo">
        {LAB_MODES.map((m) => (
          <motion.button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => setMode(m.id)}
            className={cx('rounded-2xl p-2 text-left ring-1 transition-colors', mode === m.id ? 'ring-2' : 'ring-line hover:bg-surface-3')}
            style={mode === m.id ? { boxShadow: `inset 0 0 0 2px ${m.color}`, background: `${m.color}14` } : undefined}
          >
            <ModeSketch mode={m.id} color={m.color} />
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: m.color }}>
                {m.n}
              </span>
              <span className="text-xs leading-tight font-bold">{m.label}</span>
            </div>
          </motion.button>
        ))}
      </div>

      <motion.p key={mode} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-[12px] text-fg-muted">
        {current.hint}
      </motion.p>

      {serverId && !studioOpen && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-2 p-2.5 text-[12px]">
          <span className="min-w-0 flex-1">
            {built
              ? `${detail?.server.name ?? 'Este servidor'} está no modo ${current.n}.`
              : 'Este servidor ainda não tem tela montada: monte na Oficina para ver os modos aqui.'}
          </span>
          {canEdit && (
            <Button
              className="h-8 shrink-0 px-3 text-xs"
              onClick={() => {
                setOpen(false);
                useWorkshop.getState().openStudio(serverId);
              }}
            >
              Editar na Oficina
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}

/** Desenho pequeno de cada modo, para os cartões. */
function ModeSketch({ mode, color }: { mode: LabMode; color: string }) {
  const block = 'rounded-[4px] bg-surface-4';
  const accent = { background: `${color}55` };
  if (mode === 'livre')
    return (
      <div className="grid h-14 grid-cols-6 grid-rows-4 gap-0.5 rounded-lg bg-surface-0 p-1">
        <span className={cx(block, 'col-span-2 row-span-3')} />
        <span className="col-span-3 row-span-4 rounded-[4px]" style={accent} />
        <span className={cx(block, 'row-span-2')} />
        <span className={cx(block, 'col-span-2')} />
        <span className="row-span-2 rounded-[4px]" style={{ background: `${color}99` }} />
      </div>
    );
  if (mode === 'encaixes')
    return (
      <div className="flex h-14 gap-0.5 rounded-lg bg-surface-0 p-1">
        <div className="flex w-1/4 flex-col gap-0.5">
          <span className={cx(block, 'flex-1 border border-dashed')} style={{ borderColor: color }} />
          <span className={cx(block, 'h-2')} />
        </div>
        <span className="flex-1 rounded-[4px]" style={accent} />
        <span className={cx(block, 'w-1/5 border border-dashed')} style={{ borderColor: color }} />
      </div>
    );
  return (
    <div className="flex h-14 items-center gap-1 rounded-lg bg-surface-0 p-1">
      <div className="flex h-full flex-1 gap-0.5">
        <span className={cx(block, 'w-1/3')} />
        <span className="flex-1 rounded-[4px]" style={accent} />
      </div>
      <span className="text-[10px] font-extrabold" style={{ color }}>
        →
      </span>
      <div className="flex h-full flex-1 gap-0.5">
        <span className={cx(block, 'w-1/4')} />
        <span className="flex flex-1 flex-col justify-end rounded-[4px] p-0.5" style={accent}>
          <span className="h-1 rounded-full bg-white/70" />
        </span>
        <span className={cx(block, 'w-1/4')} />
      </div>
    </div>
  );
}
