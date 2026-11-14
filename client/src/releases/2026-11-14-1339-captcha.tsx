import type { Release } from './index';

export default {
  id: '2026-11-14-1339',
  title: 'Verificação anti-robô mais firme',
  highlights: [],
  fixes: [
    'A verificação de "não sou robô" do cadastro e do "esqueci a senha" tenta de novo sozinha quando falha ou vence, em vez de travar o botão, e diz o que fazer se continuar falhando.',
  ],
} satisfies Release;
