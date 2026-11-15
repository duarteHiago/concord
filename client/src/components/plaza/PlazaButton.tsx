// Entrada da Praça na barra lateral do servidor, logo abaixo do nome (ver ChannelSidebar.tsx): sempre à vista,
// sem faixa extra na tela e sem mexer na barra de botões da call. Mostra quantas pessoas estão lá agora.
import { ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { usePlaza } from '../../store/plaza';
import { Globe } from './Globe';

export function PlazaButton({ serverId, initialCount }: { serverId: string; initialCount: number }) {
  const count = usePlaza((s) => s.counts[serverId] ?? initialCount);
  const open = usePlaza((s) => s.open);
  // já baixa a praça enquanto a entrada está na tela: o clique abre sem tela de carregamento
  useEffect(() => {
    void import('./PlazaView');
  }, []);
  return (
    <button
      data-tour="plaza"
      onClick={() => open(serverId)}
      className="group mt-3 flex w-full items-center gap-2.5 rounded-2xl bg-[#1b1430] py-1.5 pr-2.5 pl-1.5 text-left text-white shadow-[0_6px_16px_-10px_rgba(27,20,48,0.8)] transition hover:bg-[#2b2350] active:scale-[0.98]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5">
        <Globe size={30} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block font-display text-[15px] font-bold">Praça</span>
        <span className="block truncate text-[12px] text-white/60">{count ? `${count} ${count === 1 ? 'pessoa' : 'pessoas'} lá agora` : 'Entre e encontre a galera'}</span>
      </span>
      {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#e8685a] px-1.5 text-[11px] font-bold">{count}</span>}
      <ChevronRight size={16} className="shrink-0 text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white" />
    </button>
  );
}
