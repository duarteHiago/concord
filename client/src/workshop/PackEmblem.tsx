// Emblema do pacote: animação Lottie feita por motion designers (LottieFiles, ver public/workshop/CREDITOS.txt)
// quando o pacote tem uma, ou o emblema em SVG da Oficina. O player (WebAssembly) é servido pelo próprio
// Concord: o CSP não deixa buscar de CDN, e assim ele só baixa quando um emblema animado aparece.
import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';
// caminho do arquivo (o pacote não exporta o .wasm); sai sempre na versão instalada do player
import wasmUrl from '../../node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm?url';
import { useState } from 'react';
import { reduceMotion } from '../lib/motion';
import { Emblem } from './Art';
import type { WorkshopPackId } from '../../../shared/workshop.ts';
import type { Pack } from './packs';

setWasmUrl(wasmUrl);

/** Pacotes com animação Lottie (os outros usam o emblema em SVG por cima da cena em shader). */
const LOTTIE: Partial<Record<WorkshopPackId, { src: string; scale: number; round: boolean }>> = {
  runas: { src: '/workshop/lottie/runas.lottie', scale: 1, round: false },
  arcade: { src: '/workshop/lottie/arcade.lottie', scale: 0.9, round: false },
  // a fogueira vem numa cena retangular com fundo: recorta num círculo, como um medalhão
  acampamento: { src: '/workshop/lottie/acampamento.lottie', scale: 1.25, round: true },
};

export const hasLottie = (pack: Pack) => !!LOTTIE[pack.id];

export function PackEmblem({ pack, size }: { pack: Pack; size: number }) {
  const entry = LOTTIE[pack.id];
  const [failed, setFailed] = useState(false);
  if (!entry || failed) return <Emblem pack={pack} size={size} />;
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: entry.round ? '50%' : undefined,
        boxShadow: entry.round ? `0 0 0 3px ${pack.colors.a}, 0 0 40px ${pack.colors.glow}` : undefined,
      }}
    >
      <DotLottieReact
        src={entry.src}
        loop
        autoplay={!reduceMotion()}
        // mede pelo layout (ResizeObserver), não pela caixa transformada: na intro o emblema entra amassado
        renderConfig={{ autoResize: true }}
        style={{ width: '100%', height: '100%', transform: `scale(${entry.scale})` }}
        dotLottieRefCallback={(d) => {
          if (!d) return;
          d.addEventListener('loadError', () => setFailed(true));
          // o player mede a caixa já transformada; remede depois que a entrada (amassa e estica) termina
          d.addEventListener('load', () => [400, 1000].forEach((ms) => setTimeout(() => d.resize(), ms)));
        }}
      />
    </div>
  );
}
