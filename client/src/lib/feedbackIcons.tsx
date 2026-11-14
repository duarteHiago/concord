// Ícone de cada tipo de feedback (shared/feedback.ts#FEEDBACK_KINDS), no mesmo estilo do resto do app.
import { Bug, Lightbulb, MessageCircle, Sparkles, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = { bug: Bug, sugestao: Lightbulb, melhoria: Sparkles, outro: MessageCircle };

export function FeedbackIcon({ kind, size = 16, className }: { kind: string; size?: number; className?: string }) {
  const Icon = ICONS[kind] ?? MessageCircle;
  return <Icon size={size} className={className} aria-hidden />;
}
