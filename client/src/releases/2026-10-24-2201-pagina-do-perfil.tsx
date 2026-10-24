import { Gamepad2, Music2 } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

/** a página do perfil: fundo, foto grande e as vitrines da Steam e do Last.fm */
function ProfileArt() {
  return (
    <Frame className="h-[170px] p-0">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #2a1f3a, #3b2430 55%, #1f2a3a)' }} />
      <div className="absolute inset-x-3 top-3 flex items-center gap-2 rounded-xl bg-surface-1/85 p-2">
        <div className="h-9 w-9 rounded-full ring-2 ring-accent" style={{ background: '#c4a5ff' }} />
        <div>
          <div className="text-[11px] font-bold">yatorin</div>
          <div className="text-[9px] text-fg-muted">@yatoro</div>
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-1/85 p-2">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-bold text-fg-muted">
            <Gamepad2 size={9} className="text-accent" /> STEAM
          </div>
          <div className="grid grid-cols-3 gap-1">
            {['#5b6b8a', '#8a5b5b', '#5b8a6b'].map((c) => (
              <div key={c} className="aspect-[46/21] rounded" style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-surface-1/85 p-2">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-bold text-fg-muted">
            <Music2 size={9} className="text-accent" /> MAIS OUVIDAS
          </div>
          {[34, 26, 20].map((w, i) => (
            <div key={w} className="mb-1 flex items-center gap-1">
              <span className="text-[8px] text-fg-subtle">{i + 1}</span>
              <div className="h-1.5 rounded-full bg-surface-4" style={{ width: w * 2 }} />
            </div>
          ))}
        </div>
      </div>
      <Tag className="top-3 right-3">Seu fundo, suas vitrines</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2201',
  title: 'Página do perfil',
  highlights: [
    {
      kicker: 'Perfil',
      title: 'Passe o mouse para o mini perfil, clique para o perfil completo',
      text: 'Clicar em alguém agora abre a página do perfil, com fundo próprio e vitrines: o que a pessoa está fazendo, a biblioteca da Steam (com os jogos em comum com você), as músicas mais ouvidas pelo Last.fm, os patches e os servidores em comum. No seu perfil, o botão Personalizar troca o fundo, a cor e as vitrines.',
      art: ProfileArt,
      action: {
        label: 'Abrir meu perfil',
        run: () => {
          const me = useApp.getState().me;
          if (me) useApp.getState().openProfile(me.id);
        },
      },
    },
  ],
} satisfies Release;
