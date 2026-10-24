import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

/** o menu agrupado à esquerda, com a busca, e a seção aberta ao lado */
function SettingsArt() {
  const groups = [
    { title: 'VOCÊ', items: ['Meu perfil', 'Conta e segurança', 'Privacidade'] },
    { title: 'APP', items: ['Aparência', 'Notificações', 'Voz e vídeo'] },
  ];
  return (
    <Frame className="flex h-[170px] gap-2.5">
      <div className="flex w-28 shrink-0 flex-col gap-1 rounded-xl bg-surface-2 p-2">
        <div className="mb-1 h-4 rounded-full bg-surface-3 px-2 text-[8px] leading-4 text-fg-subtle">Buscar: senha…</div>
        {groups.map((g) => (
          <div key={g.title}>
            <div className="px-1 text-[7px] font-bold tracking-widest text-fg-subtle">{g.title}</div>
            {g.items.map((it, i) => (
              <div key={it} className={i === 0 && g.title === 'VOCÊ' ? 'rounded-md bg-accent px-1.5 py-0.5 text-[9px] font-bold text-on-accent' : 'px-1.5 py-0.5 text-[9px] text-fg-muted'}>
                {it}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 rounded-xl bg-surface-2 p-3">
        <div className="font-display text-sm font-bold">Meu perfil</div>
        {[70, 52, 60].map((w) => (
          <div key={w} className="flex items-center justify-between gap-2 border-t border-line pt-1.5">
            <div className="h-1.5 rounded-full bg-surface-4" style={{ width: `${w}%` }} />
            <div className="h-3 w-6 rounded-full bg-accent" />
          </div>
        ))}
      </div>
      <Tag className="right-3 bottom-3">Tudo no lugar certo</Tag>
    </Frame>
  );
}

export default {
  id: '2026-10-24-2204',
  title: 'Configurações reorganizadas',
  highlights: [
    {
      kicker: 'Configurações',
      title: 'Configurações numa página, organizadas e com busca',
      text: 'As configurações saíram da janela e viraram uma página, com o menu dividido em Você, App e Avançado e uma busca ("senha", "tremer", "microfone"). Meu perfil junta foto, nome, moldura e patches com uma prévia ao vivo, e o que é privacidade ficou num lugar só.',
      art: SettingsArt,
      action: { label: 'Abrir as configurações', run: () => useApp.getState().openSettings('profile') },
    },
  ],
} satisfies Release;
