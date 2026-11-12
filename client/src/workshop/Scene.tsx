// Cena completa de um pacote: shader no fundo + partículas por cima. Usada na intro, no fundo do Mural e na
// faixa do servidor. Módulo carregado sob demanda (OGL e canvas não entram no pacote principal do app).
import type { ArtKind, Pack } from './packs';
import { Particles, type ParticleMode } from './Particles';
import { ShaderScene } from './ShaderScene';

/** Partículas que ficam no ar o tempo todo, por pacote. */
export const AMBIENT: Record<ArtKind, ParticleMode> = { runes: 'embers', scan: 'stars', steam: 'bokeh', pixel: 'stars', embers: 'embers', orbit: 'stars' };
/** O estouro quando algo "pousa" (emblema da intro, faixa do anunciador). */
export const BURST: Record<ArtKind, ParticleMode> = { runes: 'sparks', scan: 'sparks', steam: 'confetti', pixel: 'confetti', embers: 'sparks', orbit: 'sparks' };

export const particleColors = (pack: Pack) => [pack.colors.a, pack.colors.b, pack.colors.ink];

export function SceneBackdrop({ pack, focus = 0, density = 50, quality = 1 }: { pack: Pack; focus?: number; density?: number; quality?: number }) {
  return (
    <>
      <ShaderScene pack={pack} focus={focus} quality={quality} />
      <Particles mode={AMBIENT[pack.art]} colors={particleColors(pack)} count={density} />
    </>
  );
}

export default SceneBackdrop;
