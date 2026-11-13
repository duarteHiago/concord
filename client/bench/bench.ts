// Expõe window.renderChain para a bancada (tools/denoise-bench, modo browser): recebe áudio mono 48 kHz em
// base64 (Float32), monta a MESMA cadeia do microfone do app num OfflineAudioContext e devolve o resultado.
import { Chain, type ChainSettings } from '../src/lib/voiceEffects';

const fromB64 = (b64: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
};
const toB64 = (f32: Float32Array) => {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

async function renderChain(b64: string, settings: ChainSettings) {
  try {
    const input = fromB64(b64);
    const ctx = new OfflineAudioContext(1, input.length, 48000);
    const buffer = ctx.createBuffer(1, input.length, 48000);
    buffer.copyToChannel(input, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const chain = new Chain(ctx, src, ctx.destination, settings, {});
    await chain.build();
    src.start();
    const rendered = await ctx.startRendering();
    chain.teardown();
    return { b64: toB64(rendered.getChannelData(0)), active: chain.active, reason: chain.reason };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

(window as unknown as { renderChain: typeof renderChain }).renderChain = renderChain;
