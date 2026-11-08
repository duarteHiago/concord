// Concord de testes (homologação): só entra quem a equipe liberou. Fora do ambiente de testes, todo mundo passa.
import { config } from './config.ts';

export const STAGING_BLOCKED = 'Este é o Concord de testes: só entra quem a equipe liberou. Use o Concord de sempre.';

export function stagingAllows(username: string): boolean {
  if (!config.staging) return true;
  const u = username.toLowerCase();
  return config.stagingUsers.has(u) || config.adminUsers.has(u);
}

if (config.staging && !config.stagingUsers.size && !config.adminUsers.size) {
  console.warn('[testes] STAGING=true sem STAGING_USERS nem ADMIN_USERS: ninguém consegue entrar.');
}
