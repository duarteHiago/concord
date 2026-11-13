// Monta o material de teste em data/: voz limpa (data/clean), ruídos (data/noise) e misturas (data/mix).
// Voz: o que estiver em data/clean/*.wav (gravações suas, com consentimento; ou datasets públicos, ver README).
// Sem nada lá, gera frases com a voz do Windows (TTS), que serve para regressão, não para julgar qualidade.
// Ruídos: os sintéticos de lib/synth.mjs mais o que estiver em data/noise/*.wav.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, resample, writeWav } from './lib/wav.mjs';
import { NOISES, SR, mixAtSnr, normalize } from './lib/synth.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const data = join(here, 'data');
const dirs = { clean: join(data, 'clean'), noise: join(data, 'noise'), mix: join(data, 'mix') };
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });

const SNRS = [0, 5, 10, 20];
const VOICE_DBFS = -23;

const wavs = (dir) => readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.wav')).sort();

if (!wavs(dirs.clean).length) {
  console.log('Sem voz em data/clean: gerando frases com a voz do Windows (TTS)...');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'scripts', 'tts.ps1'), '-Out', dirs.clean, '-Lang', 'pt-BR'], { encoding: 'utf8' });
    console.log(out.trim());
  } catch (err) {
    console.error('TTS falhou (fora do Windows?). Coloque WAVs de voz limpa em data/clean.', err.message);
    process.exit(1);
  }
}

// voz: 48 kHz mono, nível fixo, com 1 s de silêncio antes e depois (para medir o ruído nas pausas)
const cleans = wavs(dirs.clean).map((f) => {
  const { samples, sampleRate } = readWav(join(dirs.clean, f));
  const at48 = resample(samples, sampleRate, SR);
  const pad = new Float32Array(SR);
  const padded = new Float32Array(pad.length * 2 + at48.length);
  padded.set(at48, pad.length);
  return { name: f.replace(/\.wav$/i, ''), samples: normalize(padded, VOICE_DBFS) };
});

const noises = Object.entries(NOISES).map(([name, make]) => ({ name, samples: make(30) }));
for (const f of wavs(dirs.noise)) {
  const { samples, sampleRate } = readWav(join(dirs.noise, f));
  noises.push({ name: f.replace(/\.wav$/i, ''), samples: resample(samples, sampleRate, SR) });
}

const manifest = [];
for (const c of cleans) {
  writeWav(join(dirs.mix, `${c.name}__limpa.wav`), c.samples, SR);
  for (const nz of noises) {
    for (const snr of SNRS) {
      const { noisy } = mixAtSnr(c.samples, nz.samples, snr);
      const name = `${c.name}__${nz.name}__${snr}dB`;
      writeWav(join(dirs.mix, `${name}.wav`), noisy, SR);
      manifest.push({ name, clean: `${c.name}__limpa.wav`, noisy: `${name}.wav`, noise: nz.name, snr, voice: c.name });
    }
  }
}
writeFileSync(join(data, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`${cleans.length} vozes × ${noises.length} ruídos × ${SNRS.length} SNRs = ${manifest.length} misturas em ${dirs.mix}`);
if (!existsSync(join(dirs.noise, 'README.txt'))) writeFileSync(join(dirs.noise, 'README.txt'), 'Coloque aqui WAVs de ruído real (teclado, ventilador, TV, rua). Eles entram na próxima rodada de `npm run data`.\n');
