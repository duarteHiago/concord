// Roda os modelos do app em Node, usando os mesmos arquivos de worklet e wasm do cliente (nada reimplementado):
// DeepFilterNet3 (client/src/lib/worklets), GTCRN e RNNoise (@sapphi-red/web-noise-suppressor). O portão de voz
// e o nivelador ficam fora neste modo (são do navegador; o modo "browser" roda a cadeia inteira).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const client = join(here, '..', '..', '..', 'client');
const require = createRequire(import.meta.url);

const SR = 48000;
const BLOCK = 128;

// globais que um AudioWorkletProcessor espera
const registry = new Map();
globalThis.sampleRate = SR;
globalThis.AudioWorkletProcessor ??= class {
  constructor() {
    const listeners = [];
    this.port = {
      onmessage: null,
      sent: [],
      postMessage: (m) => this.port.sent.push(m),
      addEventListener: (_t, fn) => listeners.push(fn),
      dispatch: (data) => {
        this.port.onmessage?.({ data });
        for (const fn of listeners) fn({ data });
      },
    };
  }
};
globalThis.registerProcessor ??= (name, cls) => registry.set(name, cls);
globalThis.self ??= globalThis;
// o carregador emscripten do RNNoise acha que está em Node (CommonJS) e pede __dirname/require; o wasm vem pronto
// por processorOptions, então basta existirem
globalThis.__dirname ??= here;
globalThis.require ??= require;

async function worklet(file, name) {
  await import(pathToFileURL(file).href);
  return registry.get(name);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Um "motor": `process(Float32Array) → Float32Array` e `destroy()`. */
export async function makeEngine(mode, { strength = 45, beta = 0 } = {}) {
  if (mode === 'off') return { name: 'off', process: (x) => x, destroy() {} };
  if (mode === 'dfn' || mode === 'dfn-auto') {
    const Dfn = await worklet(join(client, 'src/lib/worklets/deepfilter.worklet.js'), 'deepfilter-audio-processor');
    const wasmModule = await WebAssembly.compile(readFileSync(join(client, 'public/vendor/deepfilternet3/v3/pkg/df_bg.wasm')));
    const modelBytes = readFileSync(join(client, 'public/vendor/deepfilternet3/v3/models/DeepFilterNet3_onnx.tar.gz'));
    if (mode === 'dfn') {
      const proc = new Dfn({ processorOptions: { wasmModule, modelBytes, suppressionLevel: strength, postFilterBeta: beta } });
      if (proc.port.sent[0]?.type !== 'ready') throw new Error(`DFN não ficou pronto: ${JSON.stringify(proc.port.sent)}`);
      return wrap('dfn', proc);
    }
    // "IA máxima automática": o mesmo controlador do app (client/src/lib/noiseAuto.ts) lê o nível da entrada a
    // cada 100 ms (média de 200 ms, como o medidor) e manda a força nova para o worklet
    const { AUTO_INITIAL, autoStep } = await import(pathToFileURL(join(client, 'src/lib/noiseAuto.ts')).href);
    const proc = new Dfn({ processorOptions: { wasmModule, modelBytes, suppressionLevel: AUTO_INITIAL.strength, postFilterBeta: AUTO_INITIAL.beta } });
    if (proc.port.sent[0]?.type !== 'ready') throw new Error(`DFN não ficou pronto: ${JSON.stringify(proc.port.sent)}`);
    const base = wrap('dfn-auto', proc);
    let auto = { ...AUTO_INITIAL };
    let energy = 0;
    const alpha = 1 - Math.exp(-128 / (SR * 0.2));
    let clock = 0;
    const strengths = [];
    return {
      ...base,
      process(x) {
        // bloco a bloco (sem cortar o sinal em pedaços, que desalinharia a saída); o controlador roda a cada 100 ms
        const out = new Float32Array(x.length);
        const input = new Float32Array(BLOCK);
        let since = 0;
        for (let pos = 0; pos < x.length; pos += BLOCK) {
          const len = Math.min(BLOCK, x.length - pos);
          input.fill(0);
          input.set(x.subarray(pos, pos + len));
          let e = 0;
          for (let i = 0; i < len; i++) e += input[i] * input[i];
          energy += (e / len - energy) * alpha; // nível como o medidor do app (EMA de 200 ms)
          since += len;
          if (since >= SR * 0.1) {
            since = 0;
            clock += 100;
            const next = autoStep(auto, 10 * Math.log10(energy + 1e-12), clock);
            if (next.strength !== auto.strength) {
              proc.port.dispatch({ type: 'SET_SUPPRESSION_LEVEL', value: next.strength });
              proc.port.dispatch({ type: 'SET_POST_FILTER_BETA', value: next.beta });
            }
            auto = next;
            strengths.push(auto.strength);
          }
          const block = [new Float32Array(BLOCK)];
          if (!proc.process([[input]], [block], {})) throw new Error('dfn-auto: o processador pediu para morrer');
          out.set(block[0].subarray(0, len), pos);
        }
        return out;
      },
      strengths: () => strengths,
    };
  }
  if (mode === 'gtcrn' || mode === 'rnnoise') {
    // os mesmos arquivos que o cliente importa (`...Worklet.js?url` e `...wasm?url`), pelas exportações do pacote
    const Proc = await worklet(require.resolve(`@sapphi-red/web-noise-suppressor/${mode}Worklet.js`), `@sapphi-red/web-noise-suppressor/${mode}`);
    const wasmBinary = readFileSync(require.resolve(`@sapphi-red/web-noise-suppressor/${mode === 'gtcrn' ? 'gtcrn.wasm' : 'rnnoise_simd.wasm'}`));
    const proc = new Proc({ processorOptions: { maxChannels: 1, wasmBinary } });
    // o construtor inicia o wasm de forma assíncrona; até lá a saída fica em silêncio
    for (let i = 0; i < 200 && !proc.processor; i++) await sleep(25);
    if (!proc.processor) throw new Error(`${mode}: wasm não iniciou`);
    return wrap(mode, proc, () => proc.port.dispatch('destroy'));
  }
  throw new Error(`modo desconhecido: ${mode}`);
}

function wrap(name, proc, destroy) {
  return {
    name,
    process(x) {
      const out = new Float32Array(x.length);
      // sempre blocos de 128 (como o navegador): o último, se for mais curto, vai preenchido com zeros
      const input = new Float32Array(BLOCK);
      for (let pos = 0; pos < x.length; pos += BLOCK) {
        const len = Math.min(BLOCK, x.length - pos);
        input.fill(0);
        input.set(x.subarray(pos, pos + len));
        const block = [new Float32Array(BLOCK)];
        const keep = proc.process([[input]], [block], {});
        if (!keep) throw new Error(`${name}: o processador pediu para morrer no meio`);
        out.set(block[0].subarray(0, len), pos);
      }
      return out;
    },
    errors: () => proc.port.sent.filter((m) => m && m.type === 'error'),
    destroy: destroy ?? (() => proc.port.dispatch?.('destroy') ?? proc.port.onmessage?.({ data: 'destroy' })),
  };
}
