// Praça do servidor: o servidor como um lugar em pixel art isométrico. Cada sala de voz é uma mesa (clicar
// leva o boneco até ela e entra na call), a TV acende quando alguém transmite, e a conversa é por balão,
// só para quem está na praça. Quem está numa call aparece sentado, mesmo sem ter aberto a praça.
import { DoorOpen, Hand, LogOut, Maximize2, MessageSquare, Mic, MicOff, Minus, Plus, Headphones, HeadphoneOff, Shirt, X, Send, Crosshair, Lock, Radio } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { P, has } from '../../../../shared/permissions.ts';
import {
  EMOTES,
  SAY_MAX,
  defaultAvatar,
  distance,
  layoutFor,
  proximityVolume,
  findPath,
  nearestWalkable,
  walkable,
  type Facing,
  type PlazaAvatar,
  type PlazaLayout,
  type Point,
} from '../../../../shared/plaza.ts';
import { memberName, type Channel, type Member, type VoiceState } from '../../lib/types';
import { reduceMotion } from '../../lib/motion';
import { useApp } from '../../store/app';
import { usePlaza } from '../../store/plaza';
import { usePlazaVoice } from '../../store/plazaVoice';
import { toast } from '../../store/toast';
import { useVoice } from '../../store/voice';
import { cx } from '../ui';
import { AvatarEditor } from './AvatarEditor';
import { StreamPip } from './StreamPip';
import { Globe } from './Globe';
import { at, drawAvatar, lampLight, PAL, renderStatic, sceneObjects, tileAt, type Pose } from './pixels';

const SPEED = 3.6; // casas por segundo
const IDLE_MS = 5 * 60_000;
const SEAT_Z = 6;

interface Anim {
  x: number;
  y: number;
  goal: Point;
  path: Point[];
  facing: Facing;
  walked: number;
}

interface Figure {
  userId: string;
  avatar: PlazaAvatar;
  /** posição em casas (pode ser fracionária, andando) */
  x: number;
  y: number;
  facing: Facing;
  pose: Pose;
  seated: boolean;
  bob: number;
  /** pés na tela, em pixels nativos */
  fx: number;
  fy: number;
}

const NO_SEATS = new Map<string, { table: number; seat: number }>();

const facingOf = (dx: number, dy: number): Facing => (dx > 0 ? 0 : dx < 0 ? 2 : dy > 0 ? 1 : 3);

/** Quem não cabe nas 8 cadeiras fica de pé em volta da mesa. */
const STANDING = [
  { dx: 0, dy: 3 },
  { dx: -1, dy: 3 },
  { dx: 2, dy: 3 },
  { dx: -2, dy: 2 },
  { dx: 3, dy: 2 },
  { dx: -2, dy: 0 },
  { dx: 3, dy: 0 },
];

function loadPixelFont() {
  if (document.getElementById('plaza-font')) return;
  const link = document.createElement('link');
  link.id = 'plaza-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&display=swap';
  document.head.appendChild(link);
}

export default function PlazaView() {
  const serverId = usePlaza((s) => s.serverId)!;
  const phase = usePlaza((s) => s.phase);
  const tables = usePlaza((s) => s.tables);
  const walkers = usePlaza((s) => s.walkers);
  const bubbles = usePlaza((s) => s.bubbles);
  const emotes = usePlaza((s) => s.emotes);
  const detail = useApp((s) => s.details[serverId]);
  const me = useApp((s) => s.me)!;
  const voiceStates = useApp((s) => s.voiceStates[serverId]);
  const voiceChannelId = useVoice((s) => (s.serverId === serverId && s.status !== 'idle' ? s.channelId : null));

  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [zoom, setZoom] = useState(() => (window.innerWidth < 700 ? 2 : window.innerWidth > 2200 ? 3 : 2));
  const [hint, setHint] = useState(() => {
    try {
      return localStorage.getItem('concord.plazaHint') !== '1';
    } catch {
      return true;
    }
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const tableRefs = useRef(new Map<number, HTMLDivElement>());
  const signRef = useRef<HTMLDivElement>(null);
  // o meu boneco cai do céu no portal quando a praça se abre
  const openedAt = useRef(performance.now());
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(loadPixelFont, []);

  // onde eu estou: na praça (lobby) ou dentro do estabelecimento
  const myScene = walkers[me.id]?.scene ?? 'lobby';
  const inside = myScene === 'inside';
  const layout = useMemo(() => layoutFor(myScene, tables.length), [myScene, tables.length]);
  // mini TV flutuante com a transmissão de alguém (id de quem transmite)
  const [pip, setPip] = useState<string | null>(null);
  const pendingWatch = useRef<string | null>(null);
  const [wipe, setWipe] = useState(0);
  const channelById = useMemo(() => new Map((detail?.channels ?? []).map((c) => [c.id, c])), [detail?.channels]);
  const memberById = useMemo(() => new Map((detail?.members ?? []).map((m) => [m.id, m])), [detail?.members]);

  // tudo o que o laço de desenho lê sem precisar recriar o laço
  const live = useRef({ layout, inside, tables, channelById, memberById, voiceStates: voiceStates ?? [], voiceChannelId });
  live.current = { layout, inside, tables, channelById, memberById, voiceStates: voiceStates ?? [], voiceChannelId };

  const world = useRef({
    anims: new Map<string, Anim>(),
    figures: [] as Figure[],
    cam: null as Point | null,
    pan: { x: 0, y: 0 },
    pendingJoin: null as { channelId: string; table: number } | null,
    /** fui andando até a porta: ao chegar, troca de lugar */
    pendingDoor: false,
    /** quando o volume da voz do lobby foi recalculado pela última vez */
    volumesAt: 0,
    staticKey: '',
    staticLayer: null as ReturnType<typeof renderStatic> | null,
    view: { x: 0, y: 0, scale: 1, dpr: 1 },
  });

  // quem está sentado em cada mesa (pela lista de voz), com a cadeira de cada um
  const seating = useMemo(() => {
    const out = new Map<string, { table: number; seat: number }>();
    const byChannel = new Map<string, VoiceState[]>();
    for (const v of voiceStates ?? []) {
      const list = byChannel.get(v.channelId) ?? [];
      list.push(v);
      byChannel.set(v.channelId, list);
    }
    tables.forEach((channelId, i) => {
      if (!channelId) return;
      (byChannel.get(channelId) ?? []).forEach((v, seat) => out.set(v.userId, { table: i, seat }));
    });
    return out;
  }, [voiceStates, tables]);
  const seatingRef = useRef(seating);
  seatingRef.current = seating;

  // a cara de quem está sentado sem estar na praça vem do servidor
  const fetchAvatars = usePlaza((s) => s.fetchAvatars);
  useEffect(() => {
    if (phase === null) return;
    const missing = [...seating.keys()].filter((id) => !walkers[id]);
    if (missing.length) fetchAvatars(missing);
  }, [seating, walkers, phase, fetchAvatars]);

  // ---- laço de desenho ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const screen = canvas.getContext('2d')!;
    const low = document.createElement('canvas');
    const lctx = low.getContext('2d')!;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = world.current;
      const L = live.current;
      const layout = L.layout;
      const plaza = usePlaza.getState();
      const voice = useVoice.getState();

      // camada fixa: refeita só quando o mapa muda
      const key = `${layout.kind}:${layout.w}x${layout.h}`;
      if (w.staticKey !== key) {
        w.staticLayer = renderStatic(layout, PAL.coral);
        w.staticKey = key;
      }
      const st = w.staticLayer!;

      // tamanho do canvas: pixels nativos inteiros, ampliados por um fator inteiro de pixels da tela
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const scale = Math.max(1, Math.round(zoomRef.current * dpr));
      const lw = Math.ceil(canvas.width / scale);
      const lh = Math.ceil(canvas.height / scale);
      if (low.width !== lw || low.height !== lh) {
        low.width = lw;
        low.height = lh;
      }

      // bonecos andando
      const meId = useApp.getState().me?.id;
      const scene = layout.kind;
      for (const [id, wk] of Object.entries(plaza.walkers)) {
        if (wk.scene !== scene) {
          w.anims.delete(id);
          continue;
        }
        let a = w.anims.get(id);
        if (!a) {
          a = { x: wk.x, y: wk.y, goal: { x: wk.x, y: wk.y }, path: [], facing: 1, walked: 0 };
          w.anims.set(id, a);
        }
        if (a.goal.x !== wk.x || a.goal.y !== wk.y) {
          const from = nearestWalkable(layout, { x: Math.round(a.x), y: Math.round(a.y) });
          a.path = findPath(layout, from, { x: wk.x, y: wk.y });
          if (!a.path.length) {
            a.x = wk.x;
            a.y = wk.y;
          } else if (from.x !== Math.round(a.x) || from.y !== Math.round(a.y)) {
            a.x = from.x;
            a.y = from.y;
          }
          a.goal = { x: wk.x, y: wk.y };
        }
        let budget = SPEED * dt;
        while (budget > 0 && a.path.length) {
          const next = a.path[0];
          const dx = next.x - a.x;
          const dy = next.y - a.y;
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist > 0.0001) a.facing = facingOf(Math.sign(Math.round(dx * 1000)), Math.sign(Math.round(dy * 1000)));
          if (dist <= budget) {
            a.x = next.x;
            a.y = next.y;
            a.path.shift();
            budget -= dist;
            a.walked += dist;
          } else {
            a.x += (dx / dist) * budget;
            a.y += (dy / dist) * budget;
            a.walked += budget;
            budget = 0;
          }
        }
      }
      for (const id of [...w.anims.keys()]) if (!plaza.walkers[id]) w.anims.delete(id);

      // voz do lobby: volume de cada pessoa pela distância até o meu boneco (umas 10 vezes por segundo)
      const pv = usePlazaVoice.getState();
      if (!L.inside && pv.status === 'connected' && now - w.volumesAt > 100) {
        w.volumesAt = now;
        const mine2 = meId ? w.anims.get(meId) : undefined;
        const volumes = new Map<string, number>();
        if (mine2) for (const [id, a] of w.anims) if (id !== meId) volumes.set(id, proximityVolume(distance(a, mine2)));
        pv.setVolumes(volumes);
      }

      // cheguei na porta: troca de lugar (o servidor confere)
      const atDoor = meId ? w.anims.get(meId) : undefined;
      if (w.pendingDoor && atDoor && !atDoor.path.length && atDoor.x === layout.door.x && atDoor.y === layout.door.y) {
        w.pendingDoor = false;
        plaza.door();
      }

      // cheguei na mesa que cliquei: entra na call
      const mine = meId ? w.anims.get(meId) : undefined;
      if (w.pendingJoin && mine && !mine.path.length) {
        const tb = layout.tables[w.pendingJoin.table];
        if (tb && Math.abs(mine.x - tb.front.x) + Math.abs(mine.y - tb.front.y) < 0.01) {
          const { channelId } = w.pendingJoin;
          w.pendingJoin = null;
          void voice.join(serverId, channelId);
        }
      }

      // figuras: sentados (pela voz) e quem está andando
      const figs: Figure[] = [];
      // sentados nas mesas só aparecem lá dentro
      const seats = L.inside ? seatingRef.current : NO_SEATS;
      for (const [userId, { table, seat }] of seats) {
        const tb = layout.tables[table];
        if (!tb) continue;
        const avatar = plaza.walkers[userId]?.avatar ?? plaza.avatars[userId] ?? defaultAvatar(userId);
        if (seat < tb.seats.length) {
          const s = tb.seats[seat];
          const p = at(s.x + 0.5, s.y + 0.5, SEAT_Z);
          figs.push({ userId, avatar, x: s.x + 0.5, y: s.y + 0.5, facing: s.facing, pose: 'sit', seated: true, bob: 0, fx: p.x, fy: p.y + 2 });
        } else {
          const o = STANDING[(seat - tb.seats.length) % STANDING.length];
          const sx = tb.x + o.dx;
          const sy = tb.y + o.dy;
          const p = at(sx + 0.5, sy + 0.5);
          figs.push({ userId, avatar, x: sx + 0.5, y: sy + 0.5, facing: 3, pose: 'stand', seated: true, bob: 0, fx: p.x, fy: p.y });
        }
      }
      for (const [userId, a] of w.anims) {
        if (seats.has(userId)) continue;
        const wk = plaza.walkers[userId];
        const p = at(a.x + 0.5, a.y + 0.5);
        const moving = a.path.length > 0;
        const step = Math.floor(a.walked * 4) % 4;
        let pose: Pose = moving ? (step === 1 ? 'walk1' : step === 3 ? 'walk2' : 'stand') : 'stand';
        let bob = moving && step % 2 === 1 ? -1 : 0;
        const em = plaza.emotes[userId];
        const emAge = em ? Date.now() - em.at : Infinity;
        if (!moving && em && emAge < 2600) {
          const beat = Math.floor(emAge / 220) % 2;
          if (em.emote === 'wave') pose = 'wave';
          else if (em.emote === 'dance') {
            pose = beat ? 'up' : 'stand';
            bob = beat ? -2 : 0;
          } else if (em.emote === 'clap') pose = beat ? 'clap' : 'stand';
        }
        if (userId === meId && !reduceMotion()) {
          const tt = now - openedAt.current;
          const land = REVEAL_FROM + 120;
          if (tt < land) bob = -400;
          else if (tt < land + 380) bob = -170 * (1 - ((tt - land) / 380) ** 2);
          else if (tt < land + 600) bob = -7 * Math.sin((Math.PI * (tt - land - 380)) / 220);
        }
        figs.push({ userId, avatar: wk.avatar, x: a.x + 0.5, y: a.y + 0.5, facing: a.facing, pose, seated: false, bob, fx: p.x, fy: p.y });
      }
      w.figures = figs;

      // câmera: segue o meu boneco (ou o portal), com o arraste por cima
      const meFig = figs.find((f) => f.userId === meId);
      const focus = meFig ? { x: meFig.fx, y: meFig.fy - 20 } : at(layout.spawn.x + 0.5, layout.spawn.y - 4);
      if (!w.cam) w.cam = { ...focus };
      const k = Math.min(1, dt * 4);
      w.cam.x += (focus.x - w.cam.x) * k;
      w.cam.y += (focus.y - w.cam.y) * k;
      const viewX = Math.round(w.cam.x + w.pan.x - lw / 2);
      const viewY = Math.round(w.cam.y + w.pan.y - lh / 2);
      w.view = { x: viewX, y: viewY, scale, dpr };

      // ---- desenho ----
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      const sky = lctx.createLinearGradient(0, 0, 0, lh);
      sky.addColorStop(0, '#1a1330');
      sky.addColorStop(1, PAL.night);
      lctx.fillStyle = sky;
      lctx.fillRect(0, 0, lw, lh);
      // estrelinhas fixas no fundo
      lctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 97 + 13) % 997) / 997;
        const sy = ((i * 61 + 7) % 991) / 991;
        if (Math.floor(now / 1400 + i) % 7 !== 0) lctx.fillRect(Math.floor(sx * lw), Math.floor(sy * lh * 0.6), 1, 1);
      }
      lctx.setTransform(1, 0, 0, 1, -viewX, -viewY);
      lctx.drawImage(st.canvas, -st.originX, -st.originY);
      for (const l of layout.lamps) lampLight(lctx, l.x, l.y);

      const looks = L.tables.map((channelId) => {
        const ch = channelId ? L.channelById.get(channelId) : undefined;
        return {
          locked: !channelId || !ch || !has(ch.permissions, P.CONNECT),
          live: !!channelId && L.voiceStates.some((v) => v.channelId === channelId && v.streaming),
        };
      });
      const items = sceneObjects(layout, looks, PAL.coral, now);
      for (const f of figs) {
        // lá dentro, quem fala na call da mesa; no lobby, quem fala na voz da praça
        const speaking = L.inside ? !!voice.speaking[f.userId] && seats.has(f.userId) : !!pv.speaking[f.userId];
        items.push({
          depth: f.x + f.y + (f.seated ? 0.05 : 0),
          draw: (ctx) => drawAvatar(ctx, f.avatar, f.facing, f.pose, f.fx, f.fy, { speaking, bob: f.bob, t: now }),
        });
      }
      items.sort((p, q) => p.depth - q.depth);
      for (const it of items) it.draw(lctx);

      // vinheta suave nas bordas (noite)
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      const vg = lctx.createRadialGradient(lw / 2, lh / 2, Math.min(lw, lh) * 0.35, lw / 2, lh / 2, Math.max(lw, lh) * 0.75);
      vg.addColorStop(0, 'rgba(20, 12, 40, 0)');
      vg.addColorStop(1, 'rgba(20, 12, 40, 0.55)');
      lctx.fillStyle = vg;
      lctx.fillRect(0, 0, lw, lh);

      screen.imageSmoothingEnabled = false;
      screen.setTransform(1, 0, 0, 1, 0, 0);
      screen.drawImage(low, 0, 0, lw * scale, lh * scale);

      // rótulos em HTML (nomes, balões, placas) acompanham os bonecos
      const toCss = (nx: number, ny: number) => ({ x: ((nx - viewX) * scale) / dpr, y: ((ny - viewY) * scale) / dpr });
      for (const f of figs) {
        const el = labelRefs.current.get(f.userId);
        if (!el) continue;
        const p = toCss(f.fx, f.fy - 31 + f.bob - (f.pose === 'sit' ? -3 : 0));
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        el.style.zIndex = String(Math.round((f.x + f.y) * 10));
        el.style.display = '';
      }
      for (const [id, el] of labelRefs.current) if (!figs.some((f) => f.userId === id)) el.style.display = 'none';
      layout.tables.forEach((tb, i) => {
        const el = tableRefs.current.get(i);
        if (!el) return;
        const p = toCss(at(tb.x + 1, tb.y + 1).x, at(tb.x + 1, tb.y + 1).y + 18);
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      });
      if (signRef.current) {
        const { x0, x1 } = layout.building;
        const a = x1 - x0 + 1;
        // lá fora, a placa da fachada; lá dentro, o neon na parede do balcão
        const s = layout.kind === 'inside' ? at(x0 + a / 2, 0, 52) : at(x0 + a / 2, 3, 2 + 57.5);
        const p = toCss(s.x, s.y);
        signRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        signRef.current.style.fontSize = `${Math.max(9, (scale / dpr) * 5)}px`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [serverId]);

  // ---- andar e clicar ----
  const moveMe = (target: Point, keepJoin = false) => {
    const w = world.current;
    if (!keepJoin) w.pendingJoin = null;
    w.pendingDoor = target.x === layout.door.x && target.y === layout.door.y;
    w.pan = { x: 0, y: 0 };
    const meId = me.id;
    const cur = usePlaza.getState().walkers[meId];
    if (!cur) return;
    // já mostra o passo aqui; o servidor repete para todo mundo
    usePlaza.setState({ walkers: { ...usePlaza.getState().walkers, [meId]: { ...cur, x: target.x, y: target.y } } });
    usePlaza.getState().move(target.x, target.y);
    if (hint) dismissHint();
  };

  const dismissHint = () => {
    setHint(false);
    try {
      localStorage.setItem('concord.plazaHint', '1');
    } catch {
      // ignorado
    }
  };

  const clickTable = (i: number) => {
    const channelId = tables[i];
    const tb = layout.tables[i];
    if (!tb) return;
    if (!channelId) return toast.info('Mesa reservada: é uma sala que você não vê.');
    const ch = channelById.get(channelId);
    if (!ch || !has(ch.permissions, P.CONNECT)) return toast.info(`A mesa ${ch ? `#${ch.name}` : ''} está trancada para você.`);
    if (voiceChannelId === channelId) return;
    if (voiceChannelId) {
      // já está em outra call: troca de mesa direto
      void useVoice.getState().join(serverId, channelId);
      moveMe(tb.front);
      return;
    }
    world.current.pendingJoin = { channelId, table: i };
    moveMe(tb.front, true);
  };

  const down = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY, panX: world.current.pan.x, panY: world.current.pan.y, moved: false };
    setCard(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = down.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const { scale, dpr } = world.current.view;
    world.current.pan = { x: d.panX - (dx * dpr) / scale, y: d.panY - (dy * dpr) / scale };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || d.moved) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const { x: vx, y: vy, scale, dpr } = world.current.view;
    const nx = ((e.clientX - rect.left) * dpr) / scale + vx;
    const ny = ((e.clientY - rect.top) * dpr) / scale + vy;

    // 1) clicou num boneco: o cartão da pessoa
    const hitFig = [...world.current.figures]
      .sort((p, q) => q.x + q.y - (p.x + p.y))
      .find((f) => nx >= f.fx - 8 && nx <= f.fx + 8 && ny >= f.fy - 30 && ny <= f.fy + 1);
    if (hitFig) {
      setCard(hitFig.userId);
      return;
    }
    // 2) mesa, cadeira ou TV (o tampo da mesa fica uns pixels acima do chão)
    for (const off of [0, 12]) {
      const t = tileAt(nx, ny + off);
      const i = layout.tables.findIndex(
        (tb) =>
          (t.x >= tb.x && t.x <= tb.x + 1 && t.y >= tb.y && t.y <= tb.y + 1) ||
          tb.seats.some((s) => s.x === t.x && s.y === t.y) ||
          (t.y === tb.tv.y && (t.x === tb.tv.x || t.x === tb.tv.x + 1)),
      );
      if (i >= 0) {
        // a TV de uma mesa com transmissão abre a mini TV (entrando na call antes, se precisar)
        const onTv = t.y === layout.tables[i].tv.y;
        const streamer = (voiceStates ?? []).find((v) => v.channelId === tables[i] && v.streaming && v.userId !== me.id);
        if (onTv && streamer) {
          if (voiceChannelId === tables[i]) return setPip(streamer.userId);
          pendingWatch.current = tables[i];
        }
        return clickTable(i);
      }
    }
    // 3) no lobby, clicar no prédio leva até a porta
    if (layout.kind === 'lobby') {
      const { x0, x1 } = layout.building;
      for (const off of [0, 16, 32, 48]) {
        const b = tileAt(nx, ny + off);
        if (b.x >= x0 && b.x <= x1 && b.y >= 0 && b.y <= 2) return moveMe(layout.door);
      }
    }
    // 4) chão: anda até lá (sentado, tem que levantar antes)
    const t = tileAt(nx, ny);
    if (!walkable(layout, t.x, t.y)) return;
    if (inside && seating.has(me.id)) {
      toast.info('Você está numa mesa (na call). Clique em "Levantar" para sair andando.');
      return;
    }
    moveMe(t);
  };

  // setas do teclado / WASD andam uma casa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'Escape') {
        if (editing) setEditing(false);
        else if (card) setCard(null);
        else leave();
        return;
      }
      if (e.key === 'Enter') {
        document.getElementById('plaza-say')?.focus();
        e.preventDefault();
        return;
      }
      const dir: Record<string, Point> = {
        ArrowUp: { x: 0, y: -1 },
        w: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        s: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        a: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const d = dir[e.key];
      if (!d || (live.current.inside && seatingRef.current.has(me.id))) return;
      const cur = usePlaza.getState().walkers[me.id];
      if (!cur) return;
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      if (walkable(live.current.layout, next.x, next.y)) {
        e.preventDefault();
        moveMe(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- sair ----
  const leave = () => {
    if (leaving) return;
    if (reduceMotion()) return usePlaza.getState().close();
    setLeaving(true);
    setTimeout(() => usePlaza.getState().close(), 650);
  };
  const openCall = () => {
    if (!voiceChannelId) return;
    usePlaza.getState().close();
    useApp.getState().openChannel(serverId, voiceChannelId);
  };
  const standUp = () => {
    void useVoice.getState().leave();
    const seat = seating.get(me.id);
    const tb = seat ? layout.tables[seat.table] : undefined;
    if (tb) moveMe(tb.front);
  };

  // ---- quem aparece (rótulos em HTML) ----
  const people = useMemo(() => {
    const ids = new Set<string>(Object.values(walkers).filter((w) => w.scene === myScene).map((w) => w.userId));
    if (inside) for (const id of seating.keys()) ids.add(id);
    return [...ids];
  }, [walkers, seating, myScene, inside]);

  // troquei de lugar: câmera de novo em mim e uma transição de blocos
  const firstScene = useRef(true);
  useEffect(() => {
    if (firstScene.current) {
      firstScene.current = false;
      return;
    }
    world.current.cam = null;
    world.current.pan = { x: 0, y: 0 };
    world.current.pendingJoin = null;
    setWipe((k) => k + 1);
  }, [myScene]);

  // entrei na call pela TV: abre a mini TV assim que eu estiver na mesa
  useEffect(() => {
    if (!pendingWatch.current || voiceChannelId !== pendingWatch.current) return;
    const streamer = (voiceStates ?? []).find((v) => v.channelId === voiceChannelId && v.streaming && v.userId !== me.id);
    pendingWatch.current = null;
    if (streamer) setPip(streamer.userId);
  }, [voiceChannelId, voiceStates, me.id]);

  // a transmissão acabou, ou saí da call: a mini TV fecha
  useEffect(() => {
    if (!pip) return;
    const v = (voiceStates ?? []).find((s) => s.userId === pip);
    if (!v || !v.streaming || v.channelId !== voiceChannelId) setPip(null);
  }, [pip, voiceStates, voiceChannelId]);

  // voz por proximidade: liga no lobby (fora de call, para não ouvir duas conversas), desliga lá dentro
  const lobbyVoice = phase === 'ready' && !inside && !voiceChannelId;
  useEffect(() => {
    if (lobbyVoice) void usePlazaVoice.getState().connect(serverId);
    else usePlazaVoice.getState().disconnect();
  }, [lobbyVoice, serverId]);
  useEffect(
    () => () => {
      usePlazaVoice.getState().disconnect();
    },
    [],
  );

  const goDoor = () => moveMe(layout.door);

  const myVoice = voiceStates?.find((v) => v.userId === me.id);
  const myChannel = voiceChannelId ? channelById.get(voiceChannelId) : undefined;
  const count = Object.values(walkers).filter((w) => w.scene === myScene).length;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden select-none" style={{ background: PAL.night }}>
      <canvas
        ref={canvasRef}
        className="plaza-canvas absolute inset-0 h-full w-full cursor-pointer touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {/* rótulos presos ao mapa: num contexto próprio, para nunca passar por cima da barra e das janelas */}
      <div className="pointer-events-none absolute inset-0 isolate overflow-hidden">
      {/* placa do prédio com o nome do servidor */}
      <div ref={signRef} className="pointer-events-none absolute top-0 left-0">
        <div
          className="plaza-pixel -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold tracking-wide"
          style={inside ? { color: '#ffd9f0', textShadow: '0 0 4px #ff5c9a, 0 0 12px #ff5c9a, 0 0 22px rgba(255,92,154,0.6)' } : { color: '#ffe6a0', textShadow: '0 0 6px rgba(255,200,120,0.7)' }}
        >
          {detail?.server.name ?? ''}
        </div>
      </div>

      {/* placas das mesas */}
      {layout.tables.map((_, i) => (
        <div key={i} ref={(el) => void (el ? tableRefs.current.set(i, el) : tableRefs.current.delete(i))} className="pointer-events-none absolute top-0 left-0">
          <TableTag channel={tables[i] ? channelById.get(tables[i]!) : undefined} hidden={!tables[i]} states={(voiceStates ?? []).filter((v) => v.channelId === tables[i])} mine={voiceChannelId === tables[i] && !!tables[i]} />
        </div>
      ))}

      {/* nomes, ícones, balões e gestos em cima de cada boneco */}
      {people.map((id) => (
        <div key={id} ref={(el) => void (el ? labelRefs.current.set(id, el) : labelRefs.current.delete(id))} className="pointer-events-none absolute top-0 left-0" style={{ display: 'none' }}>
          <PersonTag
            member={memberById.get(id)}
            isMe={id === me.id}
            voice={(voiceStates ?? []).find((v) => v.userId === id)}
            idle={!seating.has(id) && !!walkers[id] && Date.now() - walkers[id].activeAt > IDLE_MS}
            bubbles={bubbles.filter((b) => b.userId === id)}
            emote={emotes[id]}
          />
        </div>
      ))}
      </div>

      {/* topo: servidor e quantos estão na praça */}
      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1430]/80 py-1.5 pr-3.5 pl-1.5 text-white shadow-lg backdrop-blur">
        <Globe size={30} />
        <div className="leading-tight">
          <div className="plaza-pixel text-[15px] font-bold">{inside ? `Dentro de ${detail?.server.name ?? ''}` : `Praça · ${detail?.server.name ?? ''}`}</div>
          <div className="text-[11px] text-white/60">
            {count} {count === 1 ? 'pessoa' : 'pessoas'} {inside ? 'aqui dentro' : 'na praça'}
            {inside && ` · ${seating.size} na${seating.size === 1 ? '' : 's'} mesa${seating.size === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>
      <div className="absolute top-3 right-3 flex gap-1.5">
        <HudButton label="Afastar" onClick={() => setZoom((z) => Math.max(1, z - 1))}>
          <Minus size={16} />
        </HudButton>
        <HudButton label="Aproximar" onClick={() => setZoom((z) => Math.min(5, z + 1))}>
          <Plus size={16} />
        </HudButton>
        <HudButton label="Centralizar em mim" onClick={() => (world.current.pan = { x: 0, y: 0 })}>
          <Crosshair size={16} />
        </HudButton>
        <HudButton label="Sair da praça (Esc)" onClick={leave}>
          <X size={16} />
        </HudButton>
      </div>

      {hint && phase === 'ready' && (
        <div className="absolute top-20 left-1/2 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#1b1430]/90 p-4 text-sm text-white/90 shadow-xl backdrop-blur">
          <div className="plaza-pixel mb-1 text-base font-bold text-[#ffe6a0]">Bem-vindo à praça!</div>
          Clique no chão para andar (ou use as setas). Aqui fora a conversa é <b>por proximidade</b>: ligue o microfone e quem estiver perto te ouve, e os balões só chegam a quem está perto. As calls ficam <b>dentro do prédio</b>: entre pela porta e clique numa mesa para sentar. Clique na TV de uma mesa para assistir a transmissão numa telinha. O que você escreve vira balão e <b>não fica salvo</b>.
          <button onClick={dismissHint} className="mt-3 block rounded-lg bg-[#e8685a] px-3 py-1.5 font-semibold text-white hover:brightness-110">
            Entendi
          </button>
        </div>
      )}

      {/* conversa da praça (só deste aparelho, some ao sair) */}
      {logOpen && <PlazaLog members={memberById} onClose={() => setLogOpen(false)} />}

      {/* barra de baixo */}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-center gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <SayBox />
        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-[#1b1430]/85 p-1.5 shadow-lg backdrop-blur">
          {EMOTES.map((e) => (
            <button key={e.id} title={e.label} aria-label={e.label} onClick={() => usePlaza.getState().emote(e.id)} className="grid h-9 w-9 place-items-center rounded-xl text-lg transition hover:bg-white/10 active:scale-90">
              {e.emoji}
            </button>
          ))}
          <span className="mx-0.5 h-6 w-px bg-white/15" />
          <HudButton label="Conversa da praça" flat active={logOpen} onClick={() => setLogOpen((v) => !v)}>
            <MessageSquare size={17} />
          </HudButton>
          <HudButton label="Meu boneco" flat onClick={() => setEditing(true)}>
            <Shirt size={17} />
          </HudButton>
          {!inside && <LobbyMic inCall={!!voiceChannelId} />}
          <span className="mx-0.5 h-6 w-px bg-white/15" />
          <button onClick={goDoor} className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-white hover:bg-white/10">
            <DoorOpen size={16} /> {inside ? 'Voltar à praça' : 'Entrar no prédio'}
          </button>
        </div>
        {myChannel && (
          <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-[#1b1430]/85 p-1.5 pl-3 text-white shadow-lg backdrop-blur">
            <div className="mr-1 max-w-[140px] truncate text-xs leading-tight">
              <div className="text-white/50">Na mesa</div>
              <div className="font-semibold">#{myChannel.name}</div>
            </div>
            <VoiceButtons myVoice={myVoice} />
            <HudButton label="Abrir a call" flat onClick={openCall}>
              <Maximize2 size={17} />
            </HudButton>
            <button onClick={standUp} className="ml-0.5 flex h-9 items-center gap-1.5 rounded-xl bg-[#e8685a] px-3 text-sm font-semibold text-white hover:brightness-110">
              <LogOut size={15} /> Levantar
            </button>
          </div>
        )}
      </div>

      {card && <PersonCard userId={card} member={memberById.get(card)} isMe={card === me.id} onEdit={() => setEditing(true)} onClose={() => setCard(null)} serverId={serverId} />}
      {editing && <AvatarEditor onClose={() => setEditing(false)} />}
      {pip && (
        <StreamPip
          userId={pip}
          name={memberById.get(pip) ? memberName(memberById.get(pip)!) : 'Alguém'}
          onClose={() => setPip(null)}
          onOpenCall={() => {
            setPip(null);
            openCall();
          }}
        />
      )}
      {wipe > 0 && <SceneWipe key={wipe} />}
      <Arrival leaving={leaving} />
    </div>
  );
}

// ---- pedaços da tela ----

function HudButton({ label, onClick, children, flat, active }: { label: string; onClick: () => void; children: React.ReactNode; flat?: boolean; active?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx(
        'grid h-9 w-9 place-items-center rounded-xl text-white transition active:scale-90',
        flat ? 'hover:bg-white/10' : 'border border-white/10 bg-[#1b1430]/85 shadow-lg backdrop-blur hover:bg-[#2b2350]',
        active && 'bg-white/15',
      )}
    >
      {children}
    </button>
  );
}

/** Microfone da voz por proximidade do lobby. */
function LobbyMic({ inCall }: { inCall: boolean }) {
  const status = usePlazaVoice((s) => s.status);
  const micOn = usePlazaVoice((s) => s.micOn);
  if (inCall) {
    return (
      <span title="Você está numa call: a voz da praça fica desligada" className="grid h-9 w-9 place-items-center text-white/35">
        <MicOff size={17} />
      </span>
    );
  }
  if (status !== 'connected') return null;
  return (
    <button
      onClick={() => void usePlazaVoice.getState().toggleMic()}
      title={micOn ? 'Desligar o microfone da praça' : 'Falar na praça (quem estiver perto te ouve)'}
      aria-label={micOn ? 'Desligar o microfone da praça' : 'Falar na praça'}
      aria-pressed={micOn}
      className={cx('flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-white transition', micOn ? 'bg-[#2e9e6a] hover:brightness-110' : 'hover:bg-white/10')}
    >
      {micOn ? <Mic size={16} /> : <MicOff size={16} className="text-[#ff8a7e]" />}
      <span className="hidden sm:inline">{micOn ? 'Falando' : 'Falar'}</span>
    </button>
  );
}

function VoiceButtons({ myVoice }: { myVoice?: VoiceState }) {
  const micOn = useVoice((s) => s.micOn);
  const deafened = useVoice((s) => s.deafened);
  return (
    <>
      <HudButton label={micOn ? 'Silenciar' : 'Ativar microfone'} flat onClick={() => void useVoice.getState().toggleMic()}>
        {micOn && !myVoice?.serverMuted ? <Mic size={17} /> : <MicOff size={17} className="text-[#ff8a7e]" />}
      </HudButton>
      <HudButton label={deafened ? 'Ouvir de novo' : 'Ensurdecer'} flat onClick={() => void useVoice.getState().toggleDeafen()}>
        {deafened ? <HeadphoneOff size={17} className="text-[#ff8a7e]" /> : <Headphones size={17} />}
      </HudButton>
    </>
  );
}

function SayBox() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await usePlaza.getState().say(t);
    setSending(false);
    if (ok) setText('');
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex w-[min(100%,420px)] items-center gap-1 rounded-2xl border border-white/10 bg-[#1b1430]/85 p-1.5 pl-3.5 shadow-lg backdrop-blur"
    >
      <input
        id="plaza-say"
        value={text}
        maxLength={SAY_MAX}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
        placeholder="Fale na praça… (vira balão, não fica salvo)"
        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        autoComplete="off"
      />
      <button type="submit" disabled={!text.trim() || sending} aria-label="Enviar balão" className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8685a] text-white transition hover:brightness-110 disabled:opacity-40">
        <Send size={16} />
      </button>
    </form>
  );
}

function TableTag({ channel, hidden, states, mine }: { channel?: Channel; hidden: boolean; states: VoiceState[]; mine: boolean }) {
  const live = states.some((s) => s.streaming);
  const locked = hidden || !channel || !has(channel.permissions, P.CONNECT);
  return (
    <div
      className={cx(
        'plaza-pixel -translate-x-1/2 flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-bold shadow-md',
        mine ? 'border-[#ffe6a0] bg-[#e8685a] text-white' : 'border-white/15 bg-[#1b1430]/85 text-white/90',
      )}
    >
      {locked && <Lock size={10} />}
      {live && <Radio size={11} className="text-[#ff5c7a]" />}
      <span className="max-w-[120px] truncate">{hidden ? 'Mesa reservada' : `#${channel?.name ?? ''}`}</span>
      {states.length > 0 && <span className="text-white/60">· {states.length}</span>}
    </div>
  );
}

function PersonTag({
  member,
  isMe,
  voice,
  idle,
  bubbles,
  emote,
}: {
  member?: Member;
  isMe: boolean;
  voice?: VoiceState;
  idle: boolean;
  bubbles: { id: number; text: string }[];
  emote?: { emote: string; at: number };
}) {
  const name = member ? memberName(member) : 'Alguém';
  const emoji = emote && Date.now() - emote.at < 2600 ? EMOTES.find((e) => e.id === emote.emote)?.emoji : null;
  return (
    <div className="relative -translate-x-1/2 -translate-y-full">
      <div className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 flex-col items-center gap-1">
        {bubbles.map((b) => (
          <div key={b.id} className="plaza-bubble relative w-max max-w-[220px] rounded-lg border-2 border-[#1b1430] bg-white px-2 py-1 text-[12.5px] leading-snug text-[#1b1430] shadow-[2px_2px_0_#1b1430]" style={{ overflowWrap: 'anywhere' }}>
            <b className="plaza-pixel mr-1 text-[#2f62e6]">{name}:</b>
            {b.text}
          </div>
        ))}
      </div>
      {emoji && (
        <div key={emote!.at} className="plaza-emote absolute bottom-full left-1/2 -ml-3 text-2xl">
          {emoji}
        </div>
      )}
      {idle && <div className="plaza-zzz plaza-pixel absolute -top-3 right-0 text-sm font-bold text-[#bfc7ff]">z</div>}
      <div className={cx('plaza-pixel flex items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-bold leading-[16px]', isMe ? 'bg-[#e8685a] text-white' : 'bg-[#1b1430]/75 text-white')}>
        {voice?.streaming && <span className="rounded-sm bg-[#ff5c7a] px-0.5 text-[9px] leading-[12px]">AO VIVO</span>}
        <span className="max-w-[110px] truncate">{name}</span>
        {voice && (voice.deafened ? <HeadphoneOff size={10} /> : voice.muted ? <MicOff size={10} /> : null)}
      </div>
    </div>
  );
}

function PlazaLog({ members, onClose }: { members: Map<string, Member>; onClose: () => void }) {
  const log = usePlaza((s) => s.log);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [log.length]);
  return (
    <div className="absolute right-3 bottom-24 flex max-h-[45vh] w-[min(92vw,320px)] flex-col rounded-2xl border border-white/10 bg-[#1b1430]/90 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="plaza-pixel text-sm font-bold">Conversa da praça</div>
        <button onClick={onClose} aria-label="Fechar" className="rounded p-1 hover:bg-white/10">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[13px]">
        {log.length === 0 && <div className="text-white/50">Ninguém falou desde que você chegou. O que é dito aqui não fica salvo.</div>}
        {log.map((b) => {
          const m = members.get(b.userId);
          return (
            <div key={b.id} style={{ overflowWrap: 'anywhere' }}>
              <span className="text-white/40">{new Date(b.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} </span>
              <b className="text-[#9db4ff]">{m ? memberName(m) : 'Alguém'}:</b> {b.text}
            </div>
          );
        })}
        <div ref={end} />
      </div>
    </div>
  );
}

function PersonCard({ userId, member, isMe, onEdit, onClose, serverId }: { userId: string; member?: Member; isMe: boolean; onEdit: () => void; onClose: () => void; serverId: string }) {
  const name = member ? memberName(member) : 'Alguém';
  const go = (fn: () => void) => {
    usePlaza.getState().close();
    fn();
  };
  return (
    <div className="absolute bottom-24 left-1/2 w-[min(92vw,300px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#1b1430]/95 p-3 text-white shadow-xl backdrop-blur">
      <div className="flex items-center gap-2.5">
        {member?.avatarUrl ? (
          <img src={member.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-full font-bold" style={{ background: member?.avatarColor ?? '#2f62e6' }}>
            {name[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          {member && <div className="truncate text-xs text-white/50">@{member.username}</div>}
        </div>
        <button onClick={onClose} aria-label="Fechar" className="rounded p-1 hover:bg-white/10">
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {isMe ? (
          <button
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#e8685a] py-1.5 text-sm font-semibold hover:brightness-110"
          >
            <Shirt size={14} /> Trocar meu boneco
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                usePlaza.getState().emote('wave');
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-1.5 text-sm font-semibold hover:bg-white/15"
            >
              <Hand size={14} /> Acenar
            </button>
            <button onClick={() => go(() => void useApp.getState().openDm(userId))} className="flex-1 rounded-lg bg-white/10 py-1.5 text-sm font-semibold hover:bg-white/15">
              Mensagem
            </button>
            <button onClick={() => go(() => useApp.getState().openProfile(userId, serverId))} className="flex-1 rounded-lg bg-[#e8685a] py-1.5 text-sm font-semibold hover:brightness-110">
              Perfil
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Ao passar pela porta: a tela some em blocos de pixel e volta já no outro lugar. */
function SceneWipe() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (reduceMotion()) {
      setDone(true);
      return;
    }
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    canvas.width = Math.ceil(canvas.clientWidth / BLOCK);
    canvas.height = Math.ceil(canvas.clientHeight / BLOCK);
    const cols = canvas.width;
    const rows = canvas.height;
    const order = Array.from({ length: cols * rows }, () => Math.random());
    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const open = Math.min(1, (now - start) / 420);
      ctx.clearRect(0, 0, cols, rows);
      ctx.fillStyle = PAL.night;
      for (let i = 0; i < order.length; i++) if (order[i] >= open) ctx.fillRect(i % cols, Math.floor(i / cols), 1, 1);
      if (open < 1) raf = requestAnimationFrame(draw);
      else setDone(true);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (done) return null;
  return <canvas ref={ref} className="plaza-canvas pointer-events-none absolute inset-0 z-[75] h-full w-full" />;
}

const ARRIVE_MS = 1750;
const REVEAL_FROM = 1050;
const LEAVE_MS = 560;
const BLOCK = 28;

/**
 * Chegada: céu estrelado, o globo surge girando, um pino cai no servidor e a câmera mergulha; a tela se desfaz
 * em blocos de pixel (do meio para as bordas) revelando a praça. Saída: os blocos voltam e cobrem a tela.
 */
function Arrival({ leaving }: { leaving: boolean }) {
  const phase = usePlaza((s) => s.phase);
  const arrived = usePlaza((s) => s.arrived);
  const fast = reduceMotion();
  const ref = useRef<HTMLCanvasElement>(null);
  const active = phase === 'arriving' || leaving;

  useEffect(() => {
    if (phase !== 'arriving') return;
    const t = setTimeout(arrived, fast ? 150 : ARRIVE_MS);
    return () => clearTimeout(t);
  }, [phase, arrived, fast]);

  useEffect(() => {
    if (!active) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.ceil(w / BLOCK);
    canvas.height = Math.ceil(h / BLOCK);
    const cols = canvas.width;
    const rows = canvas.height;
    // ordem dos blocos: do centro para fora, com um pouco de sorte no meio
    const order = new Float32Array(cols * rows);
    const maxD = Math.hypot(cols / 2, rows / 2);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = Math.hypot(x + 0.5 - cols / 2, (y + 0.5 - rows / 2) * 1.2) / maxD;
        order[y * cols + x] = Math.min(1, d * 0.75 + Math.random() * 0.3);
      }
    }
    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = now - start;
      // quanto da tela ainda está coberta pelos blocos (0..1 de "aberto")
      let open: number;
      if (leaving) open = fast ? 0 : 1 - Math.min(1, t / LEAVE_MS);
      else open = fast ? Math.min(1, t / 150) : Math.max(0, Math.min(1, (t - REVEAL_FROM) / (ARRIVE_MS - REVEAL_FROM - 60)));
      ctx.clearRect(0, 0, cols, rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const o = order[y * cols + x];
          if (o < open) continue;
          // bloco quase saindo fica um tom mais claro: a "borda" da onda de pixels
          ctx.fillStyle = o - open < 0.05 ? '#3d3166' : PAL.night;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      if ((leaving && t < LEAVE_MS + 50) || (!leaving && open < 1)) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, leaving, fast]);

  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[80] overflow-hidden">
      <canvas ref={ref} className="plaza-canvas absolute inset-0 h-full w-full" />
      {!leaving && !fast && (
        <>
          <div className="plaza-intro-stars absolute inset-0" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="plaza-intro-globe relative">
              <Globe size={150} />
              <div className="plaza-intro-ping absolute top-[30%] left-1/2 h-10 w-10 rounded-full border-4 border-[#ffe6a0]" />
              <svg className="plaza-intro-pin absolute top-[30%] left-1/2" width="24" height="30" viewBox="0 0 8 10" shapeRendering="crispEdges" style={{ marginLeft: -12, marginTop: -30 }} aria-hidden="true">
                <path d="M2 0h4v1h1v1h1v3h-1v1h-1v1h-1v1h-1v2h-0v-2h-1v-1h-1v-1h-1v-1h-1v-3h1v-1h1z" fill="#1b1430" />
                <path d="M2 1h4v1h1v3h-1v1h-1v1h-2v-1h-1v-1h-1v-3h1z" fill="#e8685a" />
                <path d="M3 2h2v2h-2z" fill="#ffe6a0" />
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export type { PlazaLayout };
