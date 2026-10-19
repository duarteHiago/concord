// Canais de fórum: cada post é um tópico com etiqueta, votos, respostas e um status que a moderação controla.

export const FORUM_TAGS = [
  { id: 'ideia', label: 'Ideia', emoji: '💡' },
  { id: 'bug', label: 'Bug', emoji: '🐞' },
  { id: 'feedback', label: 'Feedback', emoji: '💬' },
  { id: 'pergunta', label: 'Pergunta', emoji: '❓' },
  { id: 'outro', label: 'Outro', emoji: '📌' },
] as const;
export type ForumTag = (typeof FORUM_TAGS)[number]['id'];

export const FORUM_STATUSES = [
  { id: 'aberto', label: 'Aberto' },
  { id: 'analise', label: 'Em análise' },
  { id: 'planejado', label: 'Planejado' },
  { id: 'andamento', label: 'Em andamento' },
  { id: 'feito', label: 'Feito' },
  { id: 'recusado', label: 'Não vai rolar' },
] as const;
export type ForumStatus = (typeof FORUM_STATUSES)[number]['id'];

export const FORUM_TITLE_MAX = 120;
export const FORUM_CONTENT_MAX = 4000;
export const FORUM_REPLY_MAX = 2000;
