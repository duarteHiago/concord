import { ArrowRight, Check, History, Plus, Sparkles, Target, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { reduceMotion } from '../../lib/motion';
import { RELEASES, markReleasesSeen, releaseDate, releaseDay, useUnseenReleases, type Release } from '../../releases';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { useVoice } from '../../store/voice';
import { showSpotlight } from '../Spotlight';
import { Button, IconButton, cx } from '../ui';

/** Mais que isso vira cansativo: o resto fica no resumo e na página de Novidades. */
const MAX_STEPS = 4;

/** Apresentação das novidades: um destaque por passo, com a barra avançando sozinha, e um resumo no fim. */
export function WhatsNewModal({ ids }: { ids: string[] }) {
  const closeModal = useApp((s) => s.closeModal);
  const openReleases = useApp((s) => s.openReleases);
  const releases = RELEASES.filter((r) => ids.includes(r.id));
  const steps = releases.flatMap((r) => r.highlights.map((h) => ({ h, r }))).slice(0, MAX_STEPS);
  const total = steps.length + 1;
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const recap = step === steps.length;
  // notas de dias diferentes viram "desde a sua última visita"; várias do mesmo dia são uma edição só
  const merged = new Set(releases.map((r) => releaseDay(r.id))).size > 1;
  const auto = !reduceMotion();

  function finish(then?: () => void) {
    markReleasesSeen();
    closeModal();
    then?.();
  }
  const go = (n: number) => setStep(Math.max(0, Math.min(total - 1, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, total - 1));
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = steps[step];
  const Art = current?.h.art;

  return (
    <div role="dialog" aria-label="Novidades do Concord" className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={() => finish()}>
      <div
        className="flex max-h-[90vh] w-full max-w-[500px] animate-pop-in flex-col overflow-hidden rounded-[28px] bg-surface-2 shadow-2xl ring-1 ring-line"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="space-y-3 px-6 pt-5">
          <div className="flex gap-1" role="tablist" aria-label="Passos">
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === step}
                aria-label={`Ir para o passo ${i + 1} de ${total}`}
                onClick={() => go(i)}
                className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-4"
              >
                {i < step && <span className="absolute inset-0 bg-accent" />}
                {i === step && (
                  <span
                    key={step}
                    className={cx('absolute inset-0 bg-accent', auto && !recap ? 'whats-new-fill' : '')}
                    style={auto && !recap ? { animationPlayState: paused ? 'paused' : 'running' } : undefined}
                    onAnimationEnd={() => go(step + 1)}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <Sparkles size={13} className="text-accent" />
            <span>{merged ? 'Desde a sua última visita' : `Novidades de ${releaseDate(releases[0].id)}`}</span>
            <IconButton label="Fechar" className="ml-auto h-8 w-8" onClick={() => finish()}>
              <X size={16} />
            </IconButton>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-2">
          {current && Art ? (
            <>
              <Art />
              <div>
                <span className="font-display text-[11px] font-bold tracking-widest text-accent-2 uppercase">
                  {current.h.kicker}
                  {merged && ` · ${releaseDate(current.r.id)}`}
                </span>
                <h2 className="mt-1 text-xl font-bold text-balance">{current.h.title}</h2>
                <p className="mt-1.5 text-sm text-fg-muted">{current.h.text}</p>
              </div>
            </>
          ) : (
            <Recap releases={releases} merged={merged} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-5">
          {current ? (
            <>
              {current.h.spotlight && (
                <Button variant="secondary" onClick={() => finish(() => showSpotlight(current.h.spotlight!))}>
                  <Target size={16} /> Mostrar onde fica
                </Button>
              )}
              {current.h.action && (
                <Button variant={current.h.spotlight ? 'ghost' : 'secondary'} onClick={() => finish(current.h.action!.run)}>
                  {current.h.action.label} <ArrowRight size={16} />
                </Button>
              )}
              <Button className="ml-auto" onClick={() => go(step + 1)}>
                Próxima
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => finish(openReleases)}>
                <History size={16} /> Ver todas as novidades
              </Button>
              <div className="ml-auto flex gap-2">
                {step > 0 && (
                  <Button variant="secondary" onClick={() => go(step - 1)}>
                    Voltar
                  </Button>
                )}
                <Button onClick={() => finish()}>Bora usar</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Recap({ releases, merged }: { releases: Release[]; merged: boolean }) {
  const also = releases.flatMap((r) => r.also ?? []);
  const fixes = releases.flatMap((r) => r.fixes ?? []);
  const extra = releases.flatMap((r) => r.highlights).length - MAX_STEPS;
  return (
    <div className="space-y-4">
      {merged && (
        <div className="flex items-center gap-2.5 rounded-2xl bg-accent-2/12 px-3.5 py-2.5 text-sm">
          <History size={16} className="shrink-0 text-accent-2" />
          Juntamos {new Set(releases.map((r) => releaseDay(r.id))).size} atualizações que saíram enquanto você estava fora.
        </div>
      )}
      <h2 className="text-xl font-bold text-balance">{merged || releases.length > 1 ? 'E mais um pouco' : releases[0].title}</h2>
      {(also.length > 0 || extra > 0) && <RecapList icon={Plus} title="Também chegou" items={[...also, ...(extra > 0 ? [`Mais ${extra} destaque(s) na página de Novidades`] : [])]} />}
      {fixes.length > 0 && <RecapList icon={Wrench} title="Consertamos" items={fixes} check />}
    </div>
  );
}

export function RecapList({ icon: Icon, title, items, check }: { icon: typeof Plus; title: string; items: string[]; check?: boolean }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 font-display text-xs font-bold tracking-wider text-fg-subtle uppercase">
        <Icon size={13} /> {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5 text-sm text-fg-muted">
            {check ? <Check size={15} className="mt-0.5 shrink-0 text-ok" /> : <Plus size={15} className="mt-0.5 shrink-0 text-accent" />}
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

let deferredToastShown = false;

/**
 * Abre a apresentação uma vez quando há edição nova com destaque. Não abre por cima de outra janela, durante
 * chamada (espera a pessoa sair da sala) nem em "Não perturbe"; versão só com consertos vira um aviso curto.
 */
export function useWhatsNewPrompt() {
  const unseen = useUnseenReleases();
  const modal = useApp((s) => s.modal);
  const releasesOpen = useApp((s) => s.releasesOpen);
  const dnd = useApp((s) => s.me?.settings.status === 'dnd');
  const inCall = useVoice((s) => s.status !== 'idle');
  const key = unseen.map((r) => r.id).join(',');
  const withHighlights = unseen.some((r) => r.highlights.length > 0);

  useEffect(() => {
    if (!key || modal || releasesOpen || dnd) return;
    if (inCall) {
      if (withHighlights && !deferredToastShown) {
        deferredToastShown = true;
        toast.info('Tem novidade no Concord. Mostro quando você sair da chamada.');
      }
      return;
    }
    // espera o app assentar (servidores, canal, sons de entrada) antes de abrir
    const t = setTimeout(() => {
      if (withHighlights) {
        useApp.getState().openModal({ type: 'whatsNew', ids: key.split(',') });
      } else {
        const n = unseen.reduce((sum, r) => sum + (r.fixes?.length ?? 0), 0);
        toast.info(`${n} conserto(s) nesta atualização. Veja em Novidades, no ícone de jornal da barra de servidores.`);
        markReleasesSeen();
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, modal, releasesOpen, dnd, inCall]);
}
