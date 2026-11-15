// Globo flutuante da Praça, numa faixa própria embaixo da tela do servidor (ver App.tsx): flutua, mas fora dos
// painéis, então não cobre os botões da call nem some quando o papo abre. Mostra quantas pessoas estão lá agora.
import { useEffect } from 'react';
import { useApp } from '../../store/app';
import { usePlaza } from '../../store/plaza';
import { Globe } from './Globe';

export function PlazaButton({ serverId, initialCount }: { serverId: string; initialCount: number }) {
  const count = usePlaza((s) => s.counts[serverId] ?? initialCount);
  const open = usePlaza((s) => s.open);
  const name = useApp((s) => s.details[serverId]?.server.name);
  // já baixa a praça enquanto o globo está na tela: o clique abre sem tela de carregamento
  useEffect(() => {
    void import('./PlazaView');
  }, []);
  const label = `Ir para a Praça${name ? ` de ${name}` : ''}${count ? ` · ${count} ${count === 1 ? 'pessoa' : 'pessoas'} lá` : ''}`;
  return (
    <button
      data-tour="plaza"
      onClick={() => open(serverId)}
      title={label}
      aria-label={label}
      className="plaza-fab group relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1b1430] shadow-[0_6px_16px_-6px_rgba(27,20,48,0.7)] ring-2 ring-white/70 transition hover:scale-110 active:scale-95"
    >
      <Globe size={32} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#e8685a] px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {count}
        </span>
      )}
      <span className="pointer-events-none absolute right-full mr-2.5 hidden whitespace-nowrap rounded-lg bg-[#1b1430] px-2.5 py-1 text-xs font-semibold text-white shadow-lg group-hover:block">
        Praça{count ? ` · ${count} lá` : ''}
      </span>
    </button>
  );
}
