// Desenho em pixel art da Praça: tudo é feito em "pixels nativos" num canvas pequeno, que depois é ampliado
// sem suavizar. Os polígonos são preenchidos linha a linha com fillRect, para as bordas saírem duras (o fill
// normal do canvas borra a borda, e ampliado isso vira um degradê feio).
import {
  CLOTH_COLORS,
  FLOORS,
  HAIR_COLORS,
  ITEM_COLORS,
  SKIN_TONES,
  WALLS,
  footprint,
  type Facing,
  type Furniture,
  type PlazaAvatar,
  type PlazaLayout,
  type Point,
  type Scene,
} from '../../../../shared/plaza.ts';

export const TW = 32;
export const TH = 16;

/** Canto de cima da casa (x, y) na tela, em pixels nativos (antes do deslocamento da câmera). */
export const iso = (x: number, y: number) => ({ x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) });

/** Casa debaixo de um ponto da tela (o inverso de iso). */
export function tileAt(px: number, py: number) {
  const a = px / (TW / 2);
  const b = py / (TH / 2);
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };

export const PAL = {
  night: '#231a3a',
  edgeL: '#3d3166',
  edgeR: '#2d2450',
  edgeLine: '#54468a',
  tileA: '#7c86d6',
  tileB: '#6670c4',
  tileLine: '#9aa3ea',
  tileDot: '#e9ecff',
  outline: '#1b1430',
  wood: '#a87454',
  woodTop: '#c99069',
  woodDark: '#6e4834',
  coral: '#e8685a',
  coralDark: '#b9473d',
  cream: '#f3e7cf',
  warm: '#ffe6a0',
  window: '#ffd77a',
  windowDark: '#c9953f',
  wall: '#7d70b8',
  wallDark: '#5f5399',
  wallTop: '#4a3f7d',
  roof: '#3a3166',
  metal: '#4b4470',
  metalLight: '#77709e',
  screen: '#141127',
  leaf: '#3f8f6a',
  leafLight: '#5cb889',
  leafDark: '#2b6a4f',
  pot: '#c0714f',
};

/** Preenche um polígono com linhas inteiras (borda dura, sem anti-aliasing). */
export function fillPoly(ctx: Ctx, pts: Pt[], color: string) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  ctx.fillStyle = color;
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.round(xs[i]);
      const x1 = Math.round(xs[i + 1]);
      if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
    }
  }
}

export function fillEllipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

/** Ponto da tela para uma posição no mapa (casas, podendo ser fracionária) a uma altura z (pixels). */
export const at = (x: number, y: number, z = 0): Pt => {
  const p = iso(x, y);
  return { x: p.x, y: p.y - z };
};

interface BoxColors {
  top: string;
  left: string;
  right: string;
}

/**
 * Caixa isométrica a partir da casa (x, y), com `a` casas ao longo de x e `b` ao longo de y, da altura z0 até
 * z0 + h. Devolve os cantos para desenhar detalhes nas faces.
 */
export function box(ctx: Ctx, x: number, y: number, a: number, b: number, z0: number, h: number, c: BoxColors) {
  const z1 = z0 + h;
  const L0 = at(x, y + b, z0);
  const C0 = at(x + a, y + b, z0);
  const R0 = at(x + a, y, z0);
  const L1 = at(x, y + b, z1);
  const C1 = at(x + a, y + b, z1);
  const R1 = at(x + a, y, z1);
  const T1 = at(x, y, z1);
  if (h > 0) {
    fillPoly(ctx, [L0, C0, C1, L1], c.left);
    fillPoly(ctx, [C0, R0, R1, C1], c.right);
  }
  fillPoly(ctx, [T1, R1, C1, L1], c.top);
}

// ---- chão ----

function floorTile(ctx: Ctx, x: number, y: number, a = PAL.tileA, b = PAL.tileB) {
  const p = iso(x, y);
  const even = (x + y) % 2 === 0;
  fillPoly(ctx, [p, { x: p.x + 16, y: p.y + 8 }, { x: p.x, y: p.y + 16 }, { x: p.x - 16, y: p.y + 8 }], even ? a : b);
  // o desenho do azulejo: uma flor de quatro pontas no meio e as quinas claras
  const cx = p.x;
  const cy = p.y + 8;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillRect(cx - 4, cy, 8, 1);
  ctx.fillRect(cx - 1, cy - 2, 2, 5);
  ctx.fillStyle = PAL.tileDot;
  ctx.fillRect(cx - 1, cy, 2, 1);
  if (even) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(p.x - 1, p.y + 1, 2, 1);
  }
}

function platformEdge(ctx: Ctx, layout: PlazaLayout, indoor = false) {
  const depth = indoor ? 8 : 10;
  const { w, h } = layout;
  // frente esquerda (ao longo de y, em x = 0) e frente direita (ao longo de x, em y = h)
  const a = at(0, h);
  const b = at(w, h);
  const c = at(w, 0);
  fillPoly(ctx, [at(0, 0), a, { x: a.x, y: a.y + depth }, { x: at(0, 0).x, y: at(0, 0).y + depth }], PAL.edgeL);
  fillPoly(ctx, [a, b, { x: b.x, y: b.y + depth }, { x: a.x, y: a.y + depth }], PAL.edgeL);
  fillPoly(ctx, [b, c, { x: c.x, y: c.y + depth }, { x: b.x, y: b.y + depth }], PAL.edgeR);
  // tijolinhos na borda
  ctx.fillStyle = PAL.edgeLine;
  for (let i = 0; i < w; i++) {
    const p = at(i, h);
    ctx.fillRect(Math.round(p.x) + 6, Math.round(p.y) + 5, 1, 4);
  }
  for (let i = 0; i < h; i++) {
    const p = at(w, i);
    ctx.fillRect(Math.round(p.x) - 7, Math.round(p.y) + 5, 1, 4);
  }
}

// ---- prédio do servidor ----

function building(ctx: Ctx, layout: PlazaLayout, accent: string) {
  const { x0, x1 } = layout.building;
  const a = x1 - x0 + 1;
  const b = 3;
  const H = 62;
  // calçada do prédio
  box(ctx, x0 - 0.2, -0.2, a + 0.4, b + 0.4, 0, 2, { top: '#8a80c4', left: '#5d528f', right: '#4a4177' });
  box(ctx, x0, 0, a, b, 2, H, { top: PAL.wallTop, left: PAL.wall, right: PAL.wallDark });
  // platibanda e telhado
  box(ctx, x0 - 0.1, -0.1, a + 0.2, b + 0.2, H + 2, 5, { top: PAL.roof, left: '#5a4f94', right: '#463c7a' });
  box(ctx, x0 + 1, 0.6, 2, 1.2, H + 7, 6, { top: '#625a92', left: '#4c4478', right: '#3c355f' });
  // ponto na fachada (face da frente, y = b): u ao longo de x, z altura
  const f = (u: number, z: number) => at(x0 + u, b, z + 2);
  const quad = (u0: number, u1: number, z0: number, z1: number, color: string) => fillPoly(ctx, [f(u0, z0), f(u1, z0), f(u1, z1), f(u0, z1)], color);
  // linha entre os andares
  quad(0, a, 30, 32, PAL.wallDark);
  // janelas do segundo andar
  for (let u = 0.6; u + 1 <= a - 0.4; u += 1.5) {
    quad(u, u + 0.9, 37, 52, PAL.windowDark);
    quad(u + 0.08, u + 0.82, 38, 51, PAL.window);
    quad(u + 0.44, u + 0.48, 38, 51, PAL.windowDark);
  }
  // vitrine e porta no térreo
  const door = layout.door.x - x0;
  quad(door, door + 1, 0, 22, '#3a2f5c');
  quad(door + 0.1, door + 0.9, 0, 20, '#f6c768');
  quad(door + 0.48, door + 0.52, 0, 20, '#c9953f');
  for (const u0 of [0.4, door + 1.4]) {
    const u1 = Math.min(u0 + door - 0.9, a - 0.4);
    if (u1 - u0 < 0.6) continue;
    quad(u0, u1, 3, 20, PAL.windowDark);
    quad(u0 + 0.08, u1 - 0.08, 4, 19, PAL.window);
  }
  // toldo listrado (coral e creme) por cima do térreo
  const stripes = Math.round(a * 2);
  for (let i = 0; i < stripes; i++) {
    const u0 = (i / stripes) * a;
    const u1 = ((i + 1) / stripes) * a;
    const color = i % 2 ? PAL.cream : accent;
    fillPoly(ctx, [f(u0, 27), f(u1, 27), { x: f(u1, 22).x - 3, y: f(u1, 22).y + 2 }, { x: f(u0, 22).x - 3, y: f(u0, 22).y + 2 }], color);
  }
  // placa (o nome do servidor vai por cima, em HTML)
  quad(a / 2 - 2, a / 2 + 2, 54, 61, PAL.outline);
  quad(a / 2 - 1.95, a / 2 + 1.95, 55, 60, '#2b2350');
}

// ---- objetos ----

function lampPost(ctx: Ctx, x: number, y: number, t: number) {
  const base = at(x + 0.5, y + 0.5);
  const bx = Math.round(base.x);
  const by = Math.round(base.y);
  fillEllipse(ctx, bx, by, 5, 2.5, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(bx - 2, by - 4, 5, 4);
  ctx.fillStyle = PAL.metal;
  ctx.fillRect(bx - 1, by - 46, 2, 44);
  ctx.fillStyle = PAL.metalLight;
  ctx.fillRect(bx - 1, by - 46, 1, 44);
  // braço e luminária
  ctx.fillStyle = PAL.metal;
  ctx.fillRect(bx - 1, by - 47, 8, 2);
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(bx + 3, by - 46, 7, 3);
  const flicker = 0.85 + 0.15 * Math.sin(t / 900 + x * 3);
  ctx.fillStyle = `rgba(255, 230, 160, ${flicker})`;
  ctx.fillRect(bx + 4, by - 43, 5, 2);
}

/** Luz do poste no chão (desenhada antes dos objetos, somando cor). */
export function lampLight(ctx: Ctx, x: number, y: number) {
  const base = at(x + 0.5, y + 0.5);
  const cx = base.x + 7;
  const cy = base.y + 4;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 58);
  g.addColorStop(0, 'rgba(255, 214, 140, 0.32)');
  g.addColorStop(1, 'rgba(255, 214, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-58, -58, 116, 116);
  ctx.restore();
  // o cone de luz no ar
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const top = { x: base.x + 6.5, y: base.y - 42 };
  const g2 = ctx.createLinearGradient(0, top.y, 0, cy);
  g2.addColorStop(0, 'rgba(255, 226, 160, 0.22)');
  g2.addColorStop(1, 'rgba(255, 226, 160, 0)');
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.moveTo(top.x - 3, top.y);
  ctx.lineTo(top.x + 3, top.y);
  ctx.lineTo(cx + 26, cy);
  ctx.lineTo(cx - 26, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function plant(ctx: Ctx, x: number, y: number) {
  box(ctx, x + 0.22, y + 0.22, 0.56, 0.56, 0, 8, { top: '#5a3a2a', left: PAL.pot, right: '#9b5a3f' });
  const c = at(x + 0.5, y + 0.5, 8);
  fillEllipse(ctx, c.x, c.y - 9, 10, 10, PAL.leafDark);
  fillEllipse(ctx, c.x - 2, c.y - 11, 8, 8, PAL.leaf);
  fillEllipse(ctx, c.x - 4, c.y - 14, 4, 4, PAL.leafLight);
  fillEllipse(ctx, c.x + 4, c.y - 6, 3, 3, PAL.leafLight);
}

function bench(ctx: Ctx, x: number, y: number) {
  box(ctx, x + 0.15, y + 0.1, 0.7, 0.8, 0, 7, { top: PAL.woodTop, left: PAL.wood, right: PAL.woodDark });
  box(ctx, x + 0.15, y + 0.1, 0.15, 0.8, 7, 8, { top: PAL.woodTop, left: PAL.wood, right: PAL.woodDark });
}

function stool(ctx: Ctx, x: number, y: number, color: string) {
  const c = at(x + 0.5, y + 0.5);
  fillEllipse(ctx, c.x, c.y, 6, 3, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 6, 2, 6);
  fillEllipse(ctx, c.x, c.y - 6, 7, 3.5, PAL.coralDark);
  fillEllipse(ctx, c.x, c.y - 7, 7, 3.5, color);
}

function table(ctx: Ctx, x: number, y: number, locked: boolean, accent: string) {
  const c = at(x + 1, y + 1);
  fillEllipse(ctx, c.x, c.y + 1, 22, 11, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 12, 4, 12);
  fillEllipse(ctx, c.x, c.y - 12, 25, 12.5, PAL.woodDark);
  fillEllipse(ctx, c.x, c.y - 14, 25, 12.5, locked ? '#7d6f7a' : PAL.woodTop);
  fillEllipse(ctx, c.x, c.y - 14, 16, 8, locked ? '#8a7c87' : '#d29a72');
  // centro de mesa com a cor do destaque
  fillEllipse(ctx, c.x, c.y - 15, 4, 2, accent);
  if (locked) {
    // cadeado em cima da mesa
    const lx = Math.round(c.x);
    const ly = Math.round(c.y) - 26;
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(lx - 4, ly + 4, 9, 7);
    ctx.fillRect(lx - 3, ly, 2, 5);
    ctx.fillRect(lx + 2, ly, 2, 5);
    ctx.fillRect(lx - 2, ly - 1, 5, 2);
    ctx.fillStyle = '#f5c451';
    ctx.fillRect(lx - 3, ly + 5, 7, 5);
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(lx, ly + 6, 1, 2);
  }
}

function tv(ctx: Ctx, x: number, y: number, live: boolean, t: number) {
  // pé
  box(ctx, x + 0.85, y + 0.35, 0.3, 0.3, 0, 12, { top: PAL.metal, left: PAL.metalLight, right: PAL.metal });
  box(ctx, x + 0.5, y + 0.2, 1, 0.6, 0, 2, { top: PAL.metalLight, left: PAL.metal, right: '#3a3460' });
  // tela: a face da frente olha para a mesa (+y)
  box(ctx, x + 0.05, y + 0.4, 1.9, 0.22, 12, 22, { top: '#2a2546', left: '#2a2546', right: '#1f1b38' });
  const f = (u: number, z: number) => at(x + 0.05 + u, y + 0.62, 12 + z);
  const quad = (u0: number, u1: number, z0: number, z1: number, color: string) => fillPoly(ctx, [f(u0, z0), f(u1, z0), f(u1, z1), f(u0, z1)], color);
  if (!live) {
    quad(0.1, 1.8, 2, 20, PAL.screen);
    quad(0.2, 0.5, 15, 18, 'rgba(255,255,255,0.07)');
    return;
  }
  // ao vivo: uma "imagem" que mexe (faixas coloridas descendo) e a bolinha vermelha piscando
  const phase = (t / 140) % 18;
  const colors = ['#2f62e6', '#4f7dff', '#8b5cf6', '#e8685a', '#3fb8c9', '#2e9e6a'];
  for (let i = 0; i < 6; i++) {
    const z0 = 2 + ((i * 3 + phase) % 18);
    quad(0.1, 1.8, z0, Math.min(20, z0 + 3), colors[i]);
  }
  quad(0.1, 1.8, 17, 20, 'rgba(10,8,25,0.55)');
  if (Math.floor(t / 500) % 2 === 0) quad(0.18, 0.32, 17.5, 19.5, '#ff4d5e');
  // brilho da tela no chão
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = at(x + 1, y + 1.4);
  ctx.translate(g.x, g.y);
  ctx.scale(1, 0.5);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
  grad.addColorStop(0, 'rgba(110, 150, 255, 0.28)');
  grad.addColorStop(1, 'rgba(110, 150, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-34, -34, 68, 68);
  ctx.restore();
}

function portal(ctx: Ctx, x: number, y: number, t: number) {
  const c = at(x + 0.5, y + 0.5);
  const pulse = 0.5 + 0.5 * Math.sin(t / 600);
  fillEllipse(ctx, c.x, c.y, 15, 7.5, '#2f62e6');
  fillEllipse(ctx, c.x, c.y, 12, 6, '#e9ecff');
  fillEllipse(ctx, c.x, c.y, 9, 4.5, PAL.coral);
  fillEllipse(ctx, c.x, c.y, 6, 3, '#e9ecff');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(c.x, c.y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
  g.addColorStop(0, `rgba(120, 160, 255, ${0.18 + pulse * 0.15})`);
  g.addColorStop(1, 'rgba(120, 160, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-30, -30, 60, 60);
  ctx.restore();
}

// ---- estabelecimento (por dentro) ----

function woodTile(ctx: Ctx, x: number, y: number, a = '#9a6a4f', b = '#8c5f46') {
  const p = iso(x, y);
  const even = (x + y) % 2 === 0;
  fillPoly(ctx, [p, { x: p.x + 16, y: p.y + 8 }, { x: p.x, y: p.y + 16 }, { x: p.x - 16, y: p.y + 8 }], even ? a : b);
  // tábuas: linhas ao longo de x
  ctx.fillStyle = 'rgba(60, 34, 22, 0.35)';
  for (const k of [0.33, 0.66]) {
    const a = at(x, y + k);
    const b = at(x + 1, y + k);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), 1, 1);
    }
  }
  if ((x * 3 + y * 5) % 7 === 0) {
    ctx.fillStyle = 'rgba(255, 220, 170, 0.12)';
    ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) + 6, 6, 1);
  }
}

function interiorWalls(ctx: Ctx, layout: PlazaLayout, accent: string) {
  const H = 64;
  const { w, h } = layout;
  // parede esquerda (x = 0, olhando para +x) e parede do fundo (y = 0, olhando para +y)
  const colors = WALLS[layout.wall] ?? WALLS[0];
  fillPoly(ctx, [at(0, h), at(0, 0), at(0, 0, H), at(0, h, H)], colors.left);
  fillPoly(ctx, [at(0, 0), at(w, 0), at(w, 0, H), at(0, 0, H)], colors.back);
  // faixa de azulejo na parte de baixo das paredes
  fillPoly(ctx, [at(0, h), at(0, 0), at(0, 0, 14), at(0, h, 14)], '#3f6fd9');
  fillPoly(ctx, [at(0, 0), at(w, 0), at(w, 0, 14), at(0, 0, 14)], '#4a7ae6');
  ctx.fillStyle = '#e9ecff';
  for (let i = 0; i < h; i++) {
    const p = at(0, i + 0.5, 7);
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
  }
  for (let i = 0; i < w; i++) {
    const p = at(i + 0.5, 0, 7);
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
  }
  fillPoly(ctx, [at(0, h, 14), at(0, 0, 14), at(0, 0, 16), at(0, h, 16)], PAL.outline);
  fillPoly(ctx, [at(0, 0, 14), at(w, 0, 14), at(w, 0, 16), at(0, 0, 16)], PAL.outline);
  // topo das paredes
  fillPoly(ctx, [at(0, h, H), at(0, 0, H), at(-0.25, -0.25, H), at(-0.25, h, H)], '#2d2450');
  fillPoly(ctx, [at(0, 0, H), at(w, 0, H), at(w, -0.25, H), at(-0.25, -0.25, H)], '#2d2450');
  // janelas na parede esquerda, com a noite lá fora
  const ql = (a: number, b: number, z0: number, z1: number, c: string) => fillPoly(ctx, [at(0, a, z0), at(0, b, z0), at(0, b, z1), at(0, a, z1)], c);
  for (let y0 = 2; y0 + 2 < h - 1; y0 += 4) {
    ql(y0, y0 + 2, 24, 52, PAL.outline);
    ql(y0 + 0.1, y0 + 1.9, 25, 51, '#1d1838');
    ql(y0 + 0.1, y0 + 1.9, 25, 30, '#2a2350');
    ql(y0 + 0.95, y0 + 1.05, 25, 51, PAL.outline);
    const star = at(0, y0 + 0.5, 44);
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(star.x), Math.round(star.y), 1, 1);
  }
  // quadros na parede do fundo, longe do balcão
  const { x0, x1 } = layout.building;
  const qb = (a: number, b: number, z0: number, z1: number, c: string) => fillPoly(ctx, [at(a, 0, z0), at(b, 0, z0), at(b, 0, z1), at(a, 0, z1)], c);
  for (const u of layout.kind === 'hall' ? [] : [1.5, x1 + 2.5]) {
    if (u + 1.6 > w || (u > x0 - 2 && u < x1 + 1)) continue;
    qb(u, u + 1.6, 28, 48, PAL.outline);
    qb(u + 0.1, u + 1.5, 29, 47, u < x0 ? accent : '#3fb8c9');
    qb(u + 0.3, u + 1.3, 33, 40, '#f3e7cf');
  }
}

/** Balcão no fundo, com prateleiras e garrafas; o letreiro em neon com o nome vai por cima, em HTML. */
function counter(ctx: Ctx, layout: PlazaLayout, accent: string) {
  const { x0, x1 } = layout.building;
  const a = x1 - x0 + 1;
  const colors = ['#3fb8c9', '#f5c451', '#e8685a', '#2e9e6a', '#8b5cf6', '#ececec'];
  for (const z of [26, 38]) {
    fillPoly(ctx, [at(x0, 0, z), at(x0 + a, 0, z), at(x0 + a, 0.25, z), at(x0, 0.25, z)], '#4a2f22');
    for (let i = 0; i < a * 3; i++) {
      const p = at(x0 + 0.2 + i / 3, 0.1, z);
      ctx.fillStyle = colors[(i * 7 + z) % colors.length];
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 7, 2, 7);
      ctx.fillRect(Math.round(p.x), Math.round(p.y) - 9, 1, 2);
    }
  }
  box(ctx, x0, 1.2, a, 1.3, 0, 18, { top: '#c99069', left: '#7a4a33', right: '#5e3826' });
  box(ctx, x0 - 0.05, 1.15, a + 0.1, 1.4, 18, 2, { top: '#e0a77c', left: '#9a6143', right: '#7a4a33' });
  const f = (u: number, z: number) => at(x0 + u, 2.5, z);
  for (let u = 0.5; u < a; u += 1) fillPoly(ctx, [f(u, 3), f(u + 0.5, 3), f(u + 0.5, 15), f(u, 15)], '#6b3f2b');
  fillPoly(ctx, [f(0, 15), f(a, 15), f(a, 17), f(0, 17)], accent);
  for (let u = 1; u < a; u += 2.5) {
    const p = at(x0 + u, 1.8, 20);
    ctx.fillStyle = 'rgba(220, 235, 255, 0.85)';
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 4, 3, 4);
  }
}

/** Porta do elevador na parede do fundo, em cima da casa (x, y), com o andar no visor. */
function elevator(ctx: Ctx, x: number, y: number, level: number) {
  const q = (u0: number, u1: number, z0: number, z1: number, c: string) => fillPoly(ctx, [at(x + u0, y, z0), at(x + u1, y, z0), at(x + u1, y, z1), at(x + u0, y, z1)], c);
  q(-0.15, 1.15, 0, 46, PAL.outline);
  q(-0.08, 1.08, 0, 44, '#77709e');
  q(0.02, 0.48, 0, 38, '#b9b5cc');
  q(0.52, 0.98, 0, 38, '#a9a5c0');
  q(0.48, 0.52, 0, 38, PAL.outline);
  // visor com setas e o andar
  q(0.2, 0.8, 39, 43.5, '#141127');
  const v = at(x + 0.5, y, 41.5);
  ctx.fillStyle = '#ff9d4d';
  ctx.fillRect(Math.round(v.x) - 1, Math.round(v.y) - 1, 3, 2);
  void level;
  // capacho na frente
  const p = iso(x, y + 1);
  fillPoly(ctx, [{ x: p.x, y: p.y + 3 }, { x: p.x + 12, y: p.y + 8 }, { x: p.x, y: p.y + 13 }, { x: p.x - 12, y: p.y + 8 }], '#4b4470');
}

/** Porta de um quarto na parede do fundo do corredor (a sua tem a moldura na cor do servidor). */
function roomDoor(ctx: Ctx, x: number, y: number, frame: string) {
  const q = (u0: number, u1: number, z0: number, z1: number, c: string) => fillPoly(ctx, [at(x + u0, y, z0), at(x + u1, y, z0), at(x + u1, y, z1), at(x + u0, y, z1)], c);
  q(0.04, 0.96, 0, 45, PAL.outline);
  q(0.08, 0.92, 0, 43, frame);
  q(0.14, 0.86, 0, 40, '#8a5a3b');
  q(0.22, 0.78, 23, 36, '#9c6a48');
  q(0.22, 0.78, 5, 19, '#9c6a48');
  const k = at(x + 0.74, y, 20);
  ctx.fillStyle = '#f5c451';
  ctx.fillRect(Math.round(k.x) - 1, Math.round(k.y) - 1, 2, 2);
  const p = iso(x, y + 1);
  fillPoly(ctx, [{ x: p.x, y: p.y + 4 }, { x: p.x + 10, y: p.y + 8 }, { x: p.x, y: p.y + 12 }, { x: p.x - 10, y: p.y + 8 }], '#4b4470');
}

// ---- quarto ----

/** Escrivaninha com o computador, encostada na parede do fundo (2 casas a partir de x). Ligado, a tela rola código. */
function deskPC(ctx: Ctx, x: number, y: number, on: boolean, t: number) {
  const wood = { top: '#c99069', left: '#9a6143', right: '#7a4a33' };
  for (const [u, v] of [
    [0.2, 0.2],
    [1.7, 0.2],
    [0.2, 0.75],
    [1.7, 0.75],
  ])
    box(ctx, x + u, y + v, 0.1, 0.1, 0, 14, { top: '#6e4834', left: '#6e4834', right: '#5a3a2a' });
  box(ctx, x + 0.1, y + 0.1, 1.8, 0.8, 14, 2, wood);
  // monitor (a tela olha para o quarto, +y)
  box(ctx, x + 0.9, y + 0.3, 0.2, 0.12, 16, 4, { top: PAL.metal, left: PAL.metalLight, right: PAL.metal });
  box(ctx, x + 0.35, y + 0.22, 1.3, 0.1, 19, 13, { top: '#2a2546', left: '#2a2546', right: '#1f1b38' });
  const f = (u: number, z: number) => at(x + 0.35 + u, y + 0.32, 19 + z);
  const quad = (u0: number, u1: number, z0: number, z1: number, c: string) => fillPoly(ctx, [f(u0, z0), f(u1, z0), f(u1, z1), f(u0, z1)], c);
  if (on) {
    quad(0.06, 1.24, 1, 12, '#15233a');
    const colors = ['#7ad18a', '#f5c451', '#8fb3ff', '#f08fb0'];
    const scroll = Math.floor(t / 450);
    for (let i = 0; i < 4; i++) {
      const n = (i + scroll) * 7;
      const len = 0.3 + ((n * 13) % 7) / 10;
      const indent = ((n * 5) % 3) * 0.1;
      quad(0.12 + indent, Math.min(1.18, 0.12 + indent + len), 9.5 - i * 2.3, 10.5 - i * 2.3, colors[n % colors.length]);
    }
  } else {
    quad(0.06, 1.24, 1, 12, PAL.screen);
  }
  // teclado e caneca
  box(ctx, x + 0.6, y + 0.58, 0.8, 0.22, 16, 0.8, { top: '#d9d6e6', left: '#a9a5c0', right: '#8e8aa3' });
  box(ctx, x + 1.6, y + 0.5, 0.16, 0.16, 16, 2.5, { top: '#e8685a', left: '#e8685a', right: '#b9473d' });
}

/** Rack baixo com a TV e o videogame (2 casas na parede do fundo). Ligada, a tela tem um joguinho rodando. */
function tvGame(ctx: Ctx, x: number, y: number, on: boolean, t: number) {
  box(ctx, x + 0.1, y + 0.15, 1.8, 0.65, 0, 9, { top: '#4a3f6b', left: '#3a3158', right: '#2d2648' });
  box(ctx, x + 1.35, y + 0.45, 0.4, 0.25, 9, 2, { top: '#ececec', left: '#c4c0d6', right: '#a9a5c0' });
  box(ctx, x + 0.2, y + 0.25, 1.6, 0.12, 9, 18, { top: '#2a2546', left: '#2a2546', right: '#1f1b38' });
  const f = (u: number, z: number) => at(x + 0.2 + u, y + 0.37, 9 + z);
  const quad = (u0: number, u1: number, z0: number, z1: number, c: string) => fillPoly(ctx, [f(u0, z0), f(u1, z0), f(u1, z1), f(u0, z1)], c);
  if (!on) return quad(0.06, 1.54, 1.5, 16.5, PAL.screen);
  // céu, chão andando e o bonequinho pulando os blocos
  quad(0.06, 1.54, 1.5, 16.5, '#4f7dff');
  quad(0.06, 1.54, 1.5, 5, '#2e9e6a');
  const run = (t / 90) % 15;
  for (let i = 0; i < 2; i++) {
    const u = 1.45 - (((run + i * 7.5) % 15) / 15) * 1.35;
    quad(u, u + 0.12, 5, 8, '#f5c451');
  }
  const jump = Math.max(0, Math.sin((t / 600) * Math.PI * 2)) * 5;
  quad(0.35, 0.47, 5 + jump, 9 + jump, '#e8685a');
}

/** Cadeira da escrivaninha (o assento em cx, cy). */
function deskChair(ctx: Ctx, cx: number, cy: number) {
  const c = at(cx, cy);
  fillEllipse(ctx, c.x, c.y + 1, 7, 3.5, 'rgba(0,0,0,0.25)');
  box(ctx, cx - 0.05, cy - 0.05, 0.1, 0.1, 0, 6, { top: PAL.metal, left: PAL.metalLight, right: PAL.metal });
  box(ctx, cx - 0.28, cy - 0.28, 0.56, 0.56, 6, 2, { top: '#e8685a', left: '#c9554a', right: '#a8443b' });
}

function pouf(ctx: Ctx, x: number, y: number) {
  const c = at(x + 0.5, y + 0.5);
  fillEllipse(ctx, c.x, c.y + 1, 9, 4.5, 'rgba(0,0,0,0.25)');
  box(ctx, x + 0.2, y + 0.2, 0.6, 0.6, 0, 6, { top: '#a77bf0', left: '#8b5cf6', right: '#6d43c9' });
}

/** Cama com a cabeceira na parede da esquerda (2 casas ao longo de x). Com alguém dormindo, a cabeça fica no travesseiro. */
function bed(ctx: Ctx, x: number, y: number, sleeper: PlazaAvatar | null, t: number) {
  const wood = { top: '#a87454', left: '#8a5a3b', right: '#6e4834' };
  box(ctx, x + 0.05, y + 0.1, 1.9, 0.8, 0, 6, wood);
  box(ctx, x + 0.05, y + 0.1, 0.15, 0.8, 0, 20, wood);
  box(ctx, x + 0.2, y + 0.14, 1.72, 0.72, 6, 3, { top: '#f3f0fa', left: '#d9d6e6', right: '#c4c0d6' });
  box(ctx, x + 0.26, y + 0.24, 0.42, 0.52, 9, 2, { top: '#ffffff', left: '#e9e6f2', right: '#d9d6e6' });
  if (sleeper) {
    const head = avatarSprite(sleeper, 0, 'stand');
    const p = at(x + 0.5, y + 0.5, 11);
    ctx.drawImage(head, 0, 0, SPRITE_W, 13, Math.round(p.x) - SPRITE_W / 2, Math.round(p.y) - 12, SPRITE_W, 13);
  }
  box(ctx, x + 0.66, y + 0.12, 1.28, 0.76, 9, sleeper ? 3.5 : 1.5, { top: '#5a7fd9', left: '#4a6cc4', right: '#3d5aa8' });
  if (sleeper) {
    const z = at(x + 0.6, y + 0.3, 30 + ((t / 90) % 10));
    ctx.fillStyle = `rgba(233, 236, 255, ${0.9 - ((t / 90) % 10) / 12})`;
    ctx.font = 'bold 7px monospace';
    ctx.fillText('z', Math.round(z.x), Math.round(z.y));
    ctx.fillText('z', Math.round(z.x) + 5, Math.round(z.y) - 6);
  }
}

/** O que o dono do quarto está fazendo (para acender o computador, a TV ou deitar na cama). */
export interface NookLook {
  desk: boolean;
  game: boolean;
  sleeper: PlazaAvatar | null;
}

function exitMat(ctx: Ctx, x: number, y: number) {
  const p = iso(x, y);
  fillPoly(ctx, [{ x: p.x, y: p.y + 2 }, { x: p.x + 13, y: p.y + 8 }, { x: p.x, y: p.y + 14 }, { x: p.x - 13, y: p.y + 8 }], '#2b2350');
  fillPoly(ctx, [{ x: p.x, y: p.y + 4 }, { x: p.x + 9, y: p.y + 8 }, { x: p.x, y: p.y + 12 }, { x: p.x - 9, y: p.y + 8 }], PAL.coral);
  ctx.fillStyle = '#ffe6a0';
  ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) + 5, 2, 4);
  ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) + 8, 6, 1);
  ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) + 9, 4, 1);
}

function doorMat(ctx: Ctx, x: number, y: number) {
  const p = iso(x, y);
  fillPoly(ctx, [{ x: p.x, y: p.y + 2 }, { x: p.x + 13, y: p.y + 8 }, { x: p.x, y: p.y + 14 }, { x: p.x - 13, y: p.y + 8 }], '#5a3a2a');
  fillPoly(ctx, [{ x: p.x, y: p.y + 4 }, { x: p.x + 9, y: p.y + 8 }, { x: p.x, y: p.y + 12 }, { x: p.x - 9, y: p.y + 8 }], '#c0714f');
}

function cafeTable(ctx: Ctx, x: number, y: number) {
  const c = at(x + 0.5, y + 0.5);
  fillEllipse(ctx, c.x, c.y, 9, 4.5, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = PAL.metal;
  ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 10, 2, 10);
  fillEllipse(ctx, c.x, c.y - 10, 10, 5, '#d8d2ea');
  fillEllipse(ctx, c.x, c.y - 11, 10, 5, '#f3f0fb');
  ctx.fillStyle = PAL.coral;
  ctx.fillRect(Math.round(c.x) + 1, Math.round(c.y) - 15, 3, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(Math.round(c.x) + 2, Math.round(c.y) - 18, 1, 2);
}

function floorLamp(ctx: Ctx, x: number, y: number, t: number) {
  const base = at(x + 0.5, y + 0.5);
  const bx = Math.round(base.x);
  const by = Math.round(base.y);
  fillEllipse(ctx, bx, by, 5, 2.5, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = PAL.metal;
  ctx.fillRect(bx - 1, by - 30, 2, 30);
  fillEllipse(ctx, bx, by - 1, 4, 2, PAL.outline);
  const flicker = 0.88 + 0.12 * Math.sin(t / 1100 + x * 2);
  fillPoly(ctx, [{ x: bx - 4, y: by - 38 }, { x: bx + 4, y: by - 38 }, { x: bx + 7, y: by - 29 }, { x: bx - 7, y: by - 29 }], `rgba(255, 220, 150, ${flicker})`);
  fillPoly(ctx, [{ x: bx - 4, y: by - 38 }, { x: bx + 4, y: by - 38 }, { x: bx + 4, y: by - 37 }, { x: bx - 4, y: by - 37 }], '#c9953f');
}

// ---- móveis do editor ----

const hexShade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};

function tree(ctx: Ctx, x: number, y: number) {
  const c = at(x + 0.5, y + 0.5);
  fillEllipse(ctx, c.x, c.y, 9, 4.5, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = '#6e4834';
  ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 16, 4, 16);
  fillEllipse(ctx, c.x, c.y - 26, 14, 13, PAL.leafDark);
  fillEllipse(ctx, c.x - 3, c.y - 30, 11, 10, PAL.leaf);
  fillEllipse(ctx, c.x + 4, c.y - 22, 7, 6, PAL.leaf);
  fillEllipse(ctx, c.x - 6, c.y - 34, 4, 4, PAL.leafLight);
  fillEllipse(ctx, c.x + 5, c.y - 30, 3, 3, PAL.leafLight);
}

function flowers(ctx: Ctx, x: number, y: number, color: string) {
  box(ctx, x + 0.1, y + 0.1, 0.8, 0.8, 0, 5, { top: '#4a3020', left: '#8a5a3c', right: '#6e4834' });
  const c = at(x + 0.5, y + 0.5, 5);
  fillEllipse(ctx, c.x, c.y - 3, 11, 5, PAL.leafDark);
  fillEllipse(ctx, c.x, c.y - 4, 9, 4, PAL.leaf);
  ctx.fillStyle = color;
  for (const [dx, dy] of [
    [-6, -4],
    [-2, -7],
    [3, -5],
    [6, -3],
    [0, -2],
    [-4, -1],
  ]) ctx.fillRect(Math.round(c.x) + dx, Math.round(c.y) + dy, 2, 2);
  ctx.fillStyle = '#f5c451';
  ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 5, 1, 1);
}

function sofa(ctx: Ctx, it: Furniture, color: string) {
  const w = it.r ? 1 : 2;
  const h = it.r ? 2 : 1;
  const dark = hexShade(color, -0.3);
  const mid = hexShade(color, -0.15);
  box(ctx, it.x + 0.1, it.y + 0.15, w - 0.2, h - 0.3, 0, 8, { top: color, left: mid, right: dark });
  // encosto atrás (no lado de y menor, ou de x menor girado) e braços
  if (it.r) box(ctx, it.x + 0.1, it.y + 0.15, 0.25, h - 0.3, 8, 9, { top: mid, left: mid, right: dark });
  else box(ctx, it.x + 0.1, it.y + 0.15, w - 0.2, 0.25, 8, 9, { top: mid, left: mid, right: dark });
  // almofadas
  const c1 = at(it.x + (it.r ? 0.55 : 0.55), it.y + (it.r ? 0.55 : 0.6), 8);
  const c2 = at(it.x + (it.r ? 0.55 : 1.45), it.y + (it.r ? 1.45 : 0.6), 8);
  fillEllipse(ctx, c1.x, c1.y, 6, 3, hexShade(color, 0.15));
  fillEllipse(ctx, c2.x, c2.y, 6, 3, hexShade(color, 0.15));
}

function rug(ctx: Ctx, it: Furniture, color: string) {
  const w = it.r ? 2 : 2;
  const h = 2;
  const pts = [at(it.x + 0.1, it.y + 0.1), at(it.x + w - 0.1, it.y + 0.1), at(it.x + w - 0.1, it.y + h - 0.1), at(it.x + 0.1, it.y + h - 0.1)];
  fillPoly(ctx, pts, hexShade(color, -0.25));
  const inner = [at(it.x + 0.3, it.y + 0.3), at(it.x + w - 0.3, it.y + 0.3), at(it.x + w - 0.3, it.y + h - 0.3), at(it.x + 0.3, it.y + h - 0.3)];
  fillPoly(ctx, inner, color);
  const core = [at(it.x + 0.75, it.y + 0.75), at(it.x + w - 0.75, it.y + 0.75), at(it.x + w - 0.75, it.y + h - 0.75), at(it.x + 0.75, it.y + h - 0.75)];
  fillPoly(ctx, core, hexShade(color, 0.3));
}

function shelf(ctx: Ctx, x: number, y: number) {
  box(ctx, x + 0.1, y + 0.3, 0.8, 0.4, 0, 34, { top: '#6e4834', left: '#8a5a3c', right: '#5e3826' });
  const f = (u: number, z: number) => at(x + 0.1 + u, y + 0.7, z);
  const colors = ['#e8685a', '#2f62e6', '#f5c451', '#2e9e6a', '#8b5cf6', '#ececec'];
  for (const [row, z] of [
    [0, 4],
    [1, 15],
    [2, 26],
  ]) {
    fillPoly(ctx, [f(0.05, z - 1), f(0.75, z - 1), f(0.75, z), f(0.05, z)], '#4a2f22');
    for (let i = 0; i < 5; i++) {
      const u = 0.08 + i * 0.13;
      fillPoly(ctx, [f(u, z), f(u + 0.1, z), f(u + 0.1, z + 8), f(u, z + 8)], colors[(i + row * 2) % colors.length]);
    }
  }
}

function arcade(ctx: Ctx, x: number, y: number, color: string, t: number) {
  box(ctx, x + 0.15, y + 0.2, 0.7, 0.6, 0, 30, { top: hexShade(color, -0.35), left: color, right: hexShade(color, -0.3) });
  const f = (u: number, z: number) => at(x + 0.15 + u, y + 0.8, z);
  // tela piscando
  const hue = Math.floor(t / 300) % 3;
  fillPoly(ctx, [f(0.08, 17), f(0.62, 17), f(0.62, 27), f(0.08, 27)], PAL.outline);
  fillPoly(ctx, [f(0.12, 18), f(0.58, 18), f(0.58, 26), f(0.12, 26)], ['#2f62e6', '#8b5cf6', '#3fb8c9'][hue]);
  fillPoly(ctx, [f(0.25, 21), f(0.32, 21), f(0.32, 23), f(0.25, 23)], '#f5c451');
  // painel com botões
  fillPoly(ctx, [f(0.05, 12), f(0.65, 12), f(0.65, 15), f(0.05, 15)], '#2b2350');
  const b1 = f(0.2, 13.5);
  const b2 = f(0.45, 13.5);
  ctx.fillStyle = '#ff4d5e';
  ctx.fillRect(Math.round(b1.x), Math.round(b1.y), 2, 1);
  ctx.fillStyle = '#ffe6a0';
  ctx.fillRect(Math.round(b2.x), Math.round(b2.y), 2, 1);
}

function fountain(ctx: Ctx, x: number, y: number, t: number) {
  const c = at(x + 1, y + 1);
  fillEllipse(ctx, c.x, c.y + 1, 28, 14, 'rgba(0,0,0,0.25)');
  fillEllipse(ctx, c.x, c.y - 4, 28, 14, '#8e8aa3');
  fillEllipse(ctx, c.x, c.y - 6, 28, 14, '#b9b5cc');
  fillEllipse(ctx, c.x, c.y - 6, 23, 11.5, '#3f6fd9');
  fillEllipse(ctx, c.x, c.y - 7, 20, 10, '#5b8cf0');
  // brilhos da água
  const k = (t / 400) % (Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(Math.round(c.x + Math.cos(k) * 12), Math.round(c.y - 7 + Math.sin(k) * 5), 2, 1);
  ctx.fillRect(Math.round(c.x - Math.cos(k) * 9), Math.round(c.y - 6 - Math.sin(k) * 4), 2, 1);
  // pilar e jato
  ctx.fillStyle = '#b9b5cc';
  ctx.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 20, 4, 14);
  fillEllipse(ctx, c.x, c.y - 20, 6, 3, '#d4d1e3');
  const jet = 3 + Math.sin(t / 150) * 1.5;
  ctx.fillStyle = 'rgba(190, 215, 255, 0.85)';
  ctx.fillRect(Math.round(c.x), Math.round(c.y - 22 - jet * 3), 1, Math.round(jet * 3));
  for (const dx of [-5, -3, 3, 5]) ctx.fillRect(Math.round(c.x + dx), Math.round(c.y - 19 + Math.abs(dx) - jet), 1, 2);
}

const itemColor = (it: Furniture) => ITEM_COLORS[it.c] ?? ITEM_COLORS[0];

/** Desenha um móvel (menos o tapete, que fica na camada do chão). */
export function drawItem(ctx: Ctx, it: Furniture, scene: Scene, t: number) {
  switch (it.k) {
    case 'plant':
      return plant(ctx, it.x, it.y);
    case 'tree':
      return tree(ctx, it.x, it.y);
    case 'flowers':
      return flowers(ctx, it.x, it.y, itemColor(it));
    case 'lamp':
      return scene !== 'lobby' ? floorLamp(ctx, it.x, it.y, t) : lampPost(ctx, it.x, it.y, t);
    case 'bench':
      return bench(ctx, it.x, it.y);
    case 'cafe':
      return cafeTable(ctx, it.x, it.y);
    case 'stool':
      return stool(ctx, it.x, it.y, itemColor(it));
    case 'sofa':
      return sofa(ctx, it, itemColor(it));
    case 'rug':
      return rug(ctx, it, itemColor(it));
    case 'shelf':
      return shelf(ctx, it.x, it.y);
    case 'arcade':
      return arcade(ctx, it.x, it.y, itemColor(it), t);
    case 'fountain':
      return fountain(ctx, it.x, it.y, t);
  }
}

/** Profundidade de um móvel: o meio dele (os grandes ficam atrás de quem passa na frente). */
export function itemDepth(it: Furniture) {
  const fp = footprint(it);
  const last = fp[fp.length - 1];
  return (it.x + last.x + 1) / 2 + (it.y + last.y + 1) / 2;
}

/** Contorno de casas (para o editor: o móvel selecionado e a prévia de onde ele vai). */
export function outlineTiles(ctx: Ctx, tiles: Point[], color: string) {
  for (const t of tiles) {
    const p = iso(t.x, t.y);
    fillPoly(ctx, [p, { x: p.x + 16, y: p.y + 8 }, { x: p.x, y: p.y + 16 }, { x: p.x - 16, y: p.y + 8 }], color);
  }
}

// ---- cena ----

/** Camada fixa (chão, borda e prédio): desenhada uma vez por mapa. Devolve o canvas e onde fica a casa (0, 0). */
export function renderStatic(layout: PlazaLayout, accent: string) {
  const left = at(0, layout.h).x - 2;
  const right = at(layout.w, 0).x + 2;
  const top = -90;
  const bottom = at(layout.w, layout.h).y + 14;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(right - left);
  canvas.height = Math.ceil(bottom - top);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(-Math.round(left), -top);
  if (layout.kind !== 'lobby') {
    interiorWalls(ctx, layout, accent);
    platformEdge(ctx, layout, true);
    const floors = FLOORS[layout.kind];
    const f = floors[layout.floor] ?? floors[0];
    for (let y = 0; y < layout.h; y++) for (let x = 0; x < layout.w; x++) woodTile(ctx, x, y, f.a, f.b);
    if (layout.door.x >= 0) exitMat(ctx, layout.door.x, layout.door.y);
    if (layout.elevator) elevator(ctx, layout.elevator.x, layout.elevator.y, layout.level);
    // a primeira porta do corredor é a sua
    layout.doors.forEach((d, i) => roomDoor(ctx, d.x, d.y, i === 0 ? accent : '#5e3826'));
  } else {
    platformEdge(ctx, layout);
    const f = FLOORS.lobby[layout.floor] ?? FLOORS.lobby[0];
    for (let y = 0; y < layout.h; y++) for (let x = 0; x < layout.w; x++) floorTile(ctx, x, y, f.a, f.b);
    doorMat(ctx, layout.door.x, layout.door.y);
  }
  // tapete embaixo de cada mesa
  for (const t of layout.tables) {
    const c = at(t.x + 1, t.y + 1);
    fillEllipse(ctx, c.x, c.y, 46, 23, 'rgba(35, 26, 58, 0.25)');
    fillEllipse(ctx, c.x, c.y, 42, 21, 'rgba(232, 104, 90, 0.20)');
  }
  // tapetes ficam no chão (dá para pisar em cima)
  for (const it of layout.items) if (it.k === 'rug') drawItem(ctx, it, layout.kind, 0);
  // o prédio só existe na praça; lá dentro, o balcão fica no térreo (os andares de cima não têm nenhum dos dois)
  if (layout.kind === 'lobby') building(ctx, layout, accent);
  else if (layout.kind === 'inside' && layout.level === 0) counter(ctx, layout, accent);
  return { canvas, originX: Math.round(-left), originY: -top };
}

export interface Drawable {
  /** profundidade (quanto maior, mais na frente) */
  depth: number;
  draw: (ctx: Ctx) => void;
}

export interface TableLook {
  locked: boolean;
  live: boolean;
}

/** Objetos com profundidade (mesas, bancos, TVs, postes, plantas), para misturar com os bonecos. */
export function sceneObjects(layout: PlazaLayout, tables: TableLook[], accent: string, t: number, nook: NookLook = { desk: false, game: false, sleeper: null }): Drawable[] {
  const out: Drawable[] = [];
  const d = (x: number, y: number) => x + y;
  const n = layout.nook;
  if (n) {
    out.push({ depth: d(n.desk.x + 1, n.desk.y + 0.5), draw: (ctx) => deskPC(ctx, n.desk.x, n.desk.y, nook.desk, t) });
    out.push({ depth: d(n.tv.x + 1, n.tv.y + 0.5), draw: (ctx) => tvGame(ctx, n.tv.x, n.tv.y, nook.game, t) });
    out.push({ depth: d(n.pouf.x + 0.5, n.pouf.y + 0.4), draw: (ctx) => pouf(ctx, n.pouf.x, n.pouf.y) });
    out.push({ depth: d(n.desk.x + 1, n.desk.y + 1.45) - 0.01, draw: (ctx) => deskChair(ctx, n.desk.x + 1, n.desk.y + 1.45) });
    out.push({ depth: d(n.bed.x + 1, n.bed.y + 0.5), draw: (ctx) => bed(ctx, n.bed.x, n.bed.y, nook.sleeper, t) });
  }
  layout.tables.forEach((tb, i) => {
    const look = tables[i] ?? { locked: false, live: false };
    out.push({ depth: d(tb.tv.x + 1, tb.tv.y + 0.5), draw: (ctx) => tv(ctx, tb.tv.x, tb.tv.y, look.live, t) });
    out.push({ depth: d(tb.x + 1, tb.y + 1), draw: (ctx) => table(ctx, tb.x, tb.y, look.locked, accent) });
    for (const s of tb.seats) out.push({ depth: d(s.x + 0.4, s.y + 0.4), draw: (ctx) => stool(ctx, s.x, s.y, accent) });
  });
  const indoor = layout.kind !== 'lobby';
  for (const it of layout.items) {
    if (it.k === 'rug') continue;
    out.push({ depth: itemDepth(it), draw: (ctx) => drawItem(ctx, it, layout.kind, t) });
  }
  if (!indoor) out.push({ depth: -1, draw: (ctx) => portal(ctx, layout.spawn.x, layout.spawn.y, t) });
  return out;
}

// ---- bonecos ----

export type Pose = 'stand' | 'walk1' | 'walk2' | 'sit' | 'wave' | 'up' | 'clap';

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * (amt < 0 ? v : 255 - v))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};

const spriteCache = new Map<string, HTMLCanvasElement>();
export const SPRITE_W = 18;
export const SPRITE_H = 30;

/**
 * Boneco em pixel art (18×30, pés no meio da última linha), com contorno escuro. `facing` 0/1 de frente,
 * 2/3 de costas; 1 e 3 são o espelho de 0 e 2.
 */
export function avatarSprite(av: PlazaAvatar, facing: Facing, pose: Pose): HTMLCanvasElement {
  const key = `${av.skin}.${av.hair}.${av.hairColor}.${av.top}.${av.topColor}.${av.bottomColor}.${av.accessory}|${facing}|${pose}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W;
  canvas.height = SPRITE_H;
  const ctx = canvas.getContext('2d')!;
  const back = facing === 2 || facing === 3;
  const mirror = facing === 1 || facing === 2;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(mirror ? SPRITE_W - x - w : x, y, w, h);
  };
  const skin = SKIN_TONES[av.skin];
  const skinD = shade(skin, -0.18);
  const hair = HAIR_COLORS[av.hairColor];
  const hairD = shade(hair, -0.3);
  const top = CLOTH_COLORS[av.topColor];
  const topD = shade(top, -0.25);
  const bottom = CLOTH_COLORS[av.bottomColor];
  const bottomD = shade(bottom, -0.25);
  const shoe = '#2a2238';
  const sit = pose === 'sit';
  const oy = 1; // margem de cima para o contorno

  // pernas
  if (sit) {
    px(5, 22 + oy, 3, 3, bottom);
    px(10, 22 + oy, 3, 3, bottomD);
    px(5, 25 + oy, 3, 2, shoe);
    px(10, 25 + oy, 3, 2, shoe);
  } else {
    const l = pose === 'walk1' ? -1 : 0;
    const r = pose === 'walk2' ? -1 : 0;
    px(5, 21 + oy, 3, 5 + l, bottom);
    px(10, 21 + oy, 3, 5 + r, bottomD);
    px(5, 26 + oy + l, 3, 2, shoe);
    px(10, 26 + oy + r, 3, 2, shoe);
  }

  // tronco
  px(4, 13 + oy, 10, 9, top);
  px(12, 13 + oy, 2, 9, topD);
  if (av.top === 1) {
    // moletom: bolso e cordão
    px(6, 18 + oy, 6, 2, topD);
    if (!back) px(7, 13 + oy, 1, 3, '#f3e7cf'), px(10, 13 + oy, 1, 3, '#f3e7cf');
  } else if (av.top === 2 && !back) {
    // jaqueta aberta: camiseta clara por dentro
    px(8, 13 + oy, 2, 9, '#ececec');
    px(7, 13 + oy, 1, 9, topD);
  } else if (av.top === 3) {
    // regata: ombros de fora
    px(4, 13 + oy, 2, 2, skin);
    px(12, 13 + oy, 2, 2, skinD);
  }

  // braços
  const sleeve = av.top === 3 ? skin : top;
  const sleeveR = av.top === 3 ? skinD : topD;
  const armLen = av.top === 0 ? 3 : av.top === 3 ? 0 : 6;
  const arm = (x: number, y: number, len: number, color: string, colorSkin: string, hand: string) => {
    px(x, y, 2, Math.min(armLen, len), color);
    if (len > armLen) px(x, y + armLen, 2, len - armLen, colorSkin);
    px(x, y + len, 2, 1, hand);
  };
  if (pose === 'up') {
    px(2, 6 + oy, 2, 8, sleeve);
    px(14, 6 + oy, 2, 8, sleeveR);
    px(2, 5 + oy, 2, 1, skin);
    px(14, 5 + oy, 2, 1, skin);
  } else if (pose === 'wave') {
    arm(2, 14 + oy, 6, sleeve, skin, skin);
    px(14, 7 + oy, 2, 7, sleeveR);
    px(15, 5 + oy, 2, 2, skin);
  } else if (pose === 'clap') {
    px(2, 14 + oy, 2, 3, sleeve);
    px(14, 14 + oy, 2, 3, sleeveR);
    px(4, 17 + oy, 4, 2, sleeve);
    px(10, 17 + oy, 4, 2, sleeveR);
    px(8, 16 + oy, 2, 3, skin);
  } else {
    arm(2, 14 + oy, sit ? 5 : 6, sleeve, skin, skin);
    arm(14, 14 + oy, sit ? 5 : 6, sleeveR, skinD, skinD);
  }

  // cabeça
  px(4, 3 + oy, 10, 10, skin);
  px(12, 3 + oy, 2, 10, skinD);
  px(6, 12 + oy, 6, 1, skinD);

  // cabelo
  const hs = av.hair;
  if (back) {
    if (hs === 5) px(4, 3 + oy, 10, 3, hair);
    else if (hs === 3) px(7, 1 + oy, 4, 10, hair);
    else px(4, 2 + oy, 10, hs === 1 ? 12 : 9, hair), px(12, 2 + oy, 2, hs === 1 ? 12 : 9, hairD);
    if (hs === 4) px(6, 0 + oy, 6, 3, hair);
    if (hs === 2) px(3, 3 + oy, 12, 7, hair), px(3, 3 + oy, 1, 7, hairD);
  } else {
    if (hs === 0 || hs === 1 || hs === 4) {
      px(4, 2 + oy, 10, 3, hair);
      px(4, 5 + oy, 2, 2, hair);
      px(12, 5 + oy, 2, 3, hairD);
      px(9, 5 + oy, 3, 1, hair);
    }
    if (hs === 1) px(3, 4 + oy, 2, 10, hair), px(13, 4 + oy, 2, 10, hairD);
    if (hs === 4) px(6, 0 + oy, 6, 3, hair), px(7, 0 + oy, 2, 1, shade(hair, 0.25));
    if (hs === 2) {
      px(3, 1 + oy, 12, 4, hair);
      px(3, 5 + oy, 2, 5, hair);
      px(13, 5 + oy, 2, 5, hairD);
      px(5, 1 + oy, 1, 1, hairD), px(9, 1 + oy, 1, 1, hairD), px(12, 1 + oy, 1, 1, hairD);
      px(6, 5 + oy, 1, 1, hair), px(10, 5 + oy, 1, 1, hair);
    }
    if (hs === 3) px(7, 0 + oy, 4, 5, hair), px(4, 3 + oy, 3, 2, skinD), px(11, 3 + oy, 3, 2, skinD);
    if (hs === 5) px(4, 3 + oy, 10, 2, hairD);
    // olhos e bochechas (de três quartos: um pouco para o lado em que olha)
    px(7, 8 + oy, 1, 2, '#1b1430');
    px(11, 8 + oy, 1, 2, '#1b1430');
    px(6, 10 + oy, 1, 1, '#f08f8f');
    px(12, 10 + oy, 1, 1, '#e07d7d');
  }

  // acessórios
  const acc = av.accessory;
  if (acc === 1) {
    px(4, 1 + oy, 10, 4, PAL.coral);
    px(12, 1 + oy, 2, 4, PAL.coralDark);
    if (!back) px(10, 4 + oy, 7, 2, PAL.coralDark);
    else px(1, 4 + oy, 4, 1, PAL.coralDark);
  } else if (acc === 2) {
    px(4, 0 + oy, 10, 5, '#8b5cf6');
    px(4, 4 + oy, 10, 1, '#6d43d8');
    px(8, -1 + oy, 2, 1, '#f3e7cf');
  } else if (acc === 3) {
    px(4, 1 + oy, 10, 1, '#2b2b38');
    px(3, 6 + oy, 2, 4, '#2b2b38');
    px(13, 6 + oy, 2, 4, '#2b2b38');
    px(13, 7 + oy, 1, 2, PAL.coral);
  } else if (acc === 4 && !back) {
    px(6, 7 + oy, 7, 1, '#1b1430');
    px(6, 8 + oy, 3, 2, '#bfe3ff');
    px(10, 8 + oy, 3, 2, '#bfe3ff');
    px(6, 8 + oy, 1, 1, '#1b1430'), px(12, 8 + oy, 1, 1, '#1b1430');
  } else if (acc === 5) {
    px(11, 1 + oy, 3, 3, '#f08fb0');
    px(12, 2 + oy, 1, 1, '#f5c451');
  }

  // contorno: todo pixel vazio encostado num pixel pintado fica escuro
  const img = ctx.getImageData(0, 0, SPRITE_W, SPRITE_H);
  const src = new Uint8ClampedArray(img.data);
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H ? 0 : src[(y * SPRITE_W + x) * 4 + 3]);
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      if (alpha(x, y)) continue;
      if (alpha(x - 1, y) || alpha(x + 1, y) || alpha(x, y - 1) || alpha(x, y + 1)) {
        const i = (y * SPRITE_W + x) * 4;
        img.data[i] = 27;
        img.data[i + 1] = 20;
        img.data[i + 2] = 48;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  spriteCache.set(key, canvas);
  if (spriteCache.size > 600) spriteCache.delete(spriteCache.keys().next().value!);
  return canvas;
}

/** Copo em cima da mesa, perto de quem sentou (centro do fundo do copo em x, y). */
export function drawCup(ctx: Ctx, x: number, y: number, color: string) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  fillEllipse(ctx, cx, cy + 1, 3, 1.5, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = PAL.outline;
  ctx.fillRect(cx - 2, cy - 6, 5, 7);
  ctx.fillStyle = 'rgba(220, 235, 255, 0.9)';
  ctx.fillRect(cx - 1, cy - 5, 3, 5);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 1, cy - 3, 3, 3);
  if (color === '#f0b429') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 1, cy - 5, 3, 1);
  }
}

/** Desenha o boneco com os pés em (fx, fy), já arredondado para o pixel. */
export function drawAvatar(
  ctx: Ctx,
  av: PlazaAvatar,
  facing: Facing,
  pose: Pose,
  fx: number,
  fy: number,
  opts: { speaking?: boolean; bob?: number; t: number; ghost?: boolean; sleeping?: boolean; console?: boolean; drink?: string | null },
) {
  const x = Math.round(fx);
  // dormindo na mesa: o corpo escorrega um pouco para frente, a cabeça "cai" sobre a mesa
  const y = Math.round(fy) + (opts.sleeping ? 3 : 0);
  if (opts.speaking) {
    const a = 0.55 + 0.35 * Math.sin(opts.t / 120);
    fillEllipse(ctx, x, y, 10, 5, `rgba(58, 208, 122, ${a})`);
    fillEllipse(ctx, x, y, 7, 3.5, 'rgba(35, 26, 58, 0.6)');
  } else {
    fillEllipse(ctx, x, y, 7, 3.5, 'rgba(20, 12, 40, 0.35)');
  }
  // dormindo: vira para a mesa (de costas para quem olha), como se apoiasse a cabeça nos braços
  const sprite = avatarSprite(av, opts.sleeping ? ((facing === 0 ? 3 : facing === 1 ? 2 : facing) as Facing) : facing, pose);
  if (opts.ghost) ctx.globalAlpha = 0.75;
  const top = y - SPRITE_H + 1 + Math.round(opts.bob ?? 0);
  ctx.drawImage(sprite, x - SPRITE_W / 2, top);
  ctx.globalAlpha = 1;
  // nas mãos (mais ou menos na altura da barriga do boneco)
  const handY = top + 19;
  if (opts.console && !opts.sleeping) {
    // console portátil: balança um pouquinho nas mãos, a tela tem um "jogo" rodando (um bichinho pulando
    // obstáculos) e os botões acendem quando o polegar aperta
    const t = opts.t;
    const lift = Math.floor(t / 420) % 4 === 0 ? -1 : 0;
    const cy = handY + lift;
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(x - 7, cy - 1, 14, 8);
    ctx.fillStyle = '#5a5288';
    ctx.fillRect(x - 6, cy, 12, 6);
    ctx.fillStyle = '#433c6e';
    ctx.fillRect(x - 6, cy + 5, 12, 1);
    // tela
    ctx.fillStyle = '#1d2b3a';
    ctx.fillRect(x - 3, cy + 1, 6, 4);
    ctx.fillStyle = '#7ad18a';
    ctx.fillRect(x - 3, cy + 4, 6, 1); // chão do joguinho
    const run = Math.floor(t / 120) % 6;
    const jump = run === 2 || run === 3 ? 1 : 0;
    ctx.fillStyle = '#ffe6a0';
    ctx.fillRect(x - 2, cy + 3 - jump, 1, 1); // o bichinho
    ctx.fillStyle = '#e8685a';
    ctx.fillRect(x + 2 - (run % 3), cy + 3, 1, 1); // o obstáculo vindo
    // botões (o da direita pisca com o apertar)
    const press = Math.floor(t / 180) % 3 === 0;
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(x - 5, cy + 2, 1, 1);
    ctx.fillRect(x - 6, cy + 2, 3, 1);
    ctx.fillRect(x - 5, cy + 1, 1, 3);
    ctx.fillStyle = press ? '#ffffff' : '#e8685a';
    ctx.fillRect(x + 4, cy + 1, 1, 1);
    ctx.fillStyle = press ? '#e8685a' : '#f5c451';
    ctx.fillRect(x + 5, cy + 3, 1, 1);
  } else if (opts.drink && !opts.sleeping) {
    // copo na mão direita (de quem olha): vidro claro com a bebida e, às vezes, levado à boca
    const sip = Math.floor(opts.t / 3000) % 6 === 0;
    const cx = x + 6;
    const cy = sip ? top + 11 : handY;
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(cx - 2, cy - 1, 5, 7);
    ctx.fillStyle = 'rgba(220, 235, 255, 0.9)';
    ctx.fillRect(cx - 1, cy, 3, 5);
    ctx.fillStyle = opts.drink;
    ctx.fillRect(cx - 1, cy + 2, 3, 3);
    if (opts.drink === '#f0b429') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, cy, 3, 1); // espuma do chopp
    }
  }
}
