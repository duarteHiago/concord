import type { Release } from './index';

export default {
  id: '2026-11-22-1200',
  title: 'Registro de auditoria',
  highlights: [],
  also: [
    'Nova aba "Auditoria" nas configurações do servidor: mostra quem mudou o quê, do mais novo para o mais antigo. Entram cargos, canais, categorias, apelidos, expulsões, banimentos, silenciados e desconectados das salas, mensagens apagadas por moderadores, convites, sons, stickers, webhooks, bots e as exigências de segurança.',
    'Clicando numa linha, aparece o antes e o depois (o nome antigo e o novo, as permissões que entraram e saíram) e o motivo, quando teve. Dá para filtrar pelo tipo de ação e por quem fez.',
    'Quem vê é o dono, quem é administrador e quem tem a permissão nova "Ver o registro de auditoria". O cargo Moderador dos servidores novos já vem com ela. Cada registro fica guardado por 90 dias.',
  ],
  fixes: [],
} satisfies Release;
