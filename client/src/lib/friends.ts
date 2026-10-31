// Ações de amizade (pedir, aceitar, desfazer, bloquear), com o aviso de cada uma. A lista vem do servidor
// (GET /friends) e é recarregada pelo evento "relationships:changed" nos dois lados.
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { api } from './api';
import type { RelationType, User } from './types';

const reload = () => void useApp.getState().loadRelationships();

/** Como eu vejo a pessoa (null = sem relação). */
export const useRelation = (userId: string | null | undefined): RelationType | null =>
  useApp((s) => (userId ? (s.relationships?.find((r) => r.user.id === userId)?.type ?? null) : null));

/** Pedidos de amizade recebidos ainda sem resposta (o número no ícone de Mensagens e na aba Pendentes). */
export const usePendingCount = () => useApp((s) => s.relationships?.filter((r) => r.type === 'incoming').length ?? 0);

/** Pedido pelo @usuário (tela de Amigos) ou pelo id (botões do perfil). Erros sobem para quem chamou. */
export async function addFriend(target: { username: string } | { userId: string }) {
  const res = await api.post<{ type: RelationType; user: User }>('/friends', target);
  toast.success(res.type === 'friend' ? `Agora você e ${res.user.displayName} são amigos.` : `Pedido de amizade enviado para ${res.user.displayName}.`);
  reload();
}

export async function acceptFriend(user: User) {
  await api.post(`/friends/${user.id}/accept`);
  toast.success(`Agora você e ${user.displayName} são amigos.`);
  reload();
}

/** Recusa o pedido recebido ou cancela o que eu mandei (sem confirmação: dá para pedir de novo). */
export async function dropRequest(user: User) {
  await api.del(`/friends/${user.id}`);
  reload();
}

export function confirmUnfriend(user: User) {
  useApp.getState().openModal({
    type: 'confirm',
    title: `Desfazer amizade com ${user.displayName}?`,
    message: 'Vocês deixam de aparecer na lista de amigos um do outro. As conversas continuam onde estão.',
    confirmLabel: 'Desfazer amizade',
    danger: true,
    onConfirm: async () => {
      await api.del(`/friends/${user.id}`);
      reload();
    },
  });
}

export function confirmBlock(user: User) {
  useApp.getState().openModal({
    type: 'confirm',
    title: `Bloquear ${user.displayName}?`,
    message:
      'A pessoa não vai conseguir mandar pedido de amizade nem mensagem privada para você, e a amizade (se houver) é desfeita. Ela não é avisada. Vocês continuam se vendo nos servidores em comum.',
    confirmLabel: 'Bloquear',
    danger: true,
    onConfirm: async () => {
      await api.post(`/friends/${user.id}/block`);
      toast.success(`${user.displayName} foi bloqueado(a).`);
      reload();
    },
  });
}

export async function unblock(user: User) {
  await api.del(`/friends/${user.id}/block`);
  toast.success(`${user.displayName} foi desbloqueado(a).`);
  reload();
}
