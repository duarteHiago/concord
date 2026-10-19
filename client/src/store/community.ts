import { create } from 'zustand';
import { api } from '../lib/api';
import type { InvitePreview, ServerSummary } from '../lib/types';
import { useApp } from './app';
import { toast } from './toast';

/** Servidor oficial da comunidade (configurado no servidor com COMMUNITY_INVITE). */
export const useCommunity = create<{
  invite: InvitePreview | null;
  joining: boolean;
  load: () => void;
  join: () => Promise<void>;
}>((set, get) => ({
  invite: null,
  joining: false,
  load: () => {
    api.get<{ communityInvite: string | null }>('/config').then((c) => {
      if (c.communityInvite) api.get<InvitePreview>(`/invites/${encodeURIComponent(c.communityInvite)}`).then((invite) => set({ invite }), () => {});
    }, () => {});
  },
  join: async () => {
    const { invite, joining } = get();
    if (!invite || joining) return;
    set({ joining: true });
    try {
      const server = await api.post<ServerSummary>(`/invites/${encodeURIComponent(invite.code)}`);
      const st = useApp.getState();
      if (!st.servers.some((s) => s.id === server.id)) useApp.setState({ servers: [...st.servers, server] });
      st.openServer(server.id);
    } catch (err) {
      toast.error(err);
    }
    set({ joining: false });
  },
}));

/** O convite da comunidade, se a pessoa ainda não estiver nela. */
export function usePendingCommunity() {
  const invite = useCommunity((s) => s.invite);
  const member = useApp((s) => !!invite && s.servers.some((x) => x.id === invite.server.id));
  return member ? null : invite;
}
