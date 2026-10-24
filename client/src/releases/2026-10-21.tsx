import { Activity, Gauge, Mic, Wifi } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { cx } from '../components/ui';
import { openDiagnosticsWindow } from '../lib/desktop';
import type { Release } from './index';

/** carinha de figurinha: olhos e boca desenhados por cima de um bloco colorido */
function Face({ color, mouth, rotate }: { color: string; mouth: string; rotate: number }) {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] shadow-lg ring-[3px] ring-white" style={{ background: color, transform: `rotate(${rotate}deg)` }}>
      <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden>
        <circle cx="13" cy="16" r="3.2" fill="#1a1020" />
        <circle cx="27" cy="16" r="3.2" fill="#1a1020" />
        <path d={mouth} stroke="#1a1020" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function StickersArt() {
  const packs = ['Recentes', 'gato julgando', 'memes br'];
  return (
    <Frame className="h-[170px]">
      <div className="flex gap-1.5">
        {packs.map((p, i) => (
          <span key={p} className={cx('rounded-full px-2.5 py-1 font-display text-[10.5px] font-bold', i === 1 ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted')}>
            {p}
          </span>
        ))}
      </div>
      <div className="mt-4 flex gap-4 px-1.5">
        <Face color="#ffd37a" mouth="M12 27 Q20 22 28 27" rotate={-6} />
        <Face color="#c4a5ff" mouth="M12 25 Q20 32 28 25" rotate={4} />
        <Face color="#7cc7ff" mouth="M13 27 L27 27" rotate={-3} />
        <Face color="#9be38a" mouth="M12 25 Q20 30 28 25" rotate={7} />
      </div>
      <Tag className="right-3 bottom-3">Importar do WhatsApp</Tag>
    </Frame>
  );
}

function DiagnosticsArt() {
  const stats = [
    { icon: Wifi, label: 'Conexão', value: '32 ms' },
    { icon: Mic, label: 'Microfone', value: '-18 dB' },
    { icon: Gauge, label: 'Fluidez', value: '60 fps' },
    { icon: Activity, label: 'Perda de pacotes', value: '0,4%', warn: true },
  ];
  return (
    <Frame className="grid h-[170px] grid-cols-2 gap-2">
      {stats.map(({ icon: Icon, label, value, warn }) => (
        <div key={label} className="flex flex-col justify-center rounded-xl bg-surface-2 px-3">
          <span className="flex items-center gap-1 text-[10.5px] text-fg-subtle">
            <Icon size={10} /> {label}
          </span>
          <b className={cx('font-display text-lg', warn ? 'text-warn' : 'text-fg')}>{value}</b>
        </div>
      ))}
      <Tag className="right-3 bottom-3">Atalho marca o momento</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-21',
  title: 'Figurinhas e janela de diagnóstico',
  highlights: [
    {
      kicker: 'Chat',
      title: 'Seus pacotes de figurinha do WhatsApp, aqui',
      text: 'Exporte o pacote no WhatsApp e importe no Concord. As figurinhas ficam separadas por pacote e funcionam também no chat da sala de voz.',
      art: StickersArt,
      spotlight: {
        target: 'stickers',
        title: 'Suas figurinhas ficam aqui',
        tip: 'Clique para abrir o seletor. Lá dentro, "Importar" traz um pacote do WhatsApp.',
        fallback: 'Abra um canal de texto: o botão de figurinhas fica ao lado do campo de mensagem.',
      },
    },
    {
      kicker: 'Ajuda',
      title: 'Algo travou? Grave um diagnóstico',
      text: 'A janela de diagnóstico mostra conexão, microfone, fluidez e dispositivos ao vivo. Grave enquanto usa, marque o momento exato do problema com o atalho e mande o arquivo pra gente.',
      art: DiagnosticsArt,
      action: { label: 'Abrir diagnóstico', run: openDiagnosticsWindow },
    },
  ],
  fixes: [
    'O anel de quem está falando acende sem aquele atraso',
    'O seletor de figurinhas e o campo de mensagem cabem no chat estreito da sala de voz',
    'As abas das configurações cabem numa linha só',
  ],
} satisfies Release;
