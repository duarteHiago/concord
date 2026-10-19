import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    // o mesmo aviso repetido (ex.: erro de microfone tentando de novo) aparece uma vez só
    if (get().toasts.some((t) => t.message === message && t.kind === kind)) return;
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (m: string) => useToasts.getState().push(m, 'info'),
  error: (m: unknown) => useToasts.getState().push(m instanceof Error ? m.message : String(m), 'error'),
  success: (m: string) => useToasts.getState().push(m, 'success'),
};
