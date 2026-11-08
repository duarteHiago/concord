import type { Release } from './index';

export default {
  id: '2026-11-08-0224',
  title: 'Site de cara nova',
  highlights: [],
  also: [
    'A página inicial do Concord ficou mais simples: menos menus no topo e os stickers colados direto no print da call, pra você arrastar e testar.',
    'O guia de instalar no celular já abre no passo a passo do seu sistema, Android ou iPhone.',
    'As páginas de contribuir, privacidade e termos ganharam o mesmo visual da página inicial.',
    'Sem internet, o Concord no celular e no Windows mostra uma tela com as cores do app, e no celular ela recarrega sozinha quando a conexão volta.',
    'Em todas as páginas do site, o botão de baixar entrega o app do seu computador, Windows ou Mac. No celular, ele leva ao guia de instalar.',
  ],
  fixes: [
    'O endereço concord-community.com/instalar/ abria o app em vez do guia de instalação.',
  ],
} satisfies Release;
