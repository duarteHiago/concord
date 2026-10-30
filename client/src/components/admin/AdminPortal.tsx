// Portal da equipe (/admin): diagnósticos que as pessoas mandaram e uma visão geral só de leitura da
// instalação. Quem entra é decidido no servidor (ADMIN_USERS, ver server/src/admin.ts); para os outros,
// as rotas nem existem. Navegação pelo #hash para cada tela ter um link (ex.: #diagnosticos/<id>).
import { FileText, LayoutDashboard, Server, Stethoscope, Users, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { applyTheme, normalizeTheme } from '../../lib/theme';
import type { Me } from '../../lib/types';
import { Spinner, cx } from '../ui';
import { ContractDetail, ContractsList } from './Contracts';
import { CostsPage } from './Costs';
import { DiagnosticDetail, DiagnosticsList } from './Diagnostics';
import { ServerDetail, ServersList, UserDetail, UsersList } from './Directory';
import { BarDays, Loading, Page, Stat, useAdminData } from './parts';

type Tab = 'visao' | 'custos' | 'diagnosticos' | 'contas' | 'servidores' | 'contratos';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'visao', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'custos', label: 'Custos', icon: Wallet },
  { id: 'diagnosticos', label: 'Diagnósticos', icon: Stethoscope },
  { id: 'contas', label: 'Contas', icon: Users },
  { id: 'servidores', label: 'Servidores', icon: Server },
  { id: 'contratos', label: 'Contratos', icon: FileText },
];

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function AdminPortal() {
  const [me, setMe] = useState<Me | null | 'none'>(null);
  const hash = useHash();
  const [rawTab, id] = hash.split('/');
  const tab: Tab = TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : 'visao';

  useEffect(() => {
    document.title = 'Portal da equipe · Concord';
    api.get<Me>('/me').then(
      (m) => {
        applyTheme(normalizeTheme(m.settings?.theme));
        setMe(m);
      },
      () => setMe('none'),
    );
  }, []);

  if (me === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={36} />
      </div>
    );
  }
  if (me === 'none' || !me.isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <img src="/brand/concord-simbolo.svg" alt="" className="h-16 w-16" />
        <h1 className="text-2xl font-extrabold">Portal da equipe</h1>
        <p className="max-w-sm text-fg-muted">
          {me === 'none' ? 'Entre no Concord neste navegador e volte para esta página.' : 'Sua conta não tem acesso a esta página.'}
        </p>
        <a href="/" className="mt-2 rounded-full bg-accent px-5 py-2 font-display text-sm font-bold text-on-accent hover:bg-accent-hover">
          Voltar para o Concord
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 bg-surface-1 p-4 md:flex-row">
      <nav aria-label="Portal da equipe" className="panel flex shrink-0 flex-row flex-wrap gap-1 p-3 md:w-56 md:flex-col">
        <div className="mb-2 hidden items-center gap-2.5 px-2 pt-1 md:flex">
          <img src="/brand/concord-simbolo.svg" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <b className="block font-display">Concord</b>
            <span className="text-xs text-fg-muted">Portal da equipe</span>
          </div>
        </div>
        {TABS.map(({ id: t, label, icon: Icon }) => (
          <a
            key={t}
            href={`#${t}`}
            aria-current={tab === t ? 'page' : undefined}
            className={cx(
              'flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors',
              tab === t ? 'bg-accent text-on-accent' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
            )}
          >
            <Icon size={17} /> {label}
          </a>
        ))}
        <div className="mt-auto hidden px-3 pt-4 text-xs text-fg-subtle md:block">
          Entrou como <b className="text-fg-muted">@{me.username}</b>
          <a href="/" className="mt-1 block hover:text-fg">
            ← Voltar para o app
          </a>
        </div>
      </nav>
      <main className="panel min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6 md:p-8">
          {tab === 'visao' && <Overview />}
          {tab === 'custos' && <CostsPage />}
          {tab === 'diagnosticos' && (id ? <DiagnosticDetail id={id} /> : <DiagnosticsList />)}
          {tab === 'contas' && (id ? <UserDetail id={id} /> : <UsersList />)}
          {tab === 'servidores' && (id ? <ServerDetail id={id} /> : <ServersList />)}
          {tab === 'contratos' && (id ? <ContractDetail id={id} /> : <ContractsList />)}
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ visão geral

interface OverviewData {
  users: number;
  bots: number;
  servers: number;
  messages: number;
  supporters: number;
  diagnostics: number;
  online: number;
  voice: { participants: number; rooms: number; streams: number; cameras: number };
  signups: { day: string; count: number }[];
  messagesPerDay: { day: string; count: number }[];
}

function Overview() {
  const { data, error } = useAdminData<OverviewData>('/admin/overview');
  return (
    <Page title="Visão geral" subtitle="Como a instalação está agora e nos últimos 30 dias.">
      <Loading data={data} error={error}>
        {(d) => (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Online agora" value={d.online} accent />
              <Stat label="Em salas de voz" value={d.voice.participants} hint={`${d.voice.rooms} sala(s) · ${d.voice.streams} transmitindo`} />
              <Stat label="Contas" value={d.users} hint={`+ ${d.bots} bot(s)`} />
              <Stat label="Servidores" value={d.servers} />
              <Stat label="Mensagens" value={d.messages} hint="canais e conversas privadas" />
              <Stat label="Apoiadores" value={d.supporters} />
              <Stat label="Diagnósticos guardados" value={d.diagnostics} href="#diagnosticos" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <BarDays title="Contas criadas por dia" days={d.signups} />
              <BarDays title="Mensagens em canais por dia" days={d.messagesPerDay} />
            </div>
          </div>
        )}
      </Loading>
    </Page>
  );
}
