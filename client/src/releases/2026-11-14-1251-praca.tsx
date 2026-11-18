import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import { AvatarPreview } from '../components/plaza/AvatarEditor';
import { Globe } from '../components/plaza/Globe';
import type { Release } from './index';

function PracaArt() {
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,#6670c4_0,#3d3166_45%,#231a3a_75%)]" />
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-end gap-3">
        <AvatarPreview size={3} spin={false} avatar={{ skin: 1, hair: 1, hairColor: 5, top: 1, topColor: 0, bottomColor: 6, accessory: 3, face: 0 }} />
        <div className="relative">
          <div className="absolute -top-7 left-1/2 w-max -translate-x-1/2 rounded-md border-2 border-[#1b1430] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#1b1430] shadow-[2px_2px_0_#1b1430]">
            bora pra mesa?
          </div>
          <AvatarPreview size={3} spin={false} avatar={{ skin: 4, hair: 2, hairColor: 0, top: 2, topColor: 1, bottomColor: 9, accessory: 1, face: 0 }} />
        </div>
        <AvatarPreview size={3} spin={false} avatar={{ skin: 0, hair: 4, hairColor: 3, top: 0, topColor: 4, bottomColor: 6, accessory: 5, face: 0 }} />
      </div>
      <Spot className="absolute top-3 right-3 h-12 w-12 bg-[#1b1430]">
        <Globe size={38} />
      </Spot>
      <Tag className="top-3 left-3">Clique em Praça</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1251',
  audience: 'plaza',
  title: 'A Praça do servidor',
  highlights: [
    {
      kicker: 'Servidor',
      title: 'Seu servidor virou um lugar',
      text: 'Clique em Praça, na barra lateral logo abaixo do nome do servidor, e você chega lá. Cada sala de voz é uma mesa: clicar numa mesa leva o seu boneco até ela e entra na call, e a TV acende quando alguém transmite. O que você escreve vira balão para quem está na praça e não fica salvo. Por enquanto, só no servidor Founders.',
      art: PracaArt,
      spotlight: {
        target: 'plaza',
        title: 'A Praça',
        tip: 'Clique aqui para ir até a Praça do servidor.',
        fallback: 'Abra o servidor Founders: a Praça fica na barra lateral, logo abaixo do nome do servidor.',
      },
    },
  ],
  also: [
    'Monte o seu boneco na Praça (pele, cabelo, roupa e acessório) no botão da camiseta.',
    'Na Praça dá para acenar, dançar, bater palmas, mandar coração e rir, e quem fica parado muito tempo cochila.',
  ],
  fixes: [],
} satisfies Release;
