// Botão flutuante e painel do laboratório de layout (só no Concord de testes). Cada caminho de
// docs "ideias de layout" vira uma chave: dá para ligar, desligar e combinar na hora, e comparar.
import { FlaskConical, RotateCcw, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Track } from 'livekit-client';
import { Toggle, cx } from '../components/ui';
import { useVoice } from '../store/voice';
import { TEMPLATES, labActive, useLab, type LabMode, type LabRoom } from './lab';

const MODES: { id: LabMode; label: string; hint: string }[] = [
  { id: 'atual', label: 'Grade de hoje', hint: 'A grade livre 12×12 sem regras. É a que quebra nos prints.' },
  { id: 'limites', label: 'Grade com limites', hint: 'Mesma grade, mas cada bloco tem mínimo em pixels. Se não couber, a tela rola em vez de um bloco invadir o outro.' },
  { id: 'moldes', label: 'Moldes', hint: 'Esqueleto fixo para o essencial, divisórias arrastáveis com limite, widgets só nas zonas livres.' },
];

const ROOMS: { id: LabRoom; label: string }[] = [
  { id: 'normal', label: 'Como está' },
  { id: 'palco', label: 'Palco cheio' },
  { id: 'grade', label: 'Grade de câmeras' },
];

const SIMS: { v: number | null; label: string }[] = [
  { v: null, label: 'Janela real' },
  { v: 1100, label: '1100 px' },
  { v: 1366, label: '1366 px' },
  { v: 1600, label: '1600 px' },
];

export function LabPanel() {
  const lab = useLab();
  useRoomArrangement();
  const on = labActive(lab);

  if (!lab.open) {
    return (
      <button
        type="button"
        onClick={() => lab.setOpen(true)}
        title="Laboratório de layout (só no Concord de testes)"
        aria-label="Laboratório de layout"
        // no canto direito da barra de servidores; só o ícone, para não cobrir cabeçalhos
        className={cx(
          'fixed top-[34px] right-8 z-[55] flex h-10 w-10 items-center justify-center rounded-full shadow-xl ring-1 ring-line transition-transform hover:scale-110',
          on ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg',
        )}
      >
        <FlaskConical size={18} />
      </button>
    );
  }

  return (
    <aside
      aria-label="Laboratório de layout"
      className="fixed top-4 right-4 z-[55] flex max-h-[calc(100vh-2rem)] w-[360px] animate-pop-in flex-col overflow-hidden rounded-[24px] bg-popover shadow-2xl ring-1 ring-line"
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <FlaskConical size={18} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-extrabold">Laboratório de layout</div>
          <div className="text-[11px] text-fg-muted">Só no seu navegador. Ninguém mais vê o que você liga aqui.</div>
        </div>
        <button type="button" onClick={() => lab.reset()} title="Desligar tudo" className="rounded-full p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg">
          <RotateCcw size={16} />
        </button>
        <button type="button" onClick={() => lab.setOpen(false)} aria-label="Fechar" className="rounded-full p-1.5 text-fg-muted hover:bg-surface-3 hover:text-fg">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3 overflow-y-auto p-4 text-sm">
        <Section n="2·3" title="Como a tela é montada">
          <div className="space-y-1.5">
            {MODES.map((m) => (
              <Choice key={m.id} active={lab.mode === m.id} onClick={() => lab.set({ mode: m.id })} title={m.label} hint={m.hint} />
            ))}
          </div>
          {lab.mode === 'moldes' && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.hint}
                  onClick={() => lab.set({ template: t.id })}
                  className={cx('rounded-xl px-2.5 py-2 text-left text-xs font-bold ring-1', lab.template === t.id ? 'bg-accent/12 ring-accent' : 'ring-line hover:bg-surface-3')}
                >
                  {t.label}
                </button>
              ))}
              <p className="col-span-2 text-[11px] text-fg-subtle">{TEMPLATES.find((t) => t.id === lab.template)?.hint} Arraste as divisórias entre as colunas; duplo clique volta ao padrão.</p>
            </div>
          )}
        </Section>

        <Section n="1" title="Blocos que se adaptam">
          <Switch
            checked={lab.adaptive}
            onChange={(adaptive) => lab.set({ adaptive })}
            label="Ligado"
            hint="Cada bloco muda pelo próprio tamanho: voz baixa vira linha compacta, perfil estreito esconde ajuda/configurações, papo da sala só aparece com espaço, botões da sala quebram em duas linhas."
          />
        </Section>

        <Section n="4" title="Arrumação de voz">
          <Switch
            checked={lab.voiceLayout}
            onChange={(voiceLayout) => lab.set({ voiceLayout })}
            label="Mudar a tela ao abrir uma sala"
            hint="Ao abrir uma sala de voz, a tela vira o molde Palco: a sala cresce e os widgets saem. Ao sair, volta."
          />
          <div className="mt-2 text-[11px] font-bold text-fg-subtle">Arranjo da sala (só para você)</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ROOMS.map((r) => (
              <Pill key={r.id} active={lab.room === r.id} onClick={() => lab.set({ room: r.id })}>
                {r.label}
              </Pill>
            ))}
          </div>
        </Section>

        <Section n="5" title="Animação entre telas">
          <Switch
            checked={lab.animate}
            onChange={(animate) => lab.set({ animate })}
            label="Ligada"
            hint="Os blocos deslizam de uma arrumação para outra: servidor ↔ conversas privadas, texto ↔ voz, troca de molde. Com 'reduzir movimento' do sistema vira fade."
          />
        </Section>

        <Section n="6" title="Ferramentas de quem monta">
          <Switch
            checked={lab.showLimits}
            onChange={(showLimits) => lab.set({ showLimits })}
            label="Mostrar os limites"
            hint="Contorna cada bloco com o tamanho atual e o mínimo da situação (em call o bloco de voz precisa de mais). Verde cabe, vermelho não."
          />
          <div className="mt-2 text-[11px] font-bold text-fg-subtle">Simular janela</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SIMS.map((s) => (
              <Pill key={String(s.v)} active={lab.simulate === s.v} onClick={() => lab.set({ simulate: s.v })}>
                {s.label}
              </Pill>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-extrabold tracking-wide uppercase">
        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Choice({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx('flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left ring-1', active ? 'bg-accent/10 ring-accent' : 'ring-line hover:bg-surface-3')}
    >
      <span className={cx('mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2', active ? 'border-[4px] border-accent' : 'border-line-strong')} />
      <span>
        <span className="block text-[13px] font-bold">{title}</span>
        <span className="block text-[11px] text-fg-muted">{hint}</span>
      </span>
    </button>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block text-[11px] text-fg-muted">{hint}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('rounded-full px-3 py-1 text-xs font-bold', active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
    >
      {children}
    </button>
  );
}

/**
 * Arranjo da sala escolhido no laboratório: "grade" tira o foco (todos em grade); "palco" põe em foco a primeira
 * transmissão (o CSS esconde o papo ao lado). Só reage quando o arranjo muda ou alguém começa a transmitir.
 */
function useRoomArrangement() {
  const room = useLab((s) => s.room);
  const voiceRoom = useVoice((s) => s.room);
  useVoice((s) => s.tick);
  const setFocus = useVoice((s) => s.setFocus);
  const firstScreen = voiceRoom ? [voiceRoom.localParticipant, ...voiceRoom.remoteParticipants.values()].find((p) => p.getTrackPublication(Track.Source.ScreenShare)) : undefined;
  const screenKey = firstScreen ? `${firstScreen.identity}:screen` : null;
  useEffect(() => {
    if (room === 'grade') setFocus(null);
    else if (room === 'palco' && screenKey) setFocus(screenKey);
  }, [room, screenKey, setFocus]);
}
