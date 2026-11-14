// Botão flutuante do globo, na tela do servidor: abre a Praça. Mostra quantas pessoas estão lá agora.
import { useApp } from '../../store/app';
import { usePlaza } from '../../store/plaza';
import { useMobile } from '../../lib/mobile';
import { cx } from '../ui';
import { Globe } from './Globe';

export function PlazaButton({ serverId, initialCount }: { serverId: string; initialCount: number }) {
  const count = usePlaza((s) => s.counts[serverId] ?? initialCount);
  const open = usePlaza((s) => s.open);
  const isOpen = usePlaza((s) => s.serverId !== null);
  const mobile = useMobile();
  const name = useApp((s) => s.details[serverId]?.server.name);
  if (isOpen) return null;
  const label = `Ir para a Praça${name ? ` de ${name}` : ''}${count ? ` · ${count} ${count === 1 ? 'pessoa' : 'pessoas'} lá` : ''}`;
  return (
    <button
      data-tour="plaza"
      onClick={() => open(serverId)}
      title={label}
      aria-label={label}
      className={cx(
        'plaza-fab group fixed z-40 grid h-14 w-14 place-items-center rounded-full bg-[#1b1430] shadow-[0_8px_24px_-6px_rgba(27,20,48,0.7)] ring-2 ring-white/70 transition hover:scale-110 active:scale-95',
        mobile ? 'right-4 bottom-[156px]' : 'right-8 bottom-32',
      )}
    >
      <Globe size={44} />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#e8685a] px-1 text-[11px] font-bold text-white ring-2 ring-white">
          {count}
        </span>
      )}
      <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg bg-[#1b1430] px-2.5 py-1 text-xs font-semibold text-white shadow-lg group-hover:block">
        Praça{count ? ` · ${count} lá` : ''}
      </span>
    </button>
  );
}
