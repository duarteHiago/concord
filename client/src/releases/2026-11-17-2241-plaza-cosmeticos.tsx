import { Frame, Tag } from '../components/modals/OnboardingArt';
import { AvatarPreview } from '../components/plaza/AvatarEditor';
import type { Release } from './index';

function CosmeticosArt() {
  const base = { skin: 1, hair: 0, hairColor: 1, top: 1, topColor: 6, bottomColor: 6, accessory: 0, face: 0 };
  return (
    <Frame className="h-[170px] bg-[#231a3a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,#6670c4_0,#3d3166_45%,#231a3a_75%)]" />
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-end gap-2">
        <AvatarPreview size={3} spin={false} avatar={{ ...base, face: 1, topColor: 1 }} />
        <AvatarPreview size={3} spin={false} avatar={{ ...base, skin: 3, hair: 1, hairColor: 7, accessory: 8, topColor: 4 }} />
        <AvatarPreview size={3} spin={false} avatar={{ ...base, accessory: 13, topColor: 2 }} />
        <AvatarPreview size={3} spin={false} avatar={{ ...base, face: 2 }} />
        <AvatarPreview size={3} spin={false} avatar={{ ...base, skin: 0, hair: 4, hairColor: 3, accessory: 6, face: 9, topColor: 3 }} />
      </div>
      <Tag className="top-3 left-3">Na cabeça e no rosto</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-17-2241',
  audience: 'plaza',
  title: 'Máscaras e chapéus na Praça',
  highlights: [
    {
      kicker: 'Praça',
      title: 'Máscaras e chapéus para o seu boneco',
      text: 'O boneco da Praça ganhou um lugar novo, "No rosto", com máscara de hóquei, fantasma, caveira, bandana, bigode, tapa-olho, nariz de palhaço e mais. Na cabeça chegaram coroa, cartola, chapéu de bruxa, chifres, auréola, orelhas de gato, capacete viking e cabeça de abóbora. Dá para combinar os dois no botão da camiseta, dentro da Praça.',
      art: CosmeticosArt,
    },
  ],
  also: [],
  fixes: [],
} satisfies Release;
