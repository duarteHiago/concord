// Configurações como página (no lugar da conversa, como o perfil e as Novidades), com o menu agrupado em
// Você / App / Avançado e uma busca que acha a seção por palavras ("senha", "tremer", "microfone").
// As seções em si ficam em SettingsSections.tsx; quem abre uma seção específica usa
// openModal({ type: 'userSettings', tab }) e cai aqui (ver store/app.ts).
import { Bell, Bot, ChevronLeft, ChevronRight, EyeOff, Gem, Heart, Keyboard, LogOut, Mic, Palette, Search, ShieldCheck, UserRound, Wrench, X, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../store/app';
import { useMobile } from '../../lib/mobile';
import { MecenatoTab } from '../Mecenato';
import { SupportTab } from '../Support';
import { BotsTab } from '../modals/BotsTab';
import { ShortcutsTab } from '../modals/ShortcutsTab';
import { Avatar, IconButton, cx } from '../ui';
import { Account, Appearance, Audio, DevTab, MyProfile, Notifications, Privacy, type SettingsTab } from './SettingsSections';

interface Item {
  id: SettingsTab;
  label: string;
  subtitle: string;
  /** palavras que a busca encontra (além do nome) */
  words: string;
  /** ícone e cor do "azulejo" na lista do celular */
  icon: LucideIcon;
  tint: string;
  render: () => ReactNode;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Você',
    items: [
      {
        id: 'profile',
        icon: UserRound,
        tint: 'bg-accent/15 text-accent',
        label: 'Meu perfil',
        subtitle: 'Tudo que os outros veem sobre você, num lugar só.',
        words: 'foto avatar capa banner nome apelido bio sobre status moldura patches fundo cartão mini perfil página cor',
        render: () => <MyProfile />,
      },
      {
        id: 'account',
        icon: ShieldCheck,
        tint: 'bg-ok/15 text-ok',
        label: 'Conta e segurança',
        subtitle: 'Senha, verificação em duas etapas, aparelhos conectados, e-mail e formas de entrar.',
        words: 'senha password 2fa verificação duas etapas autenticador email e-mail google código recuperação backup sair desktop servidor atualização versão aparelhos dispositivos sessões celular conectado',
        render: () => <Account />,
      },
      {
        id: 'privacy',
        icon: EyeOff,
        tint: 'bg-accent-2/15 text-accent-2',
        label: 'Privacidade',
        subtitle: 'O que os outros veem sem você dizer, e quem pode chamar você.',
        words: 'jogando ouvindo atividade spotify steam jogo música silenciar silenciadas bloquear sininho',
        render: () => <Privacy />,
      },
      {
        id: 'support',
        icon: Heart,
        tint: 'bg-danger/15 text-danger',
        label: 'Apoiar',
        subtitle: 'Ajude a manter o Concord no ar.',
        words: 'apoiar apoio pix doação doar patch apoiador acabamento',
        render: () => <SupportTab />,
      },
      {
        id: 'mecenato',
        icon: Gem,
        tint: 'bg-warn/15 text-warn',
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
        icon: Palette,
        tint: 'bg-accent-2/15 text-accent-2',
        label: 'Aparência',
        subtitle: 'Tema, cores, fundo e animações.',
        words: 'tema cor destaque fundo imagem css animação movimento escuro claro',
        render: () => <Appearance />,
      },
      {
        id: 'notifications',
        icon: Bell,
        tint: 'bg-danger/15 text-danger',
        label: 'Notificações',
        subtitle: 'Quando e como o Concord chama você.',
        words: 'tremer chamar atenção som menção menções notificação status não perturbe código compartilhado clipe',
        render: () => <Notifications />,
      },
      {
        id: 'audio',
        icon: Mic,
        tint: 'bg-ok/15 text-ok',
        label: 'Voz e vídeo',
        subtitle: 'Microfone, fone, câmera e redução de ruído.',
        words: 'microfone mic fone headset saída entrada câmera ruído supressão volume efeito teste sensibilidade',
        render: () => <Audio />,
      },
      {
        id: 'shortcuts',
        icon: Keyboard,
        tint: 'bg-accent/15 text-accent',
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
        icon: Bot,
        tint: 'bg-accent-2/15 text-accent-2',
        label: 'Bots',
        subtitle: 'Bots controlados pela API do Concord.',
        words: 'bot bots api token automação',
        render: () => <BotsTab />,
      },
      {
        id: 'dev',
        icon: Wrench,
        tint: 'bg-surface-4 text-fg-muted',
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
  const me = useApp((s) => s.me);
  const mobile = useMobile();
  const [query, setQuery] = useState('');
  const [mobileSection, setMobileSection] = useState<SettingsTab | null>(null);
  const current = ALL.find((i) => i.id === (mobile ? (mobileSection ?? tab) : tab)) ?? ALL[0];

  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return null;
    return new Set(ALL.filter((i) => norm(`${i.label} ${i.subtitle} ${i.words}`).includes(q)).map((i) => i.id));
  }, [query]);

  const showMenu = !mobile || !mobileSection;
  const showContent = !mobile || !!mobileSection;

  const search = (
    <label className={cx('relative', mobile ? 'mb-5 block' : 'mb-3')}>
      <Search size={mobile ? 17 : 14} className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-subtle', mobile ? 'left-4' : 'left-3')} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches?.size) {
            const first = [...matches][0];
            openSettings(first);
            if (mobile) setMobileSection(first);
            setQuery('');
          }
        }}
        placeholder="Buscar: senha, tremer…"
        aria-label="Buscar nas configurações"
        enterKeyHint="search"
        className={cx(
          'w-full rounded-full bg-surface-3 pr-3 outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60',
          mobile ? 'h-12 pl-11 text-base' : 'h-9 pl-8 text-sm',
        )}
      />
    </label>
  );

  const visibleGroups = GROUPS.map((g) => ({ ...g, items: matches ? g.items.filter((i) => matches.has(i.id)) : g.items })).filter((g) => g.items.length);

  const nav = (
    <nav aria-label="Configurações" className="panel flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto p-3">
      <div className="px-2 pt-1 pb-3 font-display text-xl font-bold">Configurações</div>
      {search}
      {visibleGroups.map((g) => (
        <div key={g.title} className="mb-1">
          <div className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-widest text-fg-subtle uppercase">{g.title}</div>
          {g.items.map((i) => (
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
      ))}
      {matches && matches.size === 0 && <p className="px-3 py-2 text-sm text-fg-subtle">Nada com esse nome.</p>}
      <button onClick={logout} className="mt-auto rounded-2xl px-3 py-2 text-left text-sm font-bold text-danger hover:bg-danger/10">
        Sair da conta
      </button>
    </nav>
  );

  // celular: lista no padrão dos apps de configurações (cartões, ícone, seta), com áreas de toque grandes
  const row = 'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-surface-4';
  const mobileNav = (
    <nav aria-label="Configurações" className="panel flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4 pt-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="flex-1 font-display text-2xl font-bold">Configurações</h1>
        <IconButton label="Fechar" className="h-11 w-11 shrink-0" onClick={closeSettings}>
          <X size={20} />
        </IconButton>
      </div>
      {search}
      {!matches && me && (
        <button
          onClick={() => {
            openSettings('profile');
            setMobileSection('profile');
          }}
          className="mb-6 flex w-full shrink-0 items-center gap-3 rounded-3xl bg-surface-3 p-3 text-left transition-colors active:bg-surface-4"
        >
          <Avatar name={me.displayName} color={me.avatarColor} src={me.avatarUrl} frame={me.frame} size={52} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold">{me.displayName}</span>
            <span className="block truncate text-sm text-fg-muted">@{me.username} · editar perfil</span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-fg-subtle" />
        </button>
      )}
      {visibleGroups.map((g) => (
        <section key={g.title} className="mb-6 shrink-0">
          <h2 className="px-4 pb-2 text-xs font-bold tracking-widest text-fg-subtle uppercase">{g.title}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-3xl bg-surface-3">
            {g.items.map((i) => {
              const Icon = i.icon;
              return (
                <button
                  key={i.id}
                  onClick={() => {
                    openSettings(i.id);
                    setMobileSection(i.id);
                    setQuery('');
                  }}
                  className={row}
                >
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', i.tint)}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{i.label}</span>
                    <span className="block truncate text-xs text-fg-muted">{i.subtitle}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-fg-subtle" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {matches && matches.size === 0 && <p className="px-4 py-2 text-sm text-fg-subtle">Nada com esse nome.</p>}
      {!matches && (
        <div className="shrink-0 overflow-hidden rounded-3xl bg-surface-3">
          <button
            onClick={() =>
              // no celular, um toque sem querer não tira ninguém da conta
              useApp.getState().openModal({
                type: 'confirm',
                title: 'Sair da conta?',
                message: 'Você vai precisar entrar de novo neste aparelho.',
                confirmLabel: 'Sair',
                danger: true,
                onConfirm: logout,
              })
            }
            className={cx(row, 'font-semibold text-danger')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/15">
              <LogOut size={18} />
            </span>
            <span className="flex-1 text-[15px]">Sair da conta</span>
          </button>
        </div>
      )}
    </nav>
  );

  const content = (
    <main className="panel min-w-0 flex-1 overflow-y-auto">
      {/* celular: a barra com "voltar" fica presa no topo enquanto a seção rola */}
      {mobile && (
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface-2/95 px-2 py-2 backdrop-blur">
          <IconButton label="Voltar" className="h-11 w-11 shrink-0" onClick={() => setMobileSection(null)}>
            <ChevronLeft size={22} />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{current.label}</h1>
        </header>
      )}
      <div className={cx('mx-auto max-w-5xl', mobile ? 'px-4 pt-4 pb-10' : 'px-8 py-8')}>
        <header className={cx('flex items-start gap-4', mobile ? 'mb-5' : 'mb-8')}>
          <div className="min-w-0 flex-1">
            {!mobile && <h1 className="font-display text-[28px] font-bold">{current.label}</h1>}
            <p className={cx('text-sm text-fg-muted', !mobile && 'mt-1')}>{current.subtitle}</p>
          </div>
          {!mobile && (
            <IconButton label="Fechar as configurações" className="h-9 w-9 shrink-0" onClick={closeSettings}>
              <X size={18} />
            </IconButton>
          )}
        </header>
        <div key={current.id}>{current.render()}</div>
      </div>
    </main>
  );

  return (
    <>
      {showMenu && (mobile ? mobileNav : nav)}
      {showContent && content}
    </>
  );
}
