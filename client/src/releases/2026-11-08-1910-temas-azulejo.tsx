import { Frame, Tag } from '../components/modals/OnboardingArt';
import { brandIconUrl } from '../lib/brandIcon';
import { PRESETS } from '../lib/theme';
import { useApp } from '../store/app';
import type { Release } from './index';

// os cartões da escolha de tema, só com os Azulejo
function AzulejoArt() {
  const themes = PRESETS.filter((p) => p.id.startsWith('azulejo-'));
  return (
    <Frame className="grid h-[170px] grid-cols-2 content-center gap-2 px-4">
      {themes.map((p) => (
        <div key={p.id} className="overflow-hidden rounded-lg border border-line">
          <div className="relative flex h-9" style={{ background: p.palette['surface-0'] }}>
            <div className="w-5" style={{ background: p.palette['surface-1'] }} />
            <div className="flex flex-1 items-end p-1" style={{ background: p.palette['surface-2'] }}>
              <div className="h-1.5 w-1/2 rounded-full" style={{ background: p.palette.accent }} />
            </div>
            {p.icon && <img src={brandIconUrl(p.icon)} alt="" className="absolute top-1 right-1 h-6 w-6" />}
          </div>
          <div className="bg-surface-0 px-1.5 py-0.5 text-[10px] font-semibold">{p.name}</div>
        </div>
      ))}
      <Tag className="right-3 bottom-2">Em teste</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-08-1910',
  title: 'Temas Azulejo',
  highlights: [
    {
      kicker: 'Aparência',
      title: 'Experimente as possíveis cores novas do Concord',
      text: 'Estamos testando uma cara nova: branco e azul-cobalto, com quatro cores para acompanhar (coral, celeste, menta e chiclete). Escolha uma em Configurações → Aparência e a logo na aba do navegador muda junto. Conta pra gente na comunidade qual você prefere.',
      art: AzulejoArt,
      action: { label: 'Escolher um tema', run: () => useApp.getState().openModal({ type: 'userSettings', tab: 'appearance' }) },
    },
  ],
  also: ['No app para computador, o ícone da barra de tarefas também acompanha o tema Azulejo depois da próxima atualização do app.'],
  fixes: [],
} satisfies Release;
