import { Check, MessageCircle, UserPlus, Users, X } from 'lucide-react';
import { Frame, Tag } from '../components/modals/OnboardingArt';
import { useApp } from '../store/app';
import type { Release } from './index';

function FriendsArt() {
  return (
    <Frame className="flex h-[170px] flex-col gap-2 px-4 pt-3">
      <div className="flex items-center gap-2 text-[11px] font-bold">
        <Users size={13} /> Amigos
        <span className="rounded-full bg-surface-4 px-2 py-0.5 text-[10px]">Online</span>
        <span className="text-[10px] text-fg-muted">Pendentes</span>
        <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] text-on-accent">
          <UserPlus size={10} /> Adicionar amigo
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
        <div className="h-6 w-6 rounded-full bg-accent-2" />
        <div className="min-w-0 flex-1 text-[11px]">
          <div className="font-bold">Bia</div>
          <div className="text-[10px] text-fg-muted">Quer ser seu amigo</div>
        </div>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-4 text-ok">
          <Check size={12} />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-4">
          <X size={12} />
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
        <div className="h-6 w-6 rounded-full bg-warn" />
        <div className="min-w-0 flex-1 text-[11px]">
          <div className="font-bold">Caio</div>
          <div className="text-[10px] text-ok">Online</div>
        </div>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-4">
          <MessageCircle size={12} />
        </span>
      </div>
      <Tag className="right-3 bottom-2.5">Mensagens → Amigos</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-09-2300',
  title: 'Amigos',
  highlights: [
    {
      kicker: 'Amigos',
      title: 'Adicione seus amigos pelo nome de usuário',
      text: 'Em Mensagens, a tela de Amigos mostra quem está online e os pedidos que chegaram. Para adicionar alguém, toque em "Adicionar amigo" e digite o @ da pessoa, ou use o botão de amizade no perfil dela. Amigos conversam no privado mesmo sem um servidor em comum.',
      art: FriendsArt,
      action: { label: 'Abrir Amigos', run: () => useApp.getState().openFriends() },
    },
  ],
  also: [
    'Dá para bloquear alguém pelo perfil ou pela lista de amigos: a pessoa não consegue mais mandar pedido nem mensagem privada para você, e não fica sabendo.',
    'O perfil de outra pessoa mostra os amigos que vocês têm em comum.',
  ],
} satisfies Release;
