// Partículas da Oficina em canvas 2D (sem dependência): confete com física, brasas, estrelas, faíscas e bokeh.
// Brilho com mistura aditiva ("lighter"), densidade de pixel do aparelho e pausa quando a aba some.
import { useEffect, useRef } from 'react';
import { reduceMotion } from '../lib/motion';

export type ParticleMode = 'confetti' | 'embers' | 'stars' | 'sparks' | 'bokeh';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  shape: 0 | 1 | 2; // 0 círculo, 1 retângulo (confete), 2 losango (faísca)
  twinkle: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function spawn(mode: ParticleMode, w: number, h: number, colors: string[], burst: boolean, origin: { x: number; y: number }): P {
  const color = colors[Math.floor(Math.random() * colors.length)];
  switch (mode) {
    case 'confetti': {
      // canhão: sai do ponto de origem para cima e para os lados, depois cai tremulando
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
      const s = rnd(6, 15);
      return { x: origin.x, y: origin.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rnd(90, 150), size: rnd(5, 10), rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3), color, shape: Math.random() < 0.7 ? 1 : 0, twinkle: rnd(0, 6.28) };
    }
    case 'sparks': {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(3, 11);
      return { x: origin.x, y: origin.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rnd(35, 70), size: rnd(1.5, 3.5), rot: a, vr: 0, color, shape: 2, twinkle: 0 };
    }
    case 'embers':
      return { x: rnd(0, w), y: burst ? rnd(0, h) : h + 10, vx: rnd(-0.3, 0.3), vy: rnd(-1.6, -0.5), life: 0, max: rnd(140, 280), size: rnd(1, 3.2), rot: 0, vr: 0, color, shape: 0, twinkle: rnd(0, 6.28) };
    case 'stars':
      return { x: rnd(0, w), y: rnd(0, h), vx: rnd(-0.05, 0.05), vy: rnd(-0.08, 0.02), life: 0, max: rnd(240, 520), size: rnd(0.6, 2.2), rot: 0, vr: 0, color, shape: 0, twinkle: rnd(0, 6.28) };
    case 'bokeh':
      return { x: rnd(0, w), y: burst ? rnd(0, h) : h + 40, vx: rnd(-0.15, 0.15), vy: rnd(-0.45, -0.12), life: 0, max: rnd(300, 600), size: rnd(10, 34), rot: 0, vr: 0, color, shape: 0, twinkle: rnd(0, 6.28) };
  }
}

/**
 * Camada de partículas que ocupa o pai (position: absolute; inset: 0).
 * `burst`: estoura uma vez (confete, faíscas) a partir de `origin` (0 a 1 do tamanho); senão, fluxo contínuo.
 */
export function Particles({
  mode,
  colors,
  burst = false,
  count = 60,
  origin = { x: 0.5, y: 0.5 },
  delay = 0,
  className,
}: {
  mode: ParticleMode;
  colors: string[];
  burst?: boolean;
  count?: number;
  origin?: { x: number; y: number };
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduceMotion()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ps: P[] = [];
    const at = () => ({ x: origin.x * w, y: origin.y * h });
    let started = false;
    let raf = 0;
    let last = performance.now();
    const t0 = last + delay;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now < t0) return;
      // passo fixo de 60 qps, com teto (aba que volta do segundo plano não "teletransporta")
      const k = Math.min(3, (now - last) / 16.67);
      last = now;
      if (!started) {
        started = true;
        const n = burst ? count : Math.round(count * 0.6);
        for (let i = 0; i < n; i++) ps.push(spawn(mode, w, h, colors, true, at()));
      }
      if (!burst && ps.length < count && Math.random() < 0.35 * k) ps.push(spawn(mode, w, h, colors, false, at()));

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = mode === 'confetti' ? 'source-over' : 'lighter';
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += k;
        const t = p.life / p.max;
        if (t >= 1) {
          ps.splice(i, 1);
          continue;
        }
        if (mode === 'confetti') {
          p.vy += 0.32 * k; // gravidade
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.vx += Math.sin(p.life * 0.12 + p.twinkle) * 0.08 * k; // tremular do papel
        } else if (mode === 'sparks') {
          p.vx *= 0.93;
          p.vy = p.vy * 0.93 + 0.12 * k;
        } else if (mode === 'embers') {
          p.vx += Math.sin(p.life * 0.04 + p.twinkle) * 0.02 * k;
        }
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.rot += p.vr * k;

        // entra e sai suave; estrelas e brasas piscam
        let alpha = t < 0.12 ? t / 0.12 : t > 0.7 ? (1 - t) / 0.3 : 1;
        if (mode === 'stars' || mode === 'embers') alpha *= 0.55 + 0.45 * Math.sin(p.life * 0.08 + p.twinkle);
        if (mode === 'bokeh') alpha *= 0.18;
        ctx.globalAlpha = Math.max(0, alpha);

        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.shape === 1) {
          // o confete "vira" no ar: a largura oscila como papel girando
          ctx.rotate(p.rot);
          ctx.scale(1, Math.abs(Math.cos(p.life * 0.15 + p.twinkle)) * 0.8 + 0.2);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        } else if (p.shape === 2) {
          // faísca com rastro na direção do movimento
          const len = Math.hypot(p.vx, p.vy) * 2.2 + p.size;
          ctx.rotate(Math.atan2(p.vy, p.vx));
          const g = ctx.createLinearGradient(-len, 0, p.size, 0);
          g.addColorStop(0, 'transparent');
          g.addColorStop(1, p.color);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(-len, 0);
          ctx.lineTo(0, -p.size / 2);
          ctx.lineTo(p.size, 0);
          ctx.lineTo(0, p.size / 2);
          ctx.fill();
        } else {
          // círculo com halo de luz (brilho)
          const r = p.size * (mode === 'bokeh' ? 1 : 3);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          g.addColorStop(0, p.color);
          g.addColorStop(mode === 'bokeh' ? 0.7 : 0.25, p.color);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (burst && started && !ps.length) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
    // as cores vêm do pacote; reiniciar ao trocar de pacote é o esperado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, burst, count, delay, colors.join(','), origin.x, origin.y]);

  return <canvas ref={ref} className={className ?? 'pointer-events-none absolute inset-0 h-full w-full'} aria-hidden="true" />;
}
