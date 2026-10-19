import { HelpCircle, Link2, Plus } from 'lucide-react';
import { useApp } from '../store/app';
import { useCommunity, usePendingCommunity } from '../store/community';
import { Button } from './ui';

export function WelcomeView() {
  const openModal = useApp((s) => s.openModal);
  const community = usePendingCommunity();
  const joinCommunity = useCommunity((s) => s.join);
  return (
    <div className="panel flex flex-1 items-center justify-center p-8">
      <div className="max-w-md animate-slide-up text-center">
        <img src="/brand/concord-simbolo.svg" alt="" className="mx-auto mb-6 h-24 w-24" />
        <h1 className="text-3xl font-extrabold">Seu espaço começa aqui</h1>
        <p className="mt-3 text-fg-muted">
          Crie um servidor para você e seus amigos, ou entre em um com um convite. Lá dentro você terá salas de voz com
          transmissão de tela a 60 fps.
        </p>
        {community && (
          <button
            onClick={() => void joinCommunity()}
            className="mt-8 flex w-full items-center gap-4 rounded-[24px] bg-accent/12 p-4 text-left ring-1 ring-accent/30 transition-colors hover:bg-accent/20"
          >
            <img src="/brand/concord-simbolo.svg" alt="" className="h-12 w-12 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-display font-bold">Entrar na comunidade {community.server.name}</span>
              <span className="block text-sm text-fg-muted">Dê ideias, vote nas da galera, reporte bugs e tire dúvidas.</span>
            </span>
          </button>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={() => openModal({ type: 'addServer', tab: 'create' })}>
            <Plus size={18} /> Criar servidor
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: 'addServer', tab: 'join' })}>
            <Link2 size={18} /> Usar convite
          </Button>
        </div>
        <button
          onClick={() => openModal({ type: 'onboarding' })}
          className="mx-auto mt-6 flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg"
        >
          <HelpCircle size={15} /> Como o Concord funciona?
        </button>
      </div>
    </div>
  );
}
