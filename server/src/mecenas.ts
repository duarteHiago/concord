// Mecenas: um cargo especial da instalação, dado a uma pessoa que apoia o Concord, com poderes sobre uma
// pessoa escolhida (tremer a tela sem espera, silenciar e desconectar das salas, trocar o apelido).
// A dupla vem do .env (MECENAS=quem>sobre-quem, por nome de usuário) e o cargo vale enquanto quem é o
// mecenas tiver apoio confirmado (ver support.ts): apoiou, ganha; estornou tudo, perde.
// A pessoa alvo sempre escapa da tremida com "Não perturbe" (ou desligando as chamadas de atenção).
import { config } from './config.ts';
import { get } from './db.ts';

export const MECENAS_TITLE = 'Mecenas';

type Who = { id: string; username: string; display_name: string; support_total_cents?: number };
const byUsername = (username: string) =>
  get<Who>('SELECT id, username, display_name, support_total_cents FROM users WHERE username = ? COLLATE NOCASE AND is_bot = 0', username);

/** O mecenas e o alvo, se o cargo está valendo agora (configurado e com apoio confirmado). */
function pair(): { holder: Who; target: Who } | null {
  const m = config.mecenas;
  if (!m) return null;
  const holder = byUsername(m.holder);
  const target = byUsername(m.target);
  if (!holder || !target || holder.id === target.id || !(holder.support_total_cents ?? 0)) return null;
  return { holder, target };
}

const lower = (s: string) => s.toLowerCase();

/** `me` pode usar os poderes de mecenas sobre `target`? */
export function mecenasOver(me: string, target: string): boolean {
  const p = pair();
  return !!p && p.holder.id === me && p.target.id === target;
}

/** Para o perfil público: é o mecenas, ou tem um mecenas (e quem). Só consulta o banco para as duas contas da dupla. */
export function mecenasBadge(username: string): { mecenas?: true; mecenasBy?: string } {
  const m = config.mecenas;
  if (!m) return {};
  const u = lower(username);
  if (u !== m.holder && u !== m.target) return {};
  const p = pair();
  if (!p) return {};
  if (u === m.holder) return { mecenas: true };
  return { mecenasBy: p.holder.username };
}

/** Para o /me de quem é o mecenas: o cargo e sobre quem. */
export function mecenasOfMe(userId: string) {
  const p = pair();
  if (!p || p.holder.id !== userId) return null;
  return { title: MECENAS_TITLE, target: { id: p.target.id, username: p.target.username, displayName: p.target.display_name } };
}
