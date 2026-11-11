import type { Release } from './index';

export default {
  id: '2026-11-10-2254',
  title: 'Mais privacidade e proteção da conta',
  highlights: [],
  also: [
    'Seu status, sua frase e o "Jogando…" só aparecem para quem divide um servidor com você, para os seus amigos e para quem tem conversa privada com você.',
    'Conta criada pelo Google, sem senha: para criar a senha, gerar o código de recuperação, ligar a verificação em duas etapas ou mexer no e-mail, é preciso ter acabado de entrar. Se o app pedir, saia da conta, entre de novo com o Google e faça em até 10 minutos.',
    'Quando alguém sai, é expulso ou banido de um servidor, os convites que essa pessoa criou param de funcionar.',
    'Cada membro pode enviar até 10 stickers e criar até 20 patches por servidor. Quem gerencia o servidor continua usando o limite inteiro.',
  ],
  fixes: [
    'Quem você bloqueou não consegue mais te mandar convite de contrato.',
    'Uma pessoa sozinha não ocupa mais todas as vagas de sticker do servidor, nem trava a troca de ícone de um servidor que não é dela.',
  ],
} satisfies Release;
