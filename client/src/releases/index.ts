// Novidades do Concord: cada arquivo AAAA-MM-DD.tsx desta pasta é uma edição (o que chegou naquela atualização).
// A apresentação abre sozinha uma vez para quem ainda não viu, e tudo fica em "Novidades" na fileira de servidores.
import type { ComponentType } from 'react';
import { useApp } from '../store/app';

export interface Highlight {
  /** rótulo curto da área do app ("Chat", "Transmissão"...) */
  kicker: string;
  title: string;
  text: string;
  /** "foto" do recurso, feita com os tokens do tema (ver components/modals/OnboardingArt.tsx) */
  art: ComponentType;
  /** leva a pessoa direto até o recurso */
  action?: { label: string; run: () => void };
  /** aponta o botão de verdade na interface (precisa de data-tour="<target>" nele) */
  spotlight?: { target: string; title: string; tip: string; /** quando o botão não está na tela */ fallback: string };
}

export interface Release {
  /** data da atualização (AAAA-MM-DD); também é a ordem */
  id: string;
  title: string;
  /** recursos que mudam como a pessoa usa o app: cada um vira um passo da apresentação */
  highlights: Highlight[];
  /** melhorias visíveis que não precisam de explicação */
  also?: string[];
  /** escritos do ponto de vista de quem sofria com o problema */
  fixes?: string[];
}

const modules = import.meta.glob<{ default: Release }>('./*.tsx', { eager: true });

/** Mais recente primeiro. */
export const RELEASES: Release[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => b.id.localeCompare(a.id));

export const LATEST_RELEASE = RELEASES[0]?.id;

/** Edições que a pessoa ainda não viu. Quem nunca viu nenhuma (contas de antes desta função) recebe só a última. */
export function unseenReleases(lastSeen: string | undefined): Release[] {
  if (!lastSeen) return RELEASES.slice(0, 1);
  return RELEASES.filter((r) => r.id > lastSeen);
}

export function useUnseenReleases(): Release[] {
  const lastSeen = useApp((s) => s.me?.settings.lastSeenRelease);
  return unseenReleases(lastSeen);
}

export function markReleasesSeen() {
  const { me, saveSettings } = useApp.getState();
  if (!me || !LATEST_RELEASE || me.settings.lastSeenRelease === LATEST_RELEASE) return;
  void saveSettings({ lastSeenRelease: LATEST_RELEASE });
}

/** "23 de outubro" (ou "23 de outubro de 2025" quando não é deste ano) */
export function releaseDate(id: string): string {
  const d = new Date(`${id}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}
