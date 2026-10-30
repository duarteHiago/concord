// O contrato de Mecenato da própria pessoa (aba "Mecenato" das configurações). Carrega ao entrar no app e
// recarrega quando o servidor avisa (contract:updated), já que tudo muda do lado de lá: liderança, Escudo, prazo.
import { create } from 'zustand';
import { api } from '../lib/api';
import type { ContractsMe } from '../lib/types';

interface ContractsState {
  data: ContractsMe | null;
  load: () => Promise<void>;
  set: (data: ContractsMe) => void;
}

let inflight: Promise<void> | null = null;

export const useContracts = create<ContractsState>((set) => ({
  data: null,
  load: () =>
    (inflight ??= api
      .get<ContractsMe>('/contracts/me')
      .then((data) => set({ data }))
      .catch(() => {})
      .finally(() => {
        inflight = null;
      })),
  set: (data) => set({ data }),
}));
