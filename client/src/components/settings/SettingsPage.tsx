// Configurações como página (no lugar da conversa, como o perfil e as Novidades), com o menu agrupado em
// Você / App / Avançado e uma busca que acha a seção por palavras ("senha", "tremer", "microfone").
// As seções em si ficam em SettingsSections.tsx; quem abre uma seção específica usa
// openModal({ type: 'userSettings', tab }) e cai aqui (ver store/app.ts).
import { Search, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../store/app';
import { MecenatoTab } from '../Mecenato';
import { SupportTab } from '../Support';
import { BotsTab } from '../modals/BotsTab';
import { ShortcutsTab } from '../modals/ShortcutsTab';
import { IconButton, cx } from '../ui';
import { Account, Appearance, Audio, DevTab, MyProfile, Notifications, Privacy, type SettingsTab } from './SettingsSections';

interface Item {
  id: SettingsTab;
  label: string;
  subtitle: string;
  /** palavras que a busca encontra (além do nome) */
  words: string;
  render: () => ReactNode;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Você',
    items: [
      {
        id: 'profile',
        label: 'Meu perfil',
        subtitle: 'Tudo que os outros veem sobre você, num lugar só.',
        words: 'foto avatar capa banner nome apelido bio sobre status moldura patches fundo cartão mini perfil página cor',
        render: () => <MyProfile />,
      },
      {
        id: 'account',
        label: 'Conta e segurança',
        subtitle: 'Senha, verificação em duas etapas, e-mail e formas de entrar.',
        words: 'senha password 2fa verificação duas etapas autenticador email e-mail google código recuperação backup sair desktop servidor atualização versão',
        render: () => <Account />,
      },
      {
        id: 'privacy',
        label: 'Privacidade',
        subtitle: 'O que os outros veem sem você dizer, e quem pode chamar você.',
        words: 'jogando ouvindo atividade spotify steam jogo música silenciar silenciadas bloquear sininho',
        render: () => <Privacy />,
      },
      {
        id: 'support',
        label: 'Apoiar',
        subtitle: 'Ajude a manter o Concord no ar.',
        words: 'apoiar apoio pix doação doar patch apoiador acabamento',
        render: () => <SupportTab />,
      },
      {
        id: 'mecenato',
        label: 'Mecenato',
        subtitle: 'Seu contrato de Mecenas, o Escudo e as sacanagens.',
        words: 'mecenas mecenato contrato escudo não perturbe sacanagens peripécias multa rescindir convite',
        render: () => <MecenatoTab />,
      },
    ],
  },
  {
    title: 'App',
    items: [
      {
        id: 'appearance',
        label: 'Aparência',
        subtitle: 'Tema, cores, fundo e animações.',
        words: 'tema cor destaque fundo imagem css animação movimento escuro claro',
        render: () => <Appearance />,
      },
      {
        id: 'notifications',
        label: 'Notificações',
        subtitle: 'Quando e como o Concord chama você.',
        words: 'tremer chamar atenção som menção menções notificação status não perturbe código compartilhado clipe',
        render: () => <Notifications />,
      },
      {
        id: 'audio',
        label: 'Voz e vídeo',
        subtitle: 'Microfone, fone, câmera e redução de ruído.',
        words: 'microfone mic fone headset saída entrada câmera ruído supressão volume efeito teste sensibilidade',
        render: () => <Audio />,
      },
      {
        id: 'shortcuts',
        label: 'Atalhos',
        subtitle: 'Teclas para as ações mais usadas.',
        words: 'atalho atalhos tecla teclado silenciar ensurdecer',
        render: () => <ShortcutsTab />,
      },
    ],
  },
  {
    title: 'Avançado',
    items: [
      {
        id: 'bots',
        label: 'Bots',
        subtitle: 'Bots controlados pela API do Concord.',
        words: 'bot bots api token automação',
        render: () => <BotsTab />,
      },
      {
        id: 'dev',
        label: 'Desenvolvedor',
        subtitle: 'Diagnóstico e gravações para achar problemas.',
        words: 'diagnóstico desenvolvedor gravar gravação log travando lento',
        render: () => <DevTab />,
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function SettingsPage() {
  const tab = useApp((s) => s.settings) ?? 'profile';
  const openSettings = useApp((s) => s.openSettings);
  const closeSettings = useApp((s) => s.closeSettings);
  const logout = useApp((s) => s.logout);
  const [query, setQuery] = useState('');
  const current = ALL.find((i) => i.id === tab) ?? ALL[0];

  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return null;
    return new Set(ALL.filter((i) => norm(`${i.label} ${i.subtitle} ${i.words}`).includes(q)).map((i) => i.id));
  }, [query]);

  return (
    <>
      <nav aria-label="Configurações" className="panel flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto p-3">
        <div className="px-2 pt-1 pb-3 font-display text-xl font-bold">Configurações</div>
        <label className="relative mb-3">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter vai para o primeiro resultado
              if (e.key === 'Enter' && matches?.size) {
                openSettings([...matches][0]);
                setQuery('');
              }
            }}
            placeholder="Buscar: senha, tremer…"
            aria-label="Buscar nas configurações"
            className="h-9 w-full rounded-full bg-surface-3 pr-3 pl-8 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60"
          />
        </label>
        {GROUPS.map((g) => {
          const items = matches ? g.items.filter((i) => matches.has(i.id)) : g.items;
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-1">
              <div className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-widest text-fg-subtle uppercase">{g.title}</div>
              {items.map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    openSettings(i.id);
                    setQuery('');
                  }}
                  aria-current={tab === i.id ? 'page' : undefined}
                  className={cx(
                    'w-full rounded-2xl px-3 py-2 text-left text-sm font-semibold transition-colors',
                    tab === i.id ? 'bg-accent text-on-accent' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                  )}
                >
                  {i.label}
                </button>
              ))}
            </div>
          );
        })}
        {matches && matches.size === 0 && <p className="px-3 py-2 text-sm text-fg-subtle">Nada com esse nome.</p>}
        <button onClick={logout} className="mt-auto rounded-2xl px-3 py-2 text-left text-sm font-bold text-danger hover:bg-danger/10">
          Sair da conta
        </button>
      </nav>

      <main className="panel min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <header className="mb-8 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[28px] font-bold">{current.label}</h1>
              <p className="mt-1 text-sm text-fg-muted">{current.subtitle}</p>
            </div>
            <IconButton label="Fechar as configurações" className="h-9 w-9 shrink-0" onClick={closeSettings}>
              <X size={18} />
            </IconButton>
          </header>
          {/* key: cada seção começa do zero ao trocar (formulários não carregam valores de outra) */}
          <div key={current.id}>{current.render()}</div>
        </div>
      </main>
    </>
  );
}
