import type { Release } from './index';

export default {
  id: '2026-10-31-0152',
  title: 'Conta mais protegida',
  highlights: [],
  also: [
    'Ao conectar o Google ou a Steam, o Concord mostra para qual conta ela vai antes de ligar',
    'No app para Windows, o login com Google volta direto para o app quando você termina no navegador. Se ele pedir, atualize o app',
  ],
  fixes: [
    'Errar a senha de alguém de propósito não tranca mais o dono da conta: o bloqueio vale só para quem está errando',
    'Quem é silenciado por um moderador fica sem microfone de verdade até ser liberado',
  ],
} satisfies Release;
