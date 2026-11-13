// Lista das telas e câmeras ligadas na sala, para escolher o que gravar (na janela de começar e, durante a
// gravação, no painel da sala).
import { MonitorUp, Video } from 'lucide-react';
import { liveSources, type LiveSource } from '../lib/callSources';
import { memberName } from '../lib/types';
import { useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { cx } from './ui';

/** As fontes da sala agora, com o nome de quem é. Atualiza quando alguém começa ou para de transmitir. */
export function useLiveSources(): (LiveSource & { label: string })[] {
  const room = useVoice((s) => s.room);
  const serverId = useVoice((s) => s.serverId);
  useVoice((s) => s.tick); // faixas publicadas e encerradas
  useApp((s) => (serverId ? s.voiceStates[serverId] : undefined)); // alguém começou ou parou de transmitir
  const members = useApp((s) => (serverId ? s.details[serverId]?.members : undefined));
  if (!room) return [];
  return liveSources(room).map((s) => {
    const m = members?.find((x) => x.id === s.identity);
    const who = s.mine ? 'Você' : m ? memberName(m) : 'Alguém';
    return { ...s, label: s.kind === 'screen' ? (s.mine ? 'Sua tela' : `Tela de ${who}`) : s.mine ? 'Sua câmera' : `Câmera de ${who}` };
  });
}

/** O que vem marcado: as telas que você está assistindo e a sua; se não houver, todas as telas. */
export function defaultSources(sources: LiveSource[], watching: Record<string, true>): string[] {
  const screens = sources.filter((s) => s.kind === 'screen');
  const mine = screens.filter((s) => s.mine || watching[s.identity]);
  return (mine.length ? mine : screens).map((s) => s.key);
}

export function SourcePicker({ selected, onToggle, compact }: { selected: string[]; onToggle: (key: string) => void; compact?: boolean }) {
  const sources = useLiveSources();
  if (!sources.length) return <p className={cx('text-fg-muted', compact ? 'text-[11px]' : 'text-xs')}>Ninguém está transmitindo nem com a câmera ligada agora.</p>;
  return (
    <div className={cx('flex flex-wrap', compact ? 'gap-1' : 'gap-1.5')} role="group" aria-label="Fontes para gravar">
      {sources.map((s) => {
        const on = selected.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            title={on ? 'Gravando. Clique para tirar.' : 'Clique para gravar também.'}
            onClick={() => onToggle(s.key)}
            className={cx(
              'flex max-w-full items-center gap-1.5 rounded-full font-bold',
              compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-xs',
              on ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg',
            )}
          >
            {s.kind === 'screen' ? <MonitorUp size={compact ? 11 : 13} className="shrink-0" /> : <Video size={compact ? 11 : 13} className="shrink-0" />}
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
