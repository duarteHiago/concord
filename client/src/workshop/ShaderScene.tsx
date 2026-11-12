// Cenas em shader (WebGL, via OGL) para a intro, a faixa do servidor e o fundo do Mural. Um fragment shader só,
// com uma variação por pacote: gradiente com distorção de ruído, luz, vinheta e granulado de filme. Para
// quando sai da tela ou a aba fica em segundo plano; com "reduzir animações", fica parado num quadro.
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';
import { reduceMotion } from '../lib/motion';
import type { ArtKind, Pack } from './packs';

const KIND: Record<ArtKind, number> = { runes: 0, scan: 1, steam: 2, pixel: 3, embers: 4, orbit: 5 };

const vertex = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uBg;
uniform vec3 uBg2;
uniform vec3 uA;
uniform vec3 uB;
uniform float uKind;
uniform float uFocus;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
// gradiente "mesh": o fundo escuro com manchas de luz das duas cores do pacote, deformado por ruído
vec3 mesh(vec2 p, float t) {
  vec2 q = vec2(fbm(p + t * 0.05), fbm(p + vec2(5.2, 1.3) - t * 0.04));
  float n = fbm(p + 2.2 * q);
  vec3 col = mix(uBg, uBg2, smoothstep(0.2, 0.85, n));
  col = mix(col, uA, 0.32 * smoothstep(0.55, 0.95, fbm(p * 1.3 + q * 1.8 + t * 0.03)));
  col = mix(col, uB, 0.22 * smoothstep(0.6, 1.0, fbm(p * 1.1 - q + 4.0)));
  return col;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);   // centro em (0,0), proporção certa
  vec2 c = p - vec2(0.0, uFocus);             // ponto focal (o emblema da intro fica um pouco acima)
  float t = uTime;
  float r = length(c);
  float ang = atan(c.y, c.x);
  vec3 col;

  if (uKind < 0.5) {
    // runas: névoa arcana + anéis girando com marcas, brilho dourado no centro
    col = mesh(p * 1.6, t);
    float ring = 0.0;
    for (int i = 0; i < 3; i++) {
      float rr = 0.18 + float(i) * 0.11;
      float w = 0.0025 + 0.0015 * float(i);
      float marks = step(0.82, fract((ang + t * (0.15 - float(i) * 0.12)) * (6.0 + float(i) * 4.0) / 6.2832));
      ring += smoothstep(w * 3.0, 0.0, abs(r - rr)) * (0.55 + 0.45 * marks);
    }
    col += uA * ring * 0.55;
    col += uA * 0.35 * exp(-r * 7.0) + uB * 0.18 * exp(-r * 3.0);
  } else if (uKind < 1.5) {
    // tático: grade, radar com varredura e rastro, linhas de monitor
    col = uBg * 0.9 + uBg2 * 0.25 * fbm(p * 3.0 + t * 0.05);
    vec2 g = abs(fract(p * 12.0) - 0.5);
    col += uB * 0.07 * smoothstep(0.47, 0.5, max(g.x, g.y));
    float sweep = mod(ang - t * 1.4, 6.2832);
    col += uA * 0.55 * exp(-sweep * 2.2) * smoothstep(0.55, 0.0, r);
    col += uB * 0.35 * smoothstep(0.004, 0.0, abs(fract(r * 6.0) - 0.5) * 0.08) * smoothstep(0.6, 0.0, r);
    col *= 0.86 + 0.14 * sin(uv.y * uRes.y * 1.6);
  } else if (uKind < 2.5) {
    // lo-fi: lava-lamp em tons pastel, macio
    float m = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec2 b = vec2(sin(t * 0.21 + fi * 1.7) * 0.55 * aspect, cos(t * 0.17 + fi * 2.3) * 0.38);
      m += 0.035 / max(0.0005, dot(p - b, p - b));
    }
    col = mix(uBg, uBg2, uv.y);
    col = mix(col, mix(uA, uB, 0.5 + 0.5 * sin(t * 0.3)), smoothstep(0.7, 2.4, m) * 0.55);
    col += 0.05 * fbm(p * 4.0 + t * 0.1);
  } else if (uKind < 3.5) {
    // fliperama: plasma pixelado com pontilhado de 4 níveis
    vec2 px = floor(uv * uRes / 7.0);
    vec2 pp = px * 7.0 / uRes.y;
    float v = sin(pp.x * 6.0 + t) + sin(pp.y * 7.0 - t * 1.3) + sin((pp.x + pp.y) * 5.0 + t * 0.7) + sin(length(pp - 0.5) * 9.0 - t);
    v = v * 0.125 + 0.5;
    float dither = hash(px) * 0.25;
    float lvl = floor((v + dither) * 4.0) / 3.0;
    col = mix(uBg, uBg2, lvl);
    col = mix(col, uA, step(0.9, lvl) * 0.5);
    col = mix(col, uB, step(0.6, lvl) * step(lvl, 0.7) * 0.25);
  } else if (uKind < 4.5) {
    // acampamento: brilho de fogueira subindo de baixo, fumaça, céu escuro
    float flame = fbm(vec2(p.x * 2.4, p.y * 2.0 - t * 0.9)) ;
    float glow = smoothstep(0.9, -0.5, uv.y * 1.6 - flame * 0.5);
    col = mix(uBg * 0.8, uBg2, uv.y * 0.6);
    col += uA * glow * 0.45 + vec3(1.0, 0.45, 0.1) * pow(glow, 3.0) * 0.25;
    col += uB * 0.05 * fbm(p * 2.0 - t * 0.05);
  } else {
    // galáxia: nebulosa colorida, estrelas e um leve redemoinho
    float s = sin(r * 2.0 - t * 0.05), co = cos(r * 2.0 - t * 0.05);
    vec2 sw = mat2(co, -s, s, co) * p;
    float neb = fbm(sw * 2.2 + t * 0.02);
    col = uBg;
    col += uA * 0.55 * smoothstep(0.45, 0.95, neb);
    col += uB * 0.35 * smoothstep(0.55, 1.0, fbm(sw * 3.1 - 3.0));
    vec2 sp = floor(uv * uRes / 2.0);
    float star = step(0.9975, hash(sp)) * (0.5 + 0.5 * sin(t * 2.0 + hash(sp + 3.0) * 30.0));
    col += vec3(star);
  }

  // vinheta + granulado de filme (tira a cara de "gradiente de computador")
  col *= 1.0 - 0.55 * pow(length(uv - 0.5) * 1.25, 2.2);
  col += (hash(uv * uRes + fract(t) * 100.0) - 0.5) * 0.035;
  gl_FragColor = vec4(col, 1.0);
}
`;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Cena em shader do pacote. Ocupa o pai (absolute inset-0). `focus`: altura do ponto focal (-0.5 a 0.5). */
export function ShaderScene({ pack, focus = 0, className, quality = 1 }: { pack: Pack; focus?: number; className?: string; quality?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ dpr: Math.min(1.5, window.devicePixelRatio || 1) * quality, alpha: false, antialias: false });
    } catch {
      return; // sem WebGL: fica o fundo em CSS que está por baixo
    }
    const gl = renderer.gl;
    gl.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(gl.canvas);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: [1, 1] },
        uBg: { value: rgb(pack.colors.bg) },
        uBg2: { value: rgb(pack.colors.bg2) },
        uA: { value: rgb(pack.colors.a) },
        uB: { value: rgb(pack.colors.b) },
        uKind: { value: KIND[pack.art] },
        uFocus: { value: focus },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const resize = () => {
      renderer.setSize(host.clientWidth, host.clientHeight);
      program.uniforms.uRes.value = [gl.canvas.width, gl.canvas.height];
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);
    const still = reduceMotion();
    const start = performance.now() - Math.random() * 20000; // cada cena começa num ponto diferente
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      program.uniforms.uTime.value = (now - start) / 1000;
      renderer.render({ scene: mesh });
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [pack, focus, quality]);

  return <div ref={ref} className={className ?? 'pointer-events-none absolute inset-0 overflow-hidden'} aria-hidden="true" />;
}
