import { Volume2 } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

function OnlineArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-2 px-4">
      <div className="flex gap-1.5 text-[10px] font-bold">
        <span className="rounded-full bg-surface-3 px-2.5 py-1">Todos · 12</span>
        <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-on-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Só online · 5
        </span>
      </div>
      {[
        { name: 'Ana', sub: 'Na sala Lounge', color: 'bg-accent-2' },
        { name: 'Bia', sub: '', color: 'bg-warn' },
      ].map((p) => (
        <div key={p.name} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
          <span className={`relative h-6 w-6 rounded-full ${p.color}`}>
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-ok" />
          </span>
          <span className="text-[11px] font-bold">{p.name}</span>
          {p.sub && (
            <span className="flex items-center gap-1 text-[10px] text-ok">
              <Volume2 size={10} /> {p.sub}
            </span>
          )}
        </div>
      ))}
      <Tag className="top-2.5 right-3">Toque em “pessoas online”</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-19-1705',
  title: 'Quem está online',
  highlights: [
    {
      kicker: 'Servidores',
      title: 'Veja quem está online agora',
      text: 'Toque em "pessoas online", embaixo do nome do servidor, para abrir a lista só com quem está conectado. Na lista de membros dá para alternar entre "Todos" e "Só online", e quem está numa sala de voz mostra em qual.',
      art: OnlineArt,
    },
  ],
} satisfies Release;
