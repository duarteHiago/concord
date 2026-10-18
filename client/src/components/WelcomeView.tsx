import { Link2, Plus } from 'lucide-react';
import { useApp } from '../store/app';
import { Button } from './ui';

export function WelcomeView() {
  const openModal = useApp((s) => s.openModal);
  return (
    <div className="panel flex flex-1 items-center justify-center p-8">
      <div className="max-w-md animate-slide-up text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-6 h-20 w-20" />
        <h1 className="text-3xl font-extrabold">Seu espaço começa aqui</h1>
        <p className="mt-3 text-fg-muted">
          Crie um servidor para você e seus amigos, ou entre em um com um convite. Lá dentro você terá salas de voz com
          transmissão de tela a 60 fps.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={() => openModal({ type: 'addServer', tab: 'create' })}>
            <Plus size={18} /> Criar servidor
          </Button>
          <Button variant="secondary" onClick={() => openModal({ type: 'addServer', tab: 'join' })}>
            <Link2 size={18} /> Usar convite
          </Button>
        </div>
      </div>
    </div>
  );
}
