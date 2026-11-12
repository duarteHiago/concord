// Os pacotes oficiais da Oficina: arte (CSS/SVG desenhados aqui) e sons sintetizados com WebAudio, sem
// arquivos. Tudo original: nenhum logo, personagem, som ou nome de jogo de terceiros.
import type { ServerTheme, WorkshopPackId } from '../../../shared/workshop.ts';

/** Uma nota do sintetizador. `t` e `d` em segundos; `to` desliza a frequência; `noise` usa ruído filtrado. */
export interface Tone {
  f: number;
  t: number;
  d: number;
  type?: OscillatorType;
  /** volume de pico (0 a 1; os sons de interface ficam por volta de 0.05 a 0.12) */
  g?: number;
  to?: number;
  /** vibrato (Hz) */
  vib?: number;
  /** filtro passa-baixa (Hz) */
  lp?: number;
  /** ruído em vez de oscilador, com filtro passa-banda em `f` */
  noise?: boolean;
}

export type SoundSlot = 'hover' | 'enter' | 'notify' | 'voiceJoin' | 'voiceLeave' | 'peerJoin' | 'peerLeave' | 'announce';

export type ArtKind = 'runes' | 'scan' | 'steam' | 'pixel' | 'embers' | 'orbit';

export interface Pack {
  id: WorkshopPackId;
  name: string;
  /** o clima, em poucas palavras (aparece no card da Oficina) */
  genre: string;
  tagline: string;
  colors: {
    /** destaque principal */
    a: string;
    /** destaque secundário */
    b: string;
    /** brilho (com transparência) */
    glow: string;
    /** fundos escuros da arte (intro, faixa, fundo do Mural) */
    bg: string;
    bg2: string;
    /** texto em cima de bg */
    ink: string;
  };
  art: ArtKind;
  intro: { kicker: string; line: string };
  announcer: { 2: string; 3: string; 5: string };
  notify: { label: string };
  /** fonte de títulos da arte (só fontes que o app já carrega, ou genéricas do sistema) */
  font: string;
  /** tema do servidor que combina com o pacote (instalar o pacote inteiro aplica; todos passam no contraste) */
  theme: Omit<ServerTheme, 'background'>;
  sounds: Record<SoundSlot, Tone[]>;
}

const chord = (freqs: number[], t: number, d: number, extra: Partial<Tone> = {}): Tone[] => freqs.map((f) => ({ f, t, d, ...extra }));
const arp = (freqs: number[], step: number, d: number, extra: Partial<Tone> = {}): Tone[] => freqs.map((f, i) => ({ f, t: i * step, d, ...extra }));

export const PACKS: Record<WorkshopPackId, Pack> = {
  runas: {
    id: 'runas',
    theme: { base: 'dark', surface: '#13213f', accent: '#e8b94a', accent2: '#3fa9f5', shape: 'rounded', font: 'outfit' },
    name: 'Arena das Runas',
    genre: 'MOBA e fantasia',
    tagline: 'Ouro, magia azul e sinos de batalha.',
    colors: { a: '#e8b94a', b: '#3fa9f5', glow: 'rgba(232,185,74,.55)', bg: '#0b1426', bg2: '#132449', ink: '#f6e7c1' },
    art: 'runes',
    intro: { kicker: 'Bem-vindo à arena', line: 'Escolha sua rota. A partida já vai começar.' },
    announcer: { 2: 'Dupla na rota!', 3: 'Trio formado!', 5: 'Equipe completa!' },
    notify: { label: 'Chamado na arena' },
    font: "'Outfit', system-ui, sans-serif",
    sounds: {
      hover: [{ f: 2093, t: 0, d: 0.12, g: 0.035 }, { f: 3136, t: 0.005, d: 0.09, g: 0.02 }],
      enter: [...chord([196, 392, 587], 0, 1.3, { type: 'triangle', g: 0.05 }), { f: 1568, t: 0.08, d: 0.9, g: 0.025 }, { f: 2349, t: 0.12, d: 0.7, g: 0.015 }],
      notify: [{ f: 1319, t: 0, d: 0.18, type: 'triangle', g: 0.1 }, { f: 1760, t: 0.09, d: 0.32, type: 'triangle', g: 0.1 }],
      voiceJoin: arp([392, 523, 784, 1047], 0.06, 0.4, { type: 'triangle', g: 0.06 }),
      voiceLeave: arp([784, 587, 392], 0.07, 0.35, { type: 'triangle', g: 0.06 }),
      peerJoin: [{ f: 659, t: 0, d: 0.2, g: 0.06 }, { f: 988, t: 0.07, d: 0.3, g: 0.06 }],
      peerLeave: [{ f: 659, t: 0, d: 0.2, g: 0.06 }, { f: 440, t: 0.07, d: 0.3, g: 0.06 }],
      announce: [
        { f: 900, t: 0, d: 0.5, noise: true, g: 0.05 },
        ...chord([262, 330, 392], 0.08, 0.9, { type: 'sawtooth', lp: 1400, g: 0.035 }),
        ...chord([523, 659, 784], 0.32, 1.1, { type: 'sawtooth', lp: 1800, g: 0.03 }),
      ],
    },
  },
  tatico: {
    id: 'tatico',
    theme: { base: 'dark', surface: '#151b22', accent: '#ff7a1a', accent2: '#22d3ee', shape: 'cut', font: 'mono' },
    name: 'Neon Tático',
    genre: 'FPS e tiro tático',
    tagline: 'Rádio, mira e cantos recortados.',
    colors: { a: '#ff7a1a', b: '#22d3ee', glow: 'rgba(255,122,26,.55)', bg: '#0a0d10', bg2: '#1b232b', ink: '#e8f6fb' },
    art: 'scan',
    intro: { kicker: 'Conectado ao servidor', line: 'Rádio na escuta. Bom jogo.' },
    announcer: { 2: 'Dupla pronta', 3: 'Esquadrão de três', 5: 'Time fechado: 5/5' },
    notify: { label: 'Chamado no rádio' },
    font: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
    sounds: {
      hover: [{ f: 2400, t: 0, d: 0.025, type: 'square', g: 0.025 }],
      enter: [{ f: 2500, t: 0, d: 0.12, noise: true, g: 0.06 }, { f: 880, t: 0.12, d: 0.06, type: 'square', g: 0.04 }, { f: 1320, t: 0.2, d: 0.08, type: 'square', g: 0.04 }],
      notify: [{ f: 1000, t: 0, d: 0.07, type: 'square', g: 0.06 }, { f: 1000, t: 0.12, d: 0.07, type: 'square', g: 0.06 }],
      voiceJoin: [{ f: 3000, t: 0, d: 0.1, noise: true, g: 0.05 }, { f: 700, t: 0.1, d: 0.12, type: 'square', g: 0.035, to: 1400 }],
      voiceLeave: [{ f: 1400, t: 0, d: 0.14, type: 'square', g: 0.035, to: 600 }, { f: 3000, t: 0.14, d: 0.12, noise: true, g: 0.05 }],
      peerJoin: [{ f: 1200, t: 0, d: 0.05, type: 'square', g: 0.03 }, { f: 1600, t: 0.07, d: 0.06, type: 'square', g: 0.03 }],
      peerLeave: [{ f: 1600, t: 0, d: 0.05, type: 'square', g: 0.03 }, { f: 1000, t: 0.07, d: 0.06, type: 'square', g: 0.03 }],
      announce: [{ f: 520, t: 0, d: 0.6, type: 'sawtooth', lp: 1600, to: 880, g: 0.04 }, { f: 880, t: 0.6, d: 0.12, type: 'square', g: 0.04 }, { f: 880, t: 0.78, d: 0.12, type: 'square', g: 0.04 }],
    },
  },
  lofi: {
    id: 'lofi',
    theme: { base: 'dark', surface: '#2a2038', accent: '#f2a7c3', accent2: '#b7a4ff', shape: 'pill', font: 'padrao' },
    name: 'Café Lo-fi',
    genre: 'estudo, música e papo',
    tagline: 'Luz baixa, vapor e acordes macios.',
    colors: { a: '#f2a7c3', b: '#b7a4ff', glow: 'rgba(242,167,195,.45)', bg: '#1d1626', bg2: '#2c2140', ink: '#fbeef4' },
    art: 'steam',
    intro: { kicker: 'Entre, a casa é sua', line: 'Pega um café e fica à vontade.' },
    announcer: { 2: 'Chegou companhia', 3: 'Roda de três', 5: 'Casa cheia' },
    notify: { label: 'Te chamaram' },
    font: "'Nunito Sans', system-ui, sans-serif",
    sounds: {
      hover: [{ f: 660, t: 0, d: 0.08, g: 0.03, lp: 1200 }],
      enter: chord([262, 330, 392, 494], 0, 1.4, { g: 0.03, vib: 5, lp: 1800 }).map((n, i) => ({ ...n, t: i * 0.04 })),
      notify: [{ f: 784, t: 0, d: 0.3, type: 'triangle', g: 0.07, lp: 2400 }, { f: 1047, t: 0.12, d: 0.4, type: 'triangle', g: 0.07, lp: 2400 }],
      voiceJoin: arp([330, 392, 494], 0.08, 0.5, { g: 0.04, lp: 1800 }),
      voiceLeave: arp([494, 392, 330], 0.08, 0.5, { g: 0.04, lp: 1800 }),
      peerJoin: [{ f: 523, t: 0, d: 0.3, g: 0.04, lp: 1600 }, { f: 659, t: 0.1, d: 0.35, g: 0.04, lp: 1600 }],
      peerLeave: [{ f: 659, t: 0, d: 0.3, g: 0.04, lp: 1600 }, { f: 523, t: 0.1, d: 0.35, g: 0.04, lp: 1600 }],
      announce: arp([523, 659, 784, 1047, 1319], 0.09, 0.7, { type: 'triangle', g: 0.05, lp: 3000 }),
    },
  },
  arcade: {
    id: 'arcade',
    theme: { base: 'dark', surface: '#1e0b3d', accent: '#ff3df2', accent2: '#39ff88', shape: 'cut', font: 'mono' },
    name: 'Fliperama 8-bit',
    genre: 'retrô e jogos de festa',
    tagline: 'Pixels piscando e bipes de ficha.',
    colors: { a: '#ff3df2', b: '#39ff88', glow: 'rgba(255,61,242,.5)', bg: '#0d0221', bg2: '#240b4a', ink: '#fdf6ff' },
    art: 'pixel',
    intro: { kicker: 'Jogador 1, pronto', line: 'Insira a ficha. Ou só entra mesmo.' },
    announcer: { 2: '2 jogadores!', 3: 'Combo x3!', 5: 'Fase bônus: 5!' },
    notify: { label: 'Você foi chamado!' },
    font: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
    sounds: {
      hover: [{ f: 1568, t: 0, d: 0.04, type: 'square', g: 0.025 }],
      enter: [{ f: 988, t: 0, d: 0.08, type: 'square', g: 0.04 }, { f: 1319, t: 0.08, d: 0.25, type: 'square', g: 0.04 }],
      notify: arp([523, 659, 784, 1047], 0.05, 0.09, { type: 'square', g: 0.045 }),
      voiceJoin: arp([262, 392, 523, 784], 0.05, 0.08, { type: 'square', g: 0.04 }),
      voiceLeave: arp([784, 523, 392, 262], 0.05, 0.08, { type: 'square', g: 0.04 }),
      peerJoin: [{ f: 880, t: 0, d: 0.06, type: 'square', g: 0.035 }, { f: 1175, t: 0.06, d: 0.08, type: 'square', g: 0.035 }],
      peerLeave: [{ f: 1175, t: 0, d: 0.06, type: 'square', g: 0.035 }, { f: 880, t: 0.06, d: 0.08, type: 'square', g: 0.035 }],
      announce: [...arp([523, 523, 523], 0.1, 0.07, { type: 'square', g: 0.04 }), { f: 659, t: 0.32, d: 0.12, type: 'square', g: 0.04 }, { f: 784, t: 0.46, d: 0.4, type: 'square', g: 0.04 }],
    },
  },
  acampamento: {
    id: 'acampamento',
    theme: { base: 'dark', surface: '#18291c', accent: '#ffb547', accent2: '#7bd389', shape: 'rounded', font: 'outfit' },
    name: 'Acampamento',
    genre: 'sobrevivência e aventura',
    tagline: 'Fogueira, vagalumes e ocarina.',
    colors: { a: '#ffb547', b: '#7bd389', glow: 'rgba(255,181,71,.5)', bg: '#0f1a12', bg2: '#1f3322', ink: '#fff4dc' },
    art: 'embers',
    intro: { kicker: 'A fogueira está acesa', line: 'Senta aí. Quem trouxe o marshmallow?' },
    announcer: { 2: 'Dupla de exploradores', 3: 'Grupo de três na trilha', 5: 'Expedição completa' },
    notify: { label: 'Chamaram você na fogueira' },
    font: "'Outfit', system-ui, sans-serif",
    sounds: {
      hover: [{ f: 400, t: 0, d: 0.04, noise: true, g: 0.05 }, { f: 220, t: 0, d: 0.05, type: 'triangle', g: 0.03 }],
      enter: arp([587, 659, 784, 880], 0.14, 0.4, { g: 0.05, vib: 6 }),
      notify: [{ f: 2000, t: 0, d: 0.09, g: 0.05, to: 3000 }, { f: 2200, t: 0.13, d: 0.09, g: 0.05, to: 3200 }],
      voiceJoin: [{ f: 600, t: 0, d: 0.5, noise: true, g: 0.04 }, ...arp([392, 523, 659], 0.1, 0.4, { g: 0.045, vib: 5 })],
      voiceLeave: arp([659, 523, 392], 0.1, 0.4, { g: 0.045, vib: 5 }),
      peerJoin: [{ f: 784, t: 0, d: 0.25, g: 0.045, vib: 6 }, { f: 988, t: 0.1, d: 0.3, g: 0.045, vib: 6 }],
      peerLeave: [{ f: 784, t: 0, d: 0.25, g: 0.045, vib: 6 }, { f: 587, t: 0.1, d: 0.3, g: 0.045, vib: 6 }],
      announce: [{ f: 500, t: 0, d: 0.9, noise: true, g: 0.05 }, ...arp([392, 494, 587, 784], 0.12, 0.6, { type: 'triangle', g: 0.05 })],
    },
  },
  galaxia: {
    id: 'galaxia',
    theme: { base: 'dark', surface: '#121838', accent: '#7c9cff', accent2: '#4ef0d0', shape: 'pill', font: 'outfit' },
    name: 'Estação Galáxia',
    genre: 'sci-fi e espaço',
    tagline: 'Órbitas, sonar e motores de dobra.',
    colors: { a: '#7c9cff', b: '#4ef0d0', glow: 'rgba(124,156,255,.55)', bg: '#05060f', bg2: '#131a3a', ink: '#e9efff' },
    art: 'orbit',
    intro: { kicker: 'Atracando na estação', line: 'Pressão estável. Bem-vindo a bordo.' },
    announcer: { 2: 'Tripulação: 2', 3: 'Tripulação: 3', 5: 'Nave lotada: 5' },
    notify: { label: 'Sinal recebido' },
    font: "'Outfit', system-ui, sans-serif",
    sounds: {
      hover: [{ f: 1200, t: 0, d: 0.07, g: 0.03, to: 2400 }],
      enter: [{ f: 110, t: 0, d: 1.3, type: 'sawtooth', lp: 700, g: 0.05, to: 220 }, { f: 220, t: 0.1, d: 1.1, g: 0.03 }, { f: 1760, t: 0.5, d: 0.6, g: 0.015 }],
      notify: [{ f: 1047, t: 0, d: 0.9, g: 0.08 }, { f: 1047, t: 0.35, d: 0.6, g: 0.03 }],
      voiceJoin: [{ f: 300, t: 0, d: 0.35, g: 0.05, to: 900 }, { f: 1200, t: 0.3, d: 0.3, g: 0.03 }],
      voiceLeave: [{ f: 900, t: 0, d: 0.4, g: 0.05, to: 250 }],
      peerJoin: [{ f: 700, t: 0, d: 0.18, g: 0.04, to: 1100 }],
      peerLeave: [{ f: 1100, t: 0, d: 0.18, g: 0.04, to: 700 }],
      announce: [{ f: 2000, t: 0, d: 0.8, noise: true, g: 0.04 }, { f: 160, t: 0, d: 0.9, type: 'sawtooth', lp: 900, to: 640, g: 0.04 }, ...chord([523, 784, 1047], 0.75, 0.8, { g: 0.03 })],
    },
  },
};

export const PACK_LIST = Object.values(PACKS);
