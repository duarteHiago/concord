import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

// Commits desta branch (origin/main..HEAD). Escreva do ponto de vista de quem usa o app e apague estes comentários.
//
// feat
// (nenhum)
//
// fix
// accept the DeepFilterNet3 model when the server sends it uncompressed; bench waits for worklet warm-up
// noise suppression that cannot go silent, shows the model in use and survives restarts

function Art() {
  return (
    <Frame className="h-[170px]">
      <Tag className="right-3 bottom-3">Troque por uma "foto" do recurso</Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-13-1520',
  title: 'TODO: título curto',
  highlights: [
    {
      kicker: 'TODO',
      title: 'TODO',
      text: 'TODO',
      art: Art,
    },
  ],
  also: [],
  fixes: [],
} satisfies Release;
