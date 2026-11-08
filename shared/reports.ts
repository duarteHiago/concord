// Motivos das denúncias. Compartilhado entre o servidor (validação) e o app (modal e portal da equipe).
// A ordem é a da gravidade: é assim que a fila do portal ordena as denúncias abertas.

export const REPORT_CATEGORIES = ['csam', 'violence', 'nudity', 'harassment', 'spam', 'other'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_INFO: Record<ReportCategory, { label: string; description: string }> = {
  csam: { label: 'Abuso ou exploração de criança', description: 'Conteúdo sexual com menor, aliciamento ou pedido de fotos a uma criança ou adolescente.' },
  violence: { label: 'Violência ou automutilação', description: 'Ameaça, agressão, crueldade com animais, incentivo a se machucar ou a tirar a própria vida.' },
  nudity: { label: 'Nudez ou conteúdo sexual', description: 'Nudez ou sexo mostrado sem o consentimento de quem está vendo.' },
  harassment: { label: 'Assédio ou discurso de ódio', description: 'Perseguição, humilhação, ataques por raça, gênero, religião, orientação ou deficiência.' },
  spam: { label: 'Spam ou golpe', description: 'Propaganda em massa, links suspeitos, golpes e contas falsas.' },
  other: { label: 'Outro motivo', description: 'Algo que fere as regras e não está acima. Conte nos detalhes.' },
};
