// Botão do globo, numa faixa própria embaixo da tela do servidor (ver App.tsx): abre a Praça e mostra quantas
// pessoas estão lá agora. Fica fora dos painéis, então não cobre os botões da call nem some quando o papo abre.
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
      className="group flex h-9 items-center gap-2 rounded-full bg-[#1b1430] py-1 pr-3.5 pl-1 text-white shadow-[0_4px_14px_-6px_rgba(27,20,48,0.6)] ring-1 ring-white/20 transition hover:scale-[1.03] hover:bg-[#2b2350] active:scale-95"
    >
      <Globe size={28} />
      <span className="font-display text-[13px] font-bold">Praça</span>
      {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#e8685a] px-1.5 text-[11px] font-bold">{count}</span>}
    </button>
  );
}
