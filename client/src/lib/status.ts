// Status da pessoa (o menu do status, as configurações e a bolinha da foto). Ver server/src/realtime.ts#PresenceStatus.
import type { PresenceStatus } from './types';

export const STATUSES: PresenceStatus[] = ['online', 'busy', 'dnd', 'invisible'];

export const STATUS_INFO: Record<PresenceStatus, { label: string; hint: string; dot: string; text: string }> = {
  online: { label: 'Online', hint: 'Recebe chamadas de atenção e avisos', dot: 'bg-ok', text: 'text-fg-muted' },
  busy: { label: 'Ocupado', hint: 'Mostra que você está ocupado, mas ainda recebe tudo', dot: 'bg-warn', text: 'text-warn' },
  dnd: { label: 'Não perturbe', hint: 'Ninguém consegue chamar sua atenção', dot: 'bg-danger', text: 'text-danger' },
  invisible: { label: 'Invisível', hint: 'Você aparece offline, mas usa o Concord normalmente', dot: 'bg-fg-subtle', text: 'text-fg-muted' },
};

export const asStatus = (raw: unknown): PresenceStatus => (STATUSES.includes(raw as PresenceStatus) ? (raw as PresenceStatus) : 'online');
