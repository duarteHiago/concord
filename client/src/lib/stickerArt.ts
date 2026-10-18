import type { PresetSticker } from '../../../shared/cosmetics.ts';

// Arte original dos stickers prontos (desenhos próprios, sem logos/arte oficial dos jogos).
// Cada um é um SVG 200×200 com contorno grosso estilo cartoon; o recorte branco e o brilho vêm do CSS.

const INK = '#1a1024';
const o = (w = 6) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function txt(x: number, y: number, size: number, fill: string, content: string, rot = 0, spacing = 0) {
  return `<text x="${x}" y="${y}" font-family="Arial Black, Impact, Haettenschweiler, sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" letter-spacing="${spacing}" fill="${fill}" stroke="${INK}" stroke-width="${(size * 0.18).toFixed(1)}" paint-order="stroke" stroke-linejoin="round" transform="rotate(${rot} ${x} ${y})">${content}</text>`;
}

/** Brilho branco "cartoon" (meia-lua) */
const shine = (d: string, op = 0.55) => `<path d="${d}" fill="#fff" opacity="${op}"/>`;

function burst(cx: number, cy: number, r1: number, r2: number, n: number, fill: string) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" ${o(6)}/>`;
}

const sparkle = (x: number, y: number, s: number, fill = '#fff') =>
  `<path d="M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z" fill="${fill}" ${o(3)}/>`;

const ART: Record<PresetSticker, string> = {
  headshot: `
    <circle cx="100" cy="92" r="78" fill="none" stroke="${INK}" stroke-width="14"/>
    <circle cx="100" cy="92" r="78" fill="none" stroke="#ff3b4e" stroke-width="7"/>
    <path d="M100 4v34M100 146v34M12 92h34M154 92h34" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
    <path d="M100 4v34M100 146v34M12 92h34M154 92h34" stroke="#ff3b4e" stroke-width="6" stroke-linecap="round"/>
    <path d="M58 88c0-30 19-50 42-50s42 20 42 50c0 14-6 22-13 27v17H71v-17c-7-5-13-13-13-27z" fill="#fff4e6" ${o()}/>
    <ellipse cx="83" cy="90" rx="12" ry="14" fill="${INK}"/><ellipse cx="117" cy="90" rx="12" ry="14" fill="${INK}"/>
    <circle cx="86" cy="86" r="4" fill="#ff3b4e"/><circle cx="120" cy="86" r="4" fill="#ff3b4e"/>
    <path d="M95 112l5-9 5 9z" fill="${INK}"/><path d="M84 122v10M94 122v10M106 122v10M116 122v10" ${o(4)}/>
    ${shine('M70 70c4-14 14-22 24-24-8 6-14 14-16 26z', 0.7)}
    <rect x="22" y="150" width="156" height="40" rx="12" fill="#ffd23f" ${o()} transform="rotate(-5 100 170)"/>
    ${txt(100, 182, 30, '#fff', 'HEADSHOT', -5)}`,

  gg: `
    <path d="M30 30h140q16 0 16 16v78q0 16-16 16H92l-34 34 4-34H30q-16 0-16-16V46q0-16 16-16z" fill="#3ddc84" ${o(7)}/>
    ${shine('M30 42h70q-50 6-60 40-4-6-10-12V50q0-8 0-8z', 0.45)}
    ${txt(100, 116, 86, '#fff', 'GG', -4, 4)}
    ${sparkle(176, 22, 14, '#ffd23f')}${sparkle(24, 150, 10, '#fff')}`,

  ace: `
    <g transform="rotate(-10 100 100)">
      <rect x="44" y="16" width="112" height="156" rx="14" fill="#fff" ${o(7)}/>
      <path d="M100 52c-30 26-42 38-42 56 0 14 12 22 24 22 8 0 13-4 16-8l-6 24h16l-6-24c3 4 8 8 16 8 12 0 24-8 24-22 0-18-12-30-42-56z" fill="${INK}"/>
      ${txt(64, 50, 26, '#ff3b4e', 'A')}${txt(136, 160, 26, '#ff3b4e', 'A', 180)}
      ${shine('M56 30h40q-30 8-34 40h-6z', 0.35)}
    </g>
    <path d="M18 150h164l-12 18 12 18H18l12-18z" fill="#ffd23f" ${o(6)}/>
    ${txt(100, 181, 30, '#fff', 'ACE', 0, 3)}`,

  clutch: `
    <path d="M100 6c10 30 46 44 46 92 0 22-10 38-22 46 6-14 2-30-10-38 2 22-8 32-14 36 2-14-6-24-14-30 0 18-14 22-14 40-14-10-26-28-26-52 0-34 22-46 28-70 6 14 10 24 8 38 10-10 20-28 18-62z" fill="#ff7a1a" ${o(7)}/>
    <path d="M100 56c6 18 26 28 26 54 0 14-8 24-16 28 2-12-2-20-10-26 0 14-8 20-12 24 0-10-4-16-10-20-2 12-10 16-10 26-8-8-12-18-12-30 0-20 14-28 18-42 4 8 6 14 6 22 8-8 12-20 10-36z" fill="#ffd23f"/>
    <rect x="16" y="132" width="168" height="50" rx="14" fill="#ff3b4e" ${o(7)} transform="rotate(4 100 157)"/>
    ${txt(100, 170, 38, '#fff', 'CLUTCH', 4, 2)}`,

  sniper: `
    ${burst(100, 100, 92, 70, 14, '#ffd23f')}
    <g transform="rotate(-28 100 100)">
      <rect x="8" y="94" width="104" height="14" rx="4" fill="#4a5d3a" ${o(5)}/>
      <rect x="0" y="97" width="18" height="8" rx="2" fill="#333" ${o(4)}/>
      <path d="M108 88h44l34 10v26l-30-4-12 10h-36z" fill="#6b4a2b" ${o(5)}/>
      <path d="M110 108v26h14l6-26z" fill="#3a2a1c" ${o(4)}/>
      <rect x="84" y="66" width="62" height="18" rx="9" fill="#2a2a35" ${o(5)}/>
      <circle cx="84" cy="75" r="11" fill="#2a2a35" ${o(5)}/><circle cx="84" cy="75" r="6" fill="#5ad1ff"/>
      <circle cx="82" cy="73" r="2.5" fill="#fff"/>
      <path d="M104 84v8M128 84v8" ${o(5)}/>
      ${shine('M90 70h40q-26 2-36 8z', 0.5)}
    </g>
    ${txt(100, 190, 30, '#fff', 'ONE TAP', -4, 1)}`,

  grenade: `
    <circle cx="96" cy="118" r="62" fill="#5b7f3a" ${o(7)}/>
    <path d="M40 104h112M40 132h112M78 58v120M114 58v120" stroke="${INK}" stroke-width="4" opacity="0.55"/>
    <rect x="72" y="34" width="50" height="30" rx="6" fill="#9aa3ad" ${o(6)}/>
    <path d="M122 40h32q12 0 12 12v52" fill="none" ${o(12)}/><path d="M122 40h32q12 0 12 12v52" fill="none" stroke="#c9d1d9" stroke-width="5" stroke-linecap="round"/>
    <circle cx="66" cy="30" r="20" fill="none" ${o(10)}/><circle cx="66" cy="30" r="20" fill="none" stroke="#ffd23f" stroke-width="4"/>
    ${shine('M58 86c10-16 26-22 40-22-18 8-28 18-32 34z', 0.5)}
    ${sparkle(170, 150, 14, '#ffd23f')}${sparkle(24, 80, 9)}`,

  bomb: `
    <rect x="18" y="56" width="164" height="110" rx="12" fill="#c8a165" ${o(7)}/>
    <rect x="18" y="56" width="164" height="22" rx="8" fill="#a8844a" ${o(5)}/>
    <rect x="44" y="92" width="112" height="46" rx="8" fill="#1c2a1c" ${o(6)}/>
    <text x="100" y="128" font-family="Courier New, monospace" font-weight="900" font-size="36" text-anchor="middle" fill="#ff3b4e">0:40</text>
    <circle cx="160" cy="70" r="7" fill="#ff3b4e" ${o(3)}/>
    <path d="M40 166c0 16 18 20 30 12M100 166c4 18-14 22-22 30M150 166c8 14 22 10 26 22" fill="none" stroke="#ff3b4e" stroke-width="6" stroke-linecap="round"/>
    <path d="M58 56c-4-22 10-36 30-36" fill="none" stroke="#3a7bd5" stroke-width="7" stroke-linecap="round"/>
    ${shine('M30 66h70q-50 4-64 18z', 0.45)}
    ${txt(100, 40, 30, '#ffd23f', 'PLANTED', -3, 1)}`,

  rushb: `
    <path d="M14 60h112V22l64 68-64 68v-38H14z" fill="#ffd23f" ${o(8)}/>
    ${shine('M24 70h96v-32l14 14-10 10v18H24z', 0.4)}
    ${txt(86, 112, 44, '#fff', 'RUSH B', 0, 1)}
    ${txt(100, 190, 32, '#ff3b4e', 'CYKA!', -6)}`,

  mvp: `
    ${burst(100, 108, 84, 66, 12, '#ffcf3f')}
    <circle cx="100" cy="108" r="56" fill="#ffb703" ${o(6)}/>
    <circle cx="100" cy="108" r="44" fill="#ffd23f" ${o(4)}/>
    <path d="M70 58l12-28 18 20 18-20 12 28z" fill="#ffd23f" ${o(6)}/>
    <circle cx="82" cy="30" r="5" fill="#ff3b4e" ${o(3)}/><circle cx="118" cy="30" r="5" fill="#ff3b4e" ${o(3)}/>
    ${txt(100, 126, 44, '#fff', 'MVP', 0, 1)}
    ${shine('M66 92c6-16 18-24 30-26-12 8-18 16-22 30z', 0.6)}`,

  trophy: `
    <path d="M56 26h88v40c0 32-20 52-44 52S56 98 56 66z" fill="#ffc93c" ${o(7)}/>
    <path d="M56 40H32q-6 0-6 8c0 22 16 34 32 34M144 40h24q6 0 6 8c0 22-16 34-32 34" fill="none" ${o(9)}/>
    <path d="M56 40H32q-6 0-6 8c0 22 16 34 32 34M144 40h24q6 0 6 8c0 22-16 34-32 34" fill="none" stroke="#ffc93c" stroke-width="4"/>
    <rect x="88" y="116" width="24" height="28" fill="#e0a526" ${o(6)}/>
    <rect x="58" y="144" width="84" height="32" rx="6" fill="#7b4b2a" ${o(7)}/>
    <rect x="76" y="152" width="48" height="14" rx="3" fill="#ffd23f" ${o(3)}/>
    <path d="M100 44l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z" fill="#fff6c9" ${o(3)}/>
    ${shine('M66 34h16q-4 36 10 64-26-14-26-44z', 0.45)}
    ${sparkle(176, 120, 14, '#fff')}${sparkle(26, 132, 10, '#ffd23f')}`,

  sword: `
    <path d="M100 18c-30 6-56 6-62 4 2 44 18 98 62 120 44-22 60-76 62-120-6 2-32 2-62-4z" fill="#3a5bd9" ${o(7)}/>
    <path d="M100 30c-22 4-40 6-50 4 4 36 18 78 50 96z" fill="#5f7ff0"/>
    <g transform="rotate(35 100 100)">
      <path d="M92 4h16l4 120H88z" fill="#e6f2ff" ${o(6)}/>
      <path d="M100 8v112" stroke="#9cc3ff" stroke-width="4"/>
      <rect x="62" y="122" width="76" height="14" rx="7" fill="#ffc93c" ${o(6)}/>
      <rect x="92" y="136" width="16" height="36" rx="4" fill="#7b4b2a" ${o(6)}/>
      <circle cx="100" cy="180" r="10" fill="#ffc93c" ${o(5)}/>
    </g>
    ${txt(100, 184, 30, '#fff', 'CARREGA', -4)}`,

  pentakill: `
    <path d="M110 8L52 104h40l-18 88 76-112h-44l26-72z" fill="#ffd23f" ${o(7)}/>
    ${txt(100, 92, 50, '#b04bff', 'PENTA', -8, 1)}
    ${txt(100, 150, 58, '#ff3b4e', 'KILL', -8, 2)}
    ${sparkle(170, 30, 12)}${sparkle(30, 176, 10, '#ffd23f')}`,

  dragon: `
    <path d="M40 60l-18-40 42 22M160 60l18-40-42 22" fill="#ffb703" ${o(6)}/>
    <path d="M100 30c44 0 70 30 70 70 0 20-6 34-18 44l8 30-36-16c-8 2-16 2-24 2-44 0-70-26-70-60s26-70 70-70z" fill="#4cc96a" ${o(7)}/>
    <path d="M60 128c16 14 50 18 80 4" fill="none" ${o(5)}/>
    <ellipse cx="74" cy="88" rx="17" ry="20" fill="#fff" ${o(5)}/><ellipse cx="126" cy="88" rx="17" ry="20" fill="#fff" ${o(5)}/>
    <ellipse cx="78" cy="92" rx="8" ry="11" fill="${INK}"/><ellipse cx="122" cy="92" rx="8" ry="11" fill="${INK}"/>
    <circle cx="81" cy="87" r="3" fill="#fff"/><circle cx="125" cy="87" r="3" fill="#fff"/>
    <circle cx="90" cy="118" r="4" fill="${INK}"/><circle cx="110" cy="118" r="4" fill="${INK}"/>
    <path d="M86 36l6 14 8-16 8 16 6-14" fill="#ffb703" ${o(4)}/>
    <path d="M150 150c16 6 30 2 40-8-4 18-18 30-36 30" fill="#ff7a1a" ${o(5)}/>
    ${shine('M60 52c12-12 26-16 40-16-18 6-30 14-36 28z', 0.45)}`,

  bombsite: `
    <path d="M100 196c-8-26-70-70-70-120a70 70 0 0 1 140 0c0 50-62 94-70 120z" fill="#ff3b4e" ${o(8)}/>
    <circle cx="100" cy="78" r="48" fill="#fff" ${o(6)}/>
    ${txt(100, 104, 72, '#ff3b4e', 'A')}
    ${shine('M44 60c6-24 26-40 48-42-22 10-36 24-42 46z', 0.5)}`,

  crosshair: `
    <circle cx="100" cy="100" r="86" fill="#1c1f2b" ${o(7)}/>
    <path d="M100 36v40M100 124v40M36 100h40M124 100h40" stroke="#2bff88" stroke-width="12" stroke-linecap="round"/>
    <path d="M100 36v40M100 124v40M36 100h40M124 100h40" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.35"/>
    <circle cx="100" cy="100" r="7" fill="#2bff88"/>
    ${shine('M44 70c10-20 30-32 50-34-22 8-36 22-44 40z', 0.25)}
    ${txt(100, 192, 34, '#2bff88', 'AIM', 0, 4)}`,

  controller: `
    <path d="M52 56h96c26 0 40 30 44 70 3 30-24 42-38 22l-16-22H62l-16 22c-14 20-41 8-38-22 4-40 18-70 44-70z" fill="#7c5cff" ${o(7)}/>
    <path d="M56 90h28M70 76v28" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>
    <circle cx="134" cy="80" r="9" fill="#3ddc84" ${o(4)}/><circle cx="152" cy="98" r="9" fill="#ff3b4e" ${o(4)}/>
    <circle cx="116" cy="98" r="9" fill="#5ad1ff" ${o(4)}/><circle cx="134" cy="116" r="9" fill="#ffd23f" ${o(4)}/>
    ${shine('M58 64h60q-50 4-62 22z', 0.45)}
    ${txt(100, 186, 30, '#fff', 'GAMER', -3, 2)}`,

  ez: `
    <circle cx="100" cy="92" r="78" fill="#ffd23f" ${o(7)}/>
    <path d="M30 76h140v10c-4 0-6 4-8 10-4 14-12 20-28 20s-22-10-26-24h-16c-4 14-10 24-26 24s-24-6-28-20c-2-6-4-10-8-10z" fill="${INK}"/>
    ${shine('M50 82c2-6 10-8 18-6-8 4-12 8-14 14z', 0.8)}${shine('M114 82c2-6 10-8 18-6-8 4-12 8-14 14z', 0.8)}
    <path d="M66 132q34 22 70-6" fill="none" ${o(8)}/>
    ${txt(100, 194, 50, '#fff', 'EZ', -8, 4)}`,

  onfire: `
    <path d="M100 16c6 20 30 26 34 50 10-10 12-20 10-32 22 18 36 44 36 74 0 46-36 80-80 80S20 154 20 108c0-26 12-44 28-58 0 14 4 22 12 28 0-30 22-46 40-62z" fill="#ff5a1f" ${o(7)}/>
    <path d="M100 176c-30 0-50-20-50-46 0-14 6-26 14-34 2 10 6 16 12 20 2-22 12-36 24-46 4 14 16 22 20 36 6-6 8-12 8-20 12 10 22 26 22 44 0 26-20 46-50 46z" fill="#ffd23f"/>
    <path d="M100 160c-14-10-30-22-30-38 0-10 8-16 16-16 6 0 10 4 14 8 4-4 8-8 14-8 8 0 16 6 16 16 0 16-16 28-30 38z" fill="#ff3b4e" ${o(5)}/>
    ${txt(100, 196, 34, '#fff', 'ON FIRE', -4, 1)}`,

  knife: `
    <defs><linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4fa3"/><stop offset="0.5" stop-color="#a77bff"/><stop offset="1" stop-color="#ffd23f"/>
    </linearGradient></defs>
    <path d="M86 112c-30-6-60-30-66-74 0-6 6-8 10-4 20 30 52 46 84 50z" fill="url(#fade)" ${o(7)}/>
    ${shine('M34 44c18 24 40 36 64 42-26 2-50-14-64-42z', 0.5)}
    <path d="M86 112l28-28 40 40c8 8 8 20 0 28s-20 8-28 0z" fill="#2a2a35" ${o(7)}/>
    <path d="M118 108l24 24M108 118l24 24" stroke="#4b4b5c" stroke-width="5"/>
    <circle cx="160" cy="166" r="20" fill="none" ${o(14)}/><circle cx="160" cy="166" r="20" fill="none" stroke="#c9d1d9" stroke-width="6"/>
    ${sparkle(150, 40, 16, '#fff')}${sparkle(60, 160, 10, '#ff4fa3')}`,

  energy: `
    <path d="M58 32c0-10 84-10 84 0v138c0 12-84 12-84 0z" fill="#16c47f" ${o(7)}/>
    <ellipse cx="100" cy="32" rx="42" ry="10" fill="#c9d1d9" ${o(6)}/>
    <path d="M90 30h20" ${o(5)}/>
    <path d="M110 62l-30 50h20l-10 46 34-58h-22l12-38z" fill="#ffd23f" ${o(6)}/>
    ${shine('M66 46h10v114h-10z', 0.4)}
    ${txt(100, 196, 30, '#fff', '+1 FPS', -4)}`,

  noob: `
    <rect x="70" y="10" width="60" height="26" rx="10" fill="#ff8cc6" ${o(6)}/>
    <path d="M86 36h28l2 14H84z" fill="#ffd6e7" ${o(5)}/>
    <path d="M60 64c0-10 8-14 20-14h40c12 0 20 4 20 14v92c0 16-10 24-24 24H84c-14 0-24-8-24-24z" fill="#e8f6ff" ${o(7)}/>
    <path d="M60 100h80v56c0 16-10 24-24 24H84c-14 0-24-8-24-24z" fill="#fff" ${o(0)}/>
    <path d="M76 80h18M76 100h18M76 120h18" ${o(4)}/>
    ${shine('M118 64h10v90h-10z', 0.5)}
    ${txt(100, 160, 42, '#ff4fa3', 'NOOB', -10, 1)}`,

  smoke: `
    <circle cx="62" cy="116" r="40" fill="#d6dbe3" ${o(7)}/><circle cx="138" cy="112" r="44" fill="#d6dbe3" ${o(7)}/>
    <circle cx="100" cy="80" r="50" fill="#e9edf3" ${o(7)}/><circle cx="100" cy="134" r="40" fill="#e9edf3" ${o(7)}/>
    <path d="M38 110c10 20 50 40 124 6" fill="none" stroke="#e9edf3" stroke-width="18"/>
    ${shine('M70 60c10-14 26-20 40-18-16 6-28 16-32 30z', 0.9)}
    <rect x="126" y="140" width="40" height="52" rx="8" fill="#7d8691" ${o(6)} transform="rotate(18 146 166)"/>
    <rect x="126" y="140" width="40" height="12" fill="#ff3b4e" ${o(4)} transform="rotate(18 146 166)"/>
    ${txt(78, 130, 34, '#7d8691', 'SMOKE', -6)}`,
};

export const STICKER_NAMES: Record<PresetSticker, string> = {
  headshot: 'Headshot',
  gg: 'GG',
  ace: 'Ace',
  clutch: 'Clutch',
  sniper: 'Sniper',
  grenade: 'Granada',
  bomb: 'Bomba plantada',
  rushb: 'Rush B',
  mvp: 'MVP',
  trophy: 'Troféu',
  sword: 'Espada e escudo',
  pentakill: 'Pentakill',
  dragon: 'Dragão',
  bombsite: 'Bombsite A',
  crosshair: 'Mira',
  controller: 'Controle',
  ez: 'EZ',
  onfire: 'On fire',
  knife: 'Faca fade',
  energy: 'Energético',
  noob: 'Noob',
  smoke: 'Smoke',
};

const cache = new Map<string, string>();

/** URL (data:) do SVG do sticker pronto. */
export function presetStickerUrl(id: string): string | null {
  const art = ART[id as PresetSticker];
  if (!art) return null;
  let url = cache.get(id);
  if (!url) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${art}</svg>`;
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(id, url);
  }
  return url;
}
