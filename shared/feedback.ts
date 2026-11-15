// Feedback das pessoas para a equipe: bug, sugestão, melhoria ou outro, com prints. Usado pelo app, pelo servidor
// e pelo portal da equipe.

export const FEEDBACK_KINDS = [
  { id: 'bug', label: 'Bug', emoji: '🐞', hint: 'Algo quebrou ou não funciona como devia' },
  { id: 'sugestao', label: 'Sugestão', emoji: '💡', hint: 'Uma ideia nova para o Concord' },
  { id: 'melhoria', label: 'Melhoria', emoji: '✨', hint: 'Algo que existe e podia ficar melhor' },
  { id: 'outro', label: 'Outro', emoji: '💬', hint: 'Qualquer outra coisa' },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]['id'];
export const isFeedbackKind = (v: unknown): v is FeedbackKind => FEEDBACK_KINDS.some((k) => k.id === v);

/** Situação que a pessoa vê em "Meus envios" (e recebe aviso quando muda). */
export const FEEDBACK_STATUSES = [
  { id: 'novo', label: 'Recebido' },
  { id: 'vendo', label: 'Analisando' },
  { id: 'planejado', label: 'Vamos fazer' },
  { id: 'feito', label: 'Feito' },
  { id: 'fechado', label: 'Encerrado' },
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]['id'];
export const isFeedbackStatus = (v: unknown): v is FeedbackStatus => FEEDBACK_STATUSES.some((s) => s.id === v);

export const FEEDBACK_MAX_IMAGES = 3;
export const FEEDBACK_MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const FEEDBACK_BODY_MAX = 3000;
/** Quanto tempo o feedback fica guardado depois da última mudança. */
export const FEEDBACK_RETENTION_DAYS = 365;
