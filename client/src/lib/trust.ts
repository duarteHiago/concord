// Fator de Confiança no app: o texto que explica por que a pessoa não pode falar ou transmitir num canal que pede
// um mínimo (ver shared/trust.ts e server/src/trust.ts).
import { ACTION_INFO, requirementText, type TrustAction } from '../../../shared/trust.ts';
import type { Channel } from './types';

/** "Para falar aqui, este canal pede conta com confiança Normal ou Alta." (null: não é a confiança que bloqueia) */
export function trustBlockMessage(channel: Pick<Channel, 'trustBlock'> | undefined, action: Exclude<TrustAction, 'join'>): string | null {
  const req = channel?.trustBlock?.[action];
  return req ? `Para ${ACTION_INFO[action].verb}, este canal pede ${requirementText(req)}.` : null;
}
