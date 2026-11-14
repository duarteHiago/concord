// Laboratório de layout dentro do editor da Oficina (só no Concord de testes): a barra em cima da "Tela do
// servidor" com o modo de montagem, a situação da prévia (janela, em call, sala de voz) e as chaves dos blocos
// que se adaptam, da arrumação de voz e da animação. Mais a demonstração da transição para as conversas.
import { Track } from 'livekit-client';
import { FlaskConical, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { isBlock, type ScreenItem } from '../../../shared/workshop.ts';
import { Toggle, cx } from '../components/ui';
import { useVoice } from '../store/voice';
import { PREVIEW_WINDOWS, templateInfo, useLab, type LabMode, type LabRoom, type LabTemplate, type PreviewWindow } from './lab';
import { springs } from './motion';

export interface PreviewState {
  win: PreviewWindow;
  inCall: boolean;
  voiceRoom: boolean;
  /** demonstração da transição: mostrando as conversas privadas no lugar do servidor */
  dm: boolean;
}

const MODES: { id: LabMode; label: string; hint: string }[] = [
  { id: 'atual', label: 'Grade livre', hint: 'Como é hoje: qualquer tamanho e lugar. O contorno vermelho mostra o que quebraria na janela da prévia.' },
  { id: 'limites', label: 'Grade com limites', hint: 'Cada bloco tem um mínimo em pixels para a janela e a situação escolhidas: não dá para diminuir além dele. Se não couber, a tela rola em vez de sobrepor.' },
  { id: 'moldes', label: 'Moldes', hint: 'Esqueleto fixo para o essencial. Você escolhe o molde, arrasta as divisórias (com limite) e põe widgets só nas zonas livres.' },
];

const ROOMS: { id: LabRoom; label: string }[] = [
  { id: 'normal', label: 'Como está' },
  { id: 'palco', label: 'Palco cheio' },
  { id: 'grade', label: 'Grade de câmeras' },
];

export function LabBar({ preview, onPreview, problems }: { preview: PreviewState; onPreview: (p: Partial<PreviewState>) => void; problems: string[] }) {
  const lab = useLab();
  const mode = MODES.find((m) => m.id === lab.mode)!;
  return (
    <div className="mb-3 rounded-3xl bg-surface-2 p-3 ring-1 ring-line">
      <div className="mb-2 flex items-center gap-2">
        <FlaskConical size={15} className="text-accent" />
        <span className="text-xs font-extrabold tracking-wide uppercase">Laboratório de layout</span>
        <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-bold">em teste · só no seu navegador</span>
      </div>

      {/* caminhos 2 e 3: como a tela é montada */}
      <div className="flex gap-1 rounded-full bg-surface-0 p-1" role="radiogroup" aria-label="Modo de montagem">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={lab.mode === m.id}
            onClick={() => lab.set({ mode: m.id })}
            className={cx('relative flex-1 rounded-full py-1.5 text-xs font-bold', lab.mode === m.id ? 'text-on-accent' : 'text-fg-muted hover:text-fg')}
          >
            {lab.mode === m.id && <motion.span layoutId="lab-mode" className="absolute inset-0 rounded-full bg-accent" transition={springs.snappy} />}
            <span className="relative">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-fg-muted">{mode.hint}</p>

      {/* caminho 6: a situação da prévia */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold text-fg-subtle">Prévia:</span>
        {PREVIEW_WINDOWS.map((w) => (
          <Chip key={w.id} active={preview.win.id === w.id} onClick={() => onPreview({ win: w })}>
            {w.w} px
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <Chip active={preview.inCall} onClick={() => onPreview({ inCall: !preview.inCall })}>
          Em call
        </Chip>
        <Chip active={preview.voiceRoom} onClick={() => onPreview({ voiceRoom: !preview.voiceRoom })}>
          Sala de voz aberta
        </Chip>
        <span className="mx-1 h-4 w-px bg-line" />
        <Chip active={preview.dm} onClick={() => onPreview({ dm: !preview.dm })}>
          <MessageCircle size={12} />
          {preview.dm ? 'Fechar a transição' : 'Ver a transição para as conversas'}
        </Chip>
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-2xl bg-danger/10 px-3 py-2 text-[11px]">
          {problems.map((p) => (
            <li key={p} className="flex gap-1.5">
              <span className="font-bold text-danger">•</span>
              {p}
            </li>
          ))}
        </ul>
      )}

      {/* caminhos 1, 4 e 5 */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Switch
          checked={lab.adaptive}
          onChange={(adaptive) => lab.set({ adaptive })}
          label="Blocos que se adaptam"
          hint="Apertado, o bloco se rearruma em vez de cortar: 'Na sala' vira uma linha, os botões da sala quebram em duas linhas."
        />
        <Switch
          checked={lab.voiceLayout}
          onChange={(voiceLayout) => lab.set({ voiceLayout })}
          label="Mudar a tela na sala de voz"
          hint="Ao abrir uma sala, a tela vira o molde Palco (a sala cresce, widgets saem). Veja com 'Sala de voz aberta'."
        />
        <Switch
          checked={lab.animate}
          onChange={(animate) => lab.set({ animate })}
          label="Animação entre telas"
          hint="Os blocos deslizam em vez de trocar seco. Veja com 'Abrir as conversas'."
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold text-fg-subtle">Arranjo da sala de voz (só para você):</span>
        {ROOMS.map((r) => (
          <Chip key={r.id} active={lab.room === r.id} onClick={() => lab.set({ room: r.id })}>
            {r.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
    >
      {children}
    </button>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 rounded-2xl bg-surface-0 p-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold">{label}</span>
        <span className="block text-[10.5px] leading-snug text-fg-muted">{hint}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );
}

// ---------------------------------------------------------------- caminho 5: demonstração da transição

type Box = { left: number; top: number; width: number; height: number };
const pct = (x: number, total: number) => (x / total) * 100;

/** As caixas da tela do servidor (em %), a partir da grade ou do molde. */
function serverBoxes(items: ScreenItem[], mode: LabMode, template: LabTemplate): Record<string, Box> {
  const out: Record<string, Box> = {};
  if (mode === 'moldes') {
    const t = templateInfo(template);
    const total = 1000;
    const nav = t.nav.def * 0.75;
    const side = t.side === 'none' ? 0 : t.sideW.def * 0.75;
    out.channels = { left: 0, top: 0, width: pct(nav, total), height: 84 };
    out.voicebar = { left: 0, top: 86, width: pct(nav, total), height: 14 };
    out.main = { left: pct(nav + 16, total), top: t.topStrip ? 18 : 0, width: pct(total - nav - 16 - (side ? side + 16 : 0), total), height: t.topStrip ? 82 : 100 };
    if (t.topStrip) out.widgets = { left: out.main.left, top: 0, width: out.main.width, height: 16 };
    if (side) out.members = { left: pct(total - side, total), top: 0, width: pct(side, total), height: 100 };
    return out;
  }
  for (const it of items) {
    const key = isBlock(it) ? it.block : `w-${it.id}`;
    out[key] = { left: pct(it.x, 12), top: pct(it.y, 12), width: pct(it.w, 12) - 1, height: pct(it.h, 12) - 1.5 };
  }
  return out;
}

/** As caixas do layout das conversas privadas (o layout padrão do Concord). */
const DM_BOXES: Record<string, Box> = {
  channels: { left: 0, top: 0, width: 22, height: 85 },
  voicebar: { left: 0, top: 87, width: 22, height: 13 },
  main: { left: 23.5, top: 0, width: 76.5, height: 100 },
};

const LABEL: Record<string, string> = { channels: 'Canais', voicebar: 'Voz e perfil', main: 'Conversa', members: 'Membros', widgets: 'Widgets' };

/** Mostra a tela do servidor indo para as conversas privadas (e voltando), com ou sem a animação. */
export function TransitionDemo({ items }: { items: ScreenItem[] }) {
  const lab = useLab();
  // começa na tela do servidor e vai sozinha para as conversas; o botão vai e volta
  const [dm, setDm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDm(true), 500);
    return () => clearTimeout(t);
  }, []);
  const from = serverBoxes(items, lab.mode, lab.template);
  const keys = Object.keys(from);
  const transition = lab.animate ? { type: 'spring' as const, stiffness: 260, damping: 30 } : { duration: 0 };
  return (
    <div className="relative aspect-[16/9] w-full rounded-2xl bg-surface-0">
      {keys.map((k) => {
        const inDm = DM_BOXES[k];
        const box = dm ? (inDm ?? from[k]) : from[k];
        const visible = !dm || !!inDm;
        const label = dm && k === 'channels' ? 'Conversas privadas' : dm && k === 'main' ? 'Amigos / conversa' : (LABEL[k] ?? 'Widget');
        return (
          <motion.div
            key={k}
            className={cx('absolute flex items-center justify-center overflow-hidden rounded-xl text-[11px] font-bold ring-1 ring-line', k === 'main' ? 'bg-accent/15' : k.startsWith('w-') || k === 'widgets' ? 'bg-accent/35' : 'bg-surface-3')}
            initial={false}
            animate={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, opacity: visible ? 1 : 0, scale: visible ? 1 : 0.9 }}
            transition={transition}
          >
            {label}
          </motion.div>
        );
      })}
      <div className="absolute right-2 bottom-2 flex items-center gap-2">
        <span className="rounded-full bg-surface-2/90 px-2 py-0.5 text-[10px] font-bold text-fg-muted">{lab.animate ? 'com animação' : 'sem animação (troca seca)'}</span>
        <button type="button" onClick={() => setDm(!dm)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-on-accent">
          <MessageCircle size={12} />
          {dm ? 'Voltar ao servidor' : 'Abrir as conversas'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- arranjo da sala (caminho 4), na tela real

/**
 * "grade" tira o foco (todos em grade); "palco" põe em foco a primeira transmissão (o CSS esconde o papo ao lado).
 * Roda no app inteiro (não só no editor): é a preferência de quem vê.
 */
export function useRoomArrangement() {
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
