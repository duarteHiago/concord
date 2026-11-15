// Praça do servidor: o servidor como um lugar em pixel art isométrico. Cada sala de voz é uma mesa (clicar
// leva o boneco até ela e entra na call), a TV acende quando alguém transmite, e a conversa é por balão,
// só para quem está na praça. Quem está numa call aparece sentado, mesmo sem ter aberto a praça.
import { DoorOpen, Eye, EyeOff, Hammer, Hand, LogOut, MonitorUp, Maximize2, MessageSquare, Mic, MicOff, Minus, Plus, Headphones, HeadphoneOff, Shirt, X, Send, Crosshair, Lock, Radio } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { P, has } from '../../../../shared/permissions.ts';
import {
  DRINKS,
  FLOOR_TABLES,
  GROUND_TABLES,
  MAX_FLOORS,
  floorName,
  planFloors,
  EMOTES,
  NEAR_RADIUS,
  nearCounter,
  SAY_MAX,
  defaultAvatar,
  defaultStyle,
  distance,
  footprint,
  layoutFor,
  proximityVolume,
  findPath,
  nearestWalkable,
  walkable,
  type Facing,
  type Furniture,
  type PlaceStyle,
  type PlazaAvatar,
  type PlazaLayout,
  type Point,
  MAX_HALL_DOORS,
  type Scene,
} from '../../../../shared/plaza.ts';
import { memberName, type Channel, type Member, type Presence, type VoiceState } from '../../lib/types';
import { reduceMotion } from '../../lib/motion';
import { useApp } from '../../store/app';
import { getSocket } from '../../lib/socket';
import { usePlaza } from '../../store/plaza';
import { usePlazaVoice } from '../../store/plazaVoice';
import { usePlazaPeek } from '../../store/plazaPeek';
import { toast } from '../../store/toast';
import { useVoice } from '../../store/voice';
import { cx } from '../ui';
import { AvatarEditor } from './AvatarEditor';
import { StreamPip } from './StreamPip';
import { TvShareMenu } from './TvShareMenu';
import { PlaceEditor, type EditorTool } from './PlaceEditor';
import { api } from '../../lib/api';
import { Globe } from './Globe';
import { at, drawAvatar, drawCup, drawItem, lampLight, outlineTiles, PAL, renderStatic, sceneObjects, tileAt, type Pose } from './pixels';

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
  /** onde o boneco estava (lugar e andar): mudou, ele aparece direto no lugar novo, sem atravessar a sala */
  where: string;
}

/** O lugar onde o boneco está (lugar, andar e quarto): só quem está no mesmo lugar aparece e se ouve. */
const placeKey = (wk: { scene: string; floor?: number; roomOf?: string | null }) => `${wk.scene}:${wk.floor ?? 0}:${wk.roomOf ?? ''}`;

/** O que o dono do quarto está fazendo agora, pelo Concord aberto: jogando, no computador, ou longe (dormindo). */
function ownerMode(presence: Presence | undefined): 'game' | 'desk' | 'bed' {
  if (!presence) return 'bed';
  return presence.activities?.some((a) => a.type === 'playing') ? 'game' : 'desk';
}
const MODE_ICON = { game: '🎮', desk: '💻', bed: '💤' } as const;
const MODE_TEXT = { game: 'jogando', desk: 'no computador', bed: 'dormindo' } as const;

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
  /** sentado numa cadeira: o meio da mesa (para pôr a bebida em cima dela) */
  table?: { x: number; y: number };
  /** o dono do quarto, aparecendo onde está (no computador ou no videogame) */
  nook?: 'desk' | 'game';
}

const NO_SEATS = new Map<string, { table: number; seat: number }>();

/** O móvel cabe ali? (o mesmo teste do servidor, menos a passagem, que é conferida ao salvar) */
function canPlace(draft: PlaceStyle, it: Furniture, scene: Scene, tableCount: number) {
  return layoutFor(scene, tableCount, { ...draft, items: [...draft.items, it] }).items.length === draft.items.length + 1;
}

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
  const floorsAll = usePlaza((s) => s.floors);
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
  // no corredor dos quartos ou no quarto de alguém (o id do dono)
  const myRoom = myScene === 'room' ? (walkers[me.id]?.roomOf ?? null) : null;
  const online = useApp((s) => s.online);
  const rooms = usePlaza((s) => s.rooms);
  // as portas do corredor: a minha primeiro, depois quem está online, depois o resto (até MAX_HALL_DOORS)
  const hallDoors = useMemo(() => {
    const others = (detail?.members ?? []).filter((m) => m.id !== me.id);
    others.sort((a, b) => Number(!!online[b.id]) - Number(!!online[a.id]) || memberName(a).localeCompare(memberName(b)));
    return [me.id, ...others.map((m) => m.id)].slice(0, MAX_HALL_DOORS);
  }, [detail?.members, online, me.id]);
  // andar onde eu estou (lá dentro) e as mesas dele
  const myFloor = inside ? (walkers[me.id]?.floor ?? 0) : 0;
  const hasFloors = floorsAll.length > 1;
  const tables = useMemo(() => floorsAll[myFloor] ?? [], [floorsAll, myFloor]);
  const [floorMenu, setFloorMenu] = useState(false);
  const setFloorMenuRef = useRef(setFloorMenu);
  // editor da Praça (quem gerencia o servidor): o rascunho de como este lugar vai ficar
  const places = usePlaza((s) => s.places);
  const canManage = has(detail?.permissions ?? 0, P.MANAGE_SERVER);
  const [draft, setDraft] = useState<PlaceStyle | null>(null);
  const [tool, setTool] = useState<EditorTool>('select');
  const [rot, setRot] = useState<0 | 1>(0);
  const [itemColor, setItemColor] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [savingPlace, setSavingPlace] = useState(false);
  const layout = useMemo(() => {
    if (myScene === 'hall') return layoutFor('hall', hallDoors.length);
    if (myScene === 'room') return layoutFor('room', 0, draft ?? rooms[myRoom ?? ''] ?? null);
    return layoutFor(myScene, tables.length, draft ?? places[myScene], myFloor);
  }, [myScene, tables.length, draft, places, myFloor, hallDoors.length, rooms, myRoom]);
  // a porta do quarto onde estou, no corredor (para sair dele de volta na frente dela)
  const backX = myRoom ? (layoutFor('hall', hallDoors.length).doors[hallDoors.indexOf(myRoom)]?.x ?? undefined) : undefined;
  const doorRefs = useRef(new Map<number, HTMLDivElement>());
  const editRef = useRef({ draft, tool, rot, itemColor, selected, hover: null as Point | null, tableCount: tables.length });
  editRef.current = { ...editRef.current, draft, tool, rot, itemColor, selected, tableCount: tables.length };
  // mini TV flutuante com a transmissão de alguém (id de quem transmite)
  const [pip, setPip] = useState<string | null>(null);
  const [tvMenu, setTvMenu] = useState(false);
  // cardápio do balcão (a coluna do balcão clicada, para ir até ali)
  const [barMenu, setBarMenu] = useState<number | null>(null);
  const setBarMenuRef = useRef(setBarMenu);
  // o cardápio fica em cima do balcão (o laço de desenho posiciona e fecha se o boneco sair de perto)
  const barRef = useRef<HTMLDivElement>(null);
  const barColRef = useRef<number | null>(null);
  useEffect(() => {
    barColRef.current = barMenu;
  }, [barMenu]);
  // mesa clicada (fora de call): sentar ou espiar
  const [tableMenu, setTableMenu] = useState<number | null>(null);
  const peeking = usePlazaPeek((s) => s.channelId);
  const peekUntil = usePlazaPeek((s) => s.until);
  const whispering = usePlazaPeek((s) => s.whispering);
  const peekNear = usePlazaPeek((s) => s.near);
  const allPeeks = usePlaza((s) => s.peeks[serverId]);
  const closedTables = usePlaza((s) => s.closed[serverId]);
  const pendingWatch = useRef<string | null>(null);
  const [wipe, setWipe] = useState(0);
  const channelById = useMemo(() => new Map((detail?.channels ?? []).map((c) => [c.id, c])), [detail?.channels]);
  const memberById = useMemo(() => new Map((detail?.members ?? []).map((m) => [m.id, m])), [detail?.members]);

  // tudo o que o laço de desenho lê sem precisar recriar o laço
  const live = useRef({ layout, inside, tables, channelById, memberById, voiceStates: voiceStates ?? [], voiceChannelId, room: myRoom, backX, hallDoors });
  live.current = { layout, inside, tables, channelById, memberById, voiceStates: voiceStates ?? [], voiceChannelId, room: myRoom, backX, hallDoors };

  const world = useRef({
    anims: new Map<string, Anim>(),
    figures: [] as Figure[],
    cam: null as Point | null,
    pan: { x: 0, y: 0 },
    pendingJoin: null as { channelId: string; table: number } | null,
    /** fui andando até a porta: ao chegar, troca de lugar */
    pendingDoor: false,
    /** pedi uma bebida longe do balcão: ao chegar nele, pede */
    pendingDrink: null as string | null,
    /** fui andando até o elevador: ao chegar, abre a escolha do andar */
    pendingElevator: false,
    /** fui andando até a porta de um quarto, no corredor: ao chegar, entra (o dono) */
    pendingRoom: null as string | null,
    /** fui andando até o balcão: ao chegar, abre o cardápio (a coluna do balcão clicada) */
    pendingBar: null as number | null,
    /** quando o volume da voz do lobby foi recalculado pela última vez */
    volumesAt: 0,
    /** ouvir de perto: última checagem, última renovação, tentativa em andamento, falhas recentes por mesa */
    nearAt: 0,
    nearRenewAt: 0,
    nearStarting: false,
    nearFail: new Map<string, number>(),
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
      const key = `${layout.kind}:${layout.w}x${layout.h}:${layout.floor}:${layout.wall}:${JSON.stringify(layout.items.filter((i) => i.k === 'rug'))}`;
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
        if (wk.scene !== scene || (scene === 'inside' && (wk.floor ?? 0) !== layout.level) || (scene === 'room' && (wk.roomOf ?? null) !== L.room)) {
          w.anims.delete(id);
          continue;
        }
        let a = w.anims.get(id);
        if (!a) {
          a = { x: wk.x, y: wk.y, goal: { x: wk.x, y: wk.y }, path: [], facing: 1, walked: 0, where: placeKey(wk) };
          w.anims.set(id, a);
        }
        const where = placeKey(wk);
        if (a.where !== where) {
          // trocou de lugar (porta, elevador): aparece na chegada, sem caminhar desde a posição antiga
          Object.assign(a, { x: wk.x, y: wk.y, goal: { x: wk.x, y: wk.y }, path: [], where });
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
      if (pv.status === 'connected' && now - w.volumesAt > 100) {
        w.volumesAt = now;
        const mine2 = meId ? w.anims.get(meId) : undefined;
        const volumes = new Map<string, number>();
        if (mine2) for (const [id, a] of w.anims) if (id !== meId) volumes.set(id, proximityVolume(distance(a, mine2)));
        pv.setVolumes(volumes);
      }

      // espiando uma mesa: o som dela cai conforme me afasto
      const peek = usePlazaPeek.getState();
      const meAnim = meId ? w.anims.get(meId) : undefined;
      if (peek.channelId && meAnim) {
        const ti = L.tables.indexOf(peek.channelId);
        const tb = layout.tables[ti];
        if (tb) {
          const d = distance(meAnim, { x: tb.x + 0.5, y: tb.y + 0.5 });
          // de perto: vai sumindo até a borda do alcance; espiando: o volume normal da proximidade
          peek.setVolume(peek.near ? Math.max(0.12, 1 - Math.max(0, d - 1.5) / (NEAR_RADIUS - 1)) : proximityVolume(Math.max(0, d - 1.5)));
        }
      }

      // ouvir de perto: chegou perto de uma mesa com gente (lá dentro, fora de call), começa a ouvir; saiu, para
      if (L.inside && !L.voiceChannelId && meAnim && now - w.nearAt > 400 && (!peek.channelId || peek.near) && !w.nearStarting) {
        w.nearAt = now;
        let best: { ch: string; d: number } | null = null;
        const closedNow = usePlaza.getState().closed[serverId] ?? [];
        layout.tables.forEach((tb, i) => {
          const ch = L.tables[i];
          const c = ch ? L.channelById.get(ch) : undefined;
          if (!ch || !c || !has(c.permissions, P.CONNECT) || closedNow.includes(ch)) return;
          if (!L.voiceStates.some((v) => v.channelId === ch)) return;
          if ((w.nearFail.get(ch) ?? 0) > now) return;
          const d = distance(meAnim, { x: tb.x + 0.5, y: tb.y + 0.5 });
          if (d <= NEAR_RADIUS && (!best || d < best.d)) best = { ch, d };
        });
        const target = best as { ch: string; d: number } | null;
        if (target && peek.channelId !== target.ch) {
          w.nearStarting = true;
          void peek.start(serverId, target.ch, true).then((ok) => {
            w.nearStarting = false;
            w.nearRenewAt = performance.now();
            if (!ok) w.nearFail.set(target.ch, performance.now() + 15_000);
          });
        } else if (!target && peek.channelId && peek.near) {
          peek.stop();
        } else if (target && peek.near && now - w.nearRenewAt > 7000) {
          w.nearRenewAt = now;
          peek.renew();
        }
      } else if ((!L.inside || L.voiceChannelId) && peek.near && peek.channelId) {
        peek.stop();
      }

      // cheguei no elevador: escolhe o andar
      if (w.pendingElevator && meAnim && !meAnim.path.length && layout.elevator && meAnim.x === layout.elevator.x && meAnim.y === layout.elevator.y) {
        w.pendingElevator = false;
        setFloorMenuRef.current(true);
      }

      // cheguei no balcão: abre o cardápio
      if (w.pendingBar !== null && meAnim && !meAnim.path.length && nearCounter(layout, { x: Math.round(meAnim.x), y: Math.round(meAnim.y) })) {
        setBarMenuRef.current(w.pendingBar);
        w.pendingBar = null;
      }

      // cheguei no balcão com um pedido: pede a bebida
      if (w.pendingDrink && meAnim && !meAnim.path.length && nearCounter(layout, { x: Math.round(meAnim.x), y: Math.round(meAnim.y) })) {
        plaza.drink(w.pendingDrink);
        w.pendingDrink = null;
      }

      // cheguei na porta: troca de lugar (o servidor confere)
      const atDoor = meId ? w.anims.get(meId) : undefined;
      if (w.pendingDoor && atDoor && !atDoor.path.length && atDoor.x === layout.door.x && atDoor.y === layout.door.y) {
        w.pendingDoor = false;
        plaza.door(L.backX);
      }

      // no corredor, cheguei na frente da porta de um quarto: entra
      if (w.pendingRoom && meAnim && !meAnim.path.length && layout.kind === 'hall') {
        const i = L.hallDoors.indexOf(w.pendingRoom);
        const d = layout.doors[i];
        if (d && meAnim.x === d.x && meAnim.y === d.y) plaza.enterRoom(w.pendingRoom);
        w.pendingRoom = null;
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
          figs.push({ userId, avatar, x: s.x + 0.5, y: s.y + 0.5, facing: s.facing, pose: 'sit', seated: true, bob: 0, fx: p.x, fy: p.y + 2, table: { x: tb.x + 1, y: tb.y + 1 } });
        } else {
          const o = STANDING[(seat - tb.seats.length) % STANDING.length];
          const sx = tb.x + o.dx;
          const sy = tb.y + o.dy;
          const p = at(sx + 0.5, sy + 0.5);
          figs.push({ userId, avatar, x: sx + 0.5, y: sy + 0.5, facing: 3, pose: 'stand', seated: true, bob: 0, fx: p.x, fy: p.y });
        }
      }
      // no quarto: o dono aparece no computador ou no videogame (se não estiver andando por ali); longe, na cama
      const nookLook = { desk: false, game: false, sleeper: null as PlazaAvatar | null };
      if (layout.nook && L.room && !w.anims.has(L.room)) {
        const n = layout.nook;
        const owner = L.room;
        const avatar = plaza.walkers[owner]?.avatar ?? plaza.avatars[owner] ?? defaultAvatar(owner);
        const mode = ownerMode(useApp.getState().online[owner]);
        if (mode === 'bed') nookLook.sleeper = avatar;
        else {
          nookLook[mode] = true;
          const spot = mode === 'desk' ? { x: n.desk.x + 1, y: n.desk.y + 1.45, z: 8 } : { x: n.pouf.x + 0.5, y: n.pouf.y + 0.5, z: 6 };
          const p = at(spot.x, spot.y, spot.z);
          figs.push({ userId: owner, avatar, x: spot.x, y: spot.y, facing: 3, pose: 'sit', seated: false, bob: 0, fx: p.x, fy: p.y + 2, nook: mode });
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
      for (const it of layout.items) if (it.k === 'lamp') lampLight(lctx, it.x, it.y);

      // editor: contorno do móvel selecionado e a prévia de onde o novo vai
      const ed = editRef.current;
      if (ed.draft) {
        const sel = ed.selected !== null ? ed.draft.items[ed.selected] : undefined;
        if (sel) outlineTiles(lctx, footprint(sel), 'rgba(255, 230, 160, 0.45)');
      }

      const looks = L.tables.map((channelId) => {
        const ch = channelId ? L.channelById.get(channelId) : undefined;
        return {
          locked: !channelId || !ch || !has(ch.permissions, P.CONNECT),
          live: !!channelId && L.voiceStates.some((v) => v.channelId === channelId && v.streaming),
        };
      });
      const items = sceneObjects(layout, looks, PAL.coral, now, nookLook);
      for (const f of figs) {
        // lá dentro, quem fala na call da mesa; no lobby, quem fala na voz da praça
        const speaking = f.seated ? !!voice.speaking[f.userId] : !!pv.speaking[f.userId];
        // sentado e mutado: dorme na mesa; sentado e jogando (o app desktop detecta): console na mão
        const vs = f.seated ? L.voiceStates.find((v) => v.userId === f.userId) : undefined;
        const sleeping = !!vs && (vs.muted || vs.deafened) && f.pose === 'sit';
        const playing = f.nook === 'game' || (f.seated && !!useApp.getState().online[f.userId]?.activities?.some((a) => a.type === 'playing'));
        const wk = plaza.walkers[f.userId];
        const drinkColor = wk?.drink ? (DRINKS.find((d) => d.id === wk.drink)?.color ?? null) : null;
        // sentado numa cadeira, a bebida fica em cima da mesa (na frente de quem pediu), não na mão
        const onTable = !!f.table && !!drinkColor;
        items.push({
          depth: f.x + f.y + (f.seated ? 0.05 : 0),
          draw: (ctx) => drawAvatar(ctx, f.avatar, f.facing, f.pose, f.fx, f.fy, { speaking: speaking && !sleeping, bob: f.bob, t: now, sleeping, console: playing, drink: onTable ? null : drinkColor }),
        });
        if (onTable) {
          const tbl = f.table!;
          const cx = f.x + (tbl.x - f.x) * 0.45;
          const cy = f.y + (tbl.y - f.y) * 0.45;
          const pt = at(cx, cy, 14);
          items.push({ depth: tbl.x + tbl.y + 0.2, draw: (ctx) => drawCup(ctx, pt.x, pt.y, drinkColor!) });
        }
      }
      items.sort((p, q) => p.depth - q.depth);
      for (const it of items) it.draw(lctx);
      if (ed.draft && ed.tool !== 'select' && ed.hover) {
        const ghost: Furniture = { k: ed.tool, x: ed.hover.x, y: ed.hover.y, r: ed.rot, c: ed.itemColor };
        const ok = canPlace(ed.draft, ghost, layout.kind, ed.tableCount);
        outlineTiles(lctx, footprint(ghost), ok ? 'rgba(58, 208, 122, 0.4)' : 'rgba(255, 77, 94, 0.4)');
        if (ok) {
          lctx.globalAlpha = 0.65;
          drawItem(lctx, ghost, layout.kind, now);
          lctx.globalAlpha = 1;
        }
      }

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
      layout.doors.forEach((d, i) => {
        const el = doorRefs.current.get(i);
        if (!el) return;
        const q = at(d.x + 0.5, d.y, 52);
        const p = toCss(q.x, q.y);
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      });
      if (barRef.current && barColRef.current !== null) {
        const meA = meId ? w.anims.get(meId) : undefined;
        if (layout.kind !== 'inside' || layout.level !== 0 || (meA && !meA.path.length && !nearCounter(layout, { x: Math.round(meA.x), y: Math.round(meA.y) }))) {
          barColRef.current = null;
          setBarMenuRef.current(null);
        } else {
          const s = at(barColRef.current + 0.5, 1.5, 34);
          const p = toCss(s.x, s.y);
          barRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        }
      }
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
    w.pendingRoom = null;
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
    // fora de call: escolher entre sentar e espiar
    setTableMenu(i);
  };

  const sitAt = (i: number) => {
    const channelId = tables[i];
    const tb = layout.tables[i];
    setTableMenu(null);
    if (!channelId || !tb) return;
    usePlazaPeek.getState().stop();
    world.current.pendingJoin = { channelId, table: i };
    moveMe(tb.front, true);
  };

  const peekAt = (i: number) => {
    const channelId = tables[i];
    const tb = layout.tables[i];
    setTableMenu(null);
    if (!channelId || !tb) return;
    moveMe(tb.front);
    void usePlazaPeek.getState().start(serverId, channelId);
  };

  const down = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY, panX: world.current.pan.x, panY: world.current.pan.y, moved: false };
    setCard(null);
  };
  const tileUnder = (e: React.PointerEvent | PointerEvent, lift = 0) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { x: vx, y: vy, scale, dpr } = world.current.view;
    return tileAt(((e.clientX - rect.left) * dpr) / scale + vx, ((e.clientY - rect.top) * dpr) / scale + vy + lift);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draft) editRef.current.hover = tileUnder(e);
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

    // editor: põe o móvel escolhido ou seleciona o que está ali
    if (draft) {
      if (tool === 'select') {
        for (const lift of [0, 12, 24]) {
          const t = tileUnder(e, lift);
          let idx = -1;
          draft.items.forEach((it, i) => {
            if (footprint(it).some((f) => f.x === t.x && f.y === t.y) && (idx < 0 || draft.items[idx].k === 'rug')) idx = i;
          });
          if (idx >= 0) return setSelected(idx);
        }
        return setSelected(null);
      }
      const t = tileUnder(e);
      const it: Furniture = { k: tool, x: t.x, y: t.y, r: rot, c: itemColor };
      if (!canPlace(draft, it, layout.kind, tables.length)) return toast.info('Não cabe aí.');
      setDraft({ ...draft, items: [...draft.items, it] });
      return;
    }

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
        // a TV da minha mesa, sem ninguém transmitindo: ligar a TV com a minha tela
        if (onTv && !streamer && voiceChannelId === tables[i]) return setTvMenu(true);
        return clickTable(i);
      }
    }
    // no corredor, clicar numa porta (ou na casa na frente dela) vai até ela e entra no quarto
    if (layout.kind === 'hall') {
      for (const off of [0, 12, 24, 36]) {
        const b = tileAt(nx, ny + off);
        const i = layout.doors.findIndex((d) => b.x === d.x && (b.y === d.y || b.y === d.y - 1));
        if (i >= 0 && hallDoors[i]) return goRoom(i);
      }
    }
    // lá dentro, clicar no elevador (a porta na parede ou a casa dele) leva até ele
    if (layout.elevator) {
      const ev = layout.elevator;
      for (const off of [0, 12, 24, 36]) {
        const b = tileAt(nx, ny + off);
        if ((b.x === ev.x && b.y === ev.y) || (b.x === ev.x && b.y === ev.y - 1)) {
          const mine = usePlaza.getState().walkers[me.id];
          if (mine && mine.x === ev.x && mine.y === ev.y) setFloorMenu(true);
          else {
            moveMe(ev);
            world.current.pendingElevator = true;
          }
          return;
        }
      }
    }
    // 3) lá dentro, clicar no balcão abre o cardápio de bebidas
    if (layout.kind === 'inside' && layout.level === 0) {
      const { x0, x1 } = layout.building;
      for (const off of [0, 10, 20, 30, 40]) {
        const b = tileAt(nx, ny + off);
        if (b.x >= x0 && b.x <= x1 && b.y >= 0 && b.y <= 2) {
          // o cardápio só abre no balcão: longe dele, o boneco vai até lá primeiro
          const col = Math.min(x1, Math.max(x0, b.x));
          const mine = usePlaza.getState().walkers[me.id];
          if (mine && nearCounter(layout, mine)) setBarMenu(col);
          else {
            moveMe(nearestWalkable(layout, { x: col, y: 3 }));
            world.current.pendingBar = col;
          }
          return;
        }
      }
    }
    // no lobby, clicar no prédio leva até a porta
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
      if (draft) {
        if (e.key === 'Escape') {
          if (selected !== null) setSelected(null);
          else setTool('select');
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
          setDraft({ ...draft, items: draft.items.filter((_, j) => j !== selected) });
          setSelected(null);
        } else if (e.key === 'r' || e.key === 'R') {
          if (selected !== null) setDraft({ ...draft, items: draft.items.map((it, j) => (j === selected ? { ...it, r: it.r ? 0 : 1 } : it)) });
          else setRot(rot ? 0 : 1);
        }
        return;
      }
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
    const mine = walkers[me.id];
    const ids = new Set<string>(Object.values(walkers).filter((w) => mine && placeKey(w) === placeKey(mine)).map((w) => w.userId));
    if (inside) for (const id of seating.keys()) ids.add(id);
    if (myRoom && ownerMode(online[myRoom]) !== 'bed') ids.add(myRoom);
    return [...ids];
  }, [walkers, seating, inside, me.id, myRoom, online]);

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
    setFloorMenu(false);
  }, [myScene, myFloor, myRoom]);

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

  // voz por proximidade: vale na praça e dentro do prédio; desliga durante uma call (para não ouvir duas conversas)
  const lobbyVoice = phase === 'ready' && !voiceChannelId;

  // espiada acaba ao entrar numa call ou ao sair da praça
  useEffect(() => {
    if (voiceChannelId) usePlazaPeek.getState().stop();
  }, [voiceChannelId]);
  useEffect(
    () => () => {
      usePlazaPeek.getState().stop();
    },
    [],
  );

  // entrei numa call com a praça aberta (pela lista, por exemplo): o boneco vai direto para a mesa, lá dentro
  const prevCall = useRef(voiceChannelId);
  useEffect(() => {
    // (na praça, ou lá dentro mas em outro andar)
    if (voiceChannelId && voiceChannelId !== prevCall.current && (!inside || !tables.includes(voiceChannelId))) usePlaza.getState().table();
    prevCall.current = voiceChannelId;
  }, [voiceChannelId, inside, tables]);
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

  // no corredor e lá em cima não há porta para a praça: o botão leva ao elevador
  const goDoor = () => {
    if (layout.door.x >= 0) return moveMe(layout.door);
    if (!layout.elevator) return;
    moveMe(layout.elevator);
    world.current.pendingElevator = true;
  };
  const goRoom = (i: number) => {
    const d = layout.doors[i];
    const owner = hallDoors[i];
    if (!d || !owner) return;
    const mine = usePlaza.getState().walkers[me.id];
    if (mine && mine.x === d.x && mine.y === d.y) return usePlaza.getState().enterRoom(owner);
    moveMe(d);
    world.current.pendingRoom = owner;
  };
  // entrei num quarto: a cara do dono (ele pode não estar na praça)
  useEffect(() => {
    if (myRoom) usePlaza.getState().fetchAvatars([myRoom]);
  }, [myRoom]);

  // ---- editor ----
  const startEdit = () => {
    const saved = myScene === 'room' ? rooms[me.id] : places[myScene];
    setDraft(structuredClone(saved ?? defaultStyle(myScene, tables.length)));
    setTool('select');
    setSelected(null);
    setCard(null);
  };
  const stopEdit = () => {
    setDraft(null);
    setSelected(null);
    editRef.current.hover = null;
  };
  // trocou de lugar no meio da edição: o rascunho era do outro lugar, então sai do editor
  const prevScene = useRef(myScene);
  useEffect(() => {
    if (prevScene.current === myScene) return;
    prevScene.current = myScene;
    setDraft(null);
    setSelected(null);
  }, [myScene]);
  const savePlace = async () => {
    if (!draft) return;
    setSavingPlace(true);
    try {
      if (myScene === 'room') {
        await api.put('/me/plaza-room', { style: draft });
        usePlaza.setState({ rooms: { ...usePlaza.getState().rooms, [me.id]: draft } });
        stopEdit();
        toast.success('Quarto salvo.');
        return;
      }
      await api.put(`/servers/${serverId}/plaza/place`, { scene: myScene, style: draft });
      usePlaza.setState({ places: { ...usePlaza.getState().places, [myScene]: draft } });
      stopEdit();
      toast.success(myScene === 'lobby' ? 'Praça salva.' : 'Prédio salvo.');
    } catch (err) {
      toast.error(err);
    } finally {
      setSavingPlace(false);
    }
  };

  const myVoice = voiceStates?.find((v) => v.userId === me.id);
  const myChannel = voiceChannelId ? channelById.get(voiceChannelId) : undefined;
  const count = Object.values(walkers).filter((w) => walkers[me.id] && placeKey(w) === placeKey(walkers[me.id])).length;
  const roomOwner = myRoom ? memberById.get(myRoom) : undefined;
  const title =
    myScene === 'room'
      ? myRoom === me.id
        ? 'Seu quarto'
        : `Quarto de ${roomOwner ? memberName(roomOwner) : 'alguém'}`
      : myScene === 'hall'
        ? `Quartos · ${detail?.server.name ?? ''}`
        : inside
          ? `Dentro de ${detail?.server.name ?? ''}${hasFloors ? ` · ${floorName(myFloor)}` : ''}`
          : `Praça · ${detail?.server.name ?? ''}`;
  // pode montar: a praça e o prédio (térreo), quem gerencia; o quarto, só o dono
  const canEdit = myScene === 'room' ? myRoom === me.id : myScene !== 'hall' && canManage && myFloor === 0;

  return (
    <div className="plaza-root fixed inset-0 z-[60] overflow-hidden select-none" style={{ background: PAL.night }}>
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
      <div ref={signRef} className={cx('pointer-events-none absolute top-0 left-0', (myScene === 'hall' || myScene === 'room') && 'hidden')}>
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

      {/* no corredor, o nome em cima de cada porta e o que a pessoa está fazendo (clicar leva até lá) */}
      {layout.doors.map((_, i) => {
        const id = hallDoors[i];
        const m = id ? memberById.get(id) : undefined;
        if (!id) return null;
        const mode = ownerMode(online[id]);
        return (
          <div key={id} ref={(el) => void (el ? doorRefs.current.set(i, el) : doorRefs.current.delete(i))} className="absolute top-0 left-0">
            <button
              onClick={() => goRoom(i)}
              title={`${id === me.id ? 'Seu quarto' : `Quarto de ${m ? memberName(m) : 'alguém'}`}: ${MODE_TEXT[mode]}`}
              className={cx(
                'pointer-events-auto flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow',
                id === me.id ? 'border-[#e8685a] bg-[#1b1430]/90 text-white' : 'border-white/10 bg-[#1b1430]/85 text-white/85',
              )}
            >
              <span>{MODE_ICON[mode]}</span>
              <span className="max-w-[90px] truncate">{id === me.id ? 'Você' : m ? memberName(m) : 'alguém'}</span>
            </button>
          </div>
        );
      })}

      {/* nomes, ícones, balões e gestos em cima de cada boneco */}
      {people.map((id) => (
        <div key={id} ref={(el) => void (el ? labelRefs.current.set(id, el) : labelRefs.current.delete(id))} className="pointer-events-none absolute top-0 left-0" style={{ display: 'none' }}>
          <PersonTag
            member={memberById.get(id)}
            isMe={id === me.id}
            voice={(voiceStates ?? []).find((v) => v.userId === id)}
            idle={
              (!seating.has(id) && !!walkers[id] && Date.now() - walkers[id].activeAt > IDLE_MS) ||
              (inside && seating.has(id) && !!(voiceStates ?? []).find((v) => v.userId === id && (v.muted || v.deafened)))
            }

            bubbles={bubbles.filter((b) => b.userId === id)}
            peeking={(allPeeks ?? []).find((p) => p.userId === id && p.until > Date.now())?.near ? 'near' : (allPeeks ?? []).some((p) => p.userId === id && p.until > Date.now()) ? 'peek' : undefined}
            emote={emotes[id]}
          />
        </div>
      ))}
      </div>

      {/* topo: servidor e quantos estão na praça */}
      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1b1430]/80 py-1.5 pr-3.5 pl-1.5 text-white shadow-lg backdrop-blur">
        <Globe size={30} />
        <div className="leading-tight">
          <div className="plaza-pixel text-[15px] font-bold">{title}</div>
          <div className="text-[11px] text-white/60">
            {count} {count === 1 ? 'pessoa' : 'pessoas'} {myScene === 'lobby' ? 'na praça' : 'aqui'}
            {myRoom && myRoom !== me.id && ` · dono ${MODE_TEXT[ownerMode(online[myRoom])]}`}
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
        {canEdit && !draft && (
          <button onClick={startEdit} title={myScene === 'room' ? 'Montar o seu quarto' : inside ? 'Montar o prédio' : 'Montar a praça'} className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-[#1b1430]/85 px-3 text-sm font-semibold text-white shadow-lg backdrop-blur hover:bg-[#2b2350]">
            <Hammer size={15} /> Montar
          </button>
        )}
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
          Clique no chão para andar (ou use as setas). A conversa é <b>por proximidade</b>, aqui fora e dentro do prédio: ligue o microfone e quem estiver perto te ouve, e os balões do lado de fora só chegam a quem está perto. Quem está sentado numa mesa está na call, e não ouve a praça. As calls ficam <b>dentro do prédio</b>: entre pela porta e clique numa mesa para sentar. Clique na TV de uma mesa para assistir a transmissão numa telinha. O que você escreve vira balão e <b>não fica salvo</b>.
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
          <LobbyMic inCall={!!voiceChannelId} />
          <span className="mx-0.5 h-6 w-px bg-white/15" />
          <button onClick={goDoor} className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-white hover:bg-white/10">
            <DoorOpen size={16} /> {myScene === 'room' ? 'Sair do quarto' : myScene === 'hall' || (inside && myFloor > 0) ? 'Elevador' : inside ? 'Voltar à praça' : 'Entrar no prédio'}
          </button>
        </div>
        {myChannel && (
          <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-[#1b1430]/85 p-1.5 pl-3 text-white shadow-lg backdrop-blur">
            <div className="mr-1 max-w-[140px] truncate text-xs leading-tight">
              <div className="text-white/50">Na mesa</div>
              <div className="font-semibold">#{myChannel.name}</div>
            </div>
            <VoiceButtons myVoice={myVoice} />
            <HudButton
              label={closedTables?.includes(voiceChannelId!) ? 'Mesa fechada para espiadas (clique para abrir)' : 'Mesa aberta para espiadas (clique para fechar)'}
              flat
              active={closedTables?.includes(voiceChannelId!)}
              onClick={() => getSocket()?.emit('plaza:close-table', { channelId: voiceChannelId, closed: !closedTables?.includes(voiceChannelId!) })}
            >
              {closedTables?.includes(voiceChannelId!) ? <EyeOff size={17} /> : <Eye size={17} />}
            </HudButton>
            <HudButton label="TV da mesa: transmitir a tela" flat onClick={() => setTvMenu(true)}>
              <MonitorUp size={17} />
            </HudButton>
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
      {draft && (
        <PlaceEditor
          scene={myScene}
          draft={draft}
          setDraft={setDraft}
          tool={tool}
          setTool={setTool}
          rot={rot}
          setRot={setRot}
          color={itemColor}
          setColor={setItemColor}
          selected={selected}
          setSelected={setSelected}
          saving={savingPlace}
          onSave={() => void savePlace()}
          onCancel={stopEdit}
          onReset={() => {
            setDraft(defaultStyle(myScene, tables.length));
            setSelected(null);
          }}
        >
          {inside && <FloorAssign serverId={serverId} channels={(detail?.channels ?? []).filter((c) => c.type === 'voice').sort((a, b) => a.position - b.position)} />}
        </PlaceEditor>
      )}
      {tvMenu && <TvShareMenu onClose={() => setTvMenu(false)} />}
      {floorMenu && (
        <FloorMenu
          inHall={myScene === 'hall'}
          onHall={() => {
            setFloorMenu(false);
            usePlaza.getState().goHall();
          }}
          floors={floorsAll}
          current={inside ? myFloor : -1}
          channelName={(id) => (id ? channelById.get(id)?.name : undefined)}
          onPick={(f) => {
            setFloorMenu(false);
            usePlaza.getState().goFloor(f);
          }}
          onClose={() => setFloorMenu(false)}
        />
      )}
      {barMenu !== null && (
        <div ref={barRef} className="absolute top-0 left-0 z-[64]">
          <BarMenu
            holding={walkers[me.id]?.drink ?? null}
            onPick={(drink) => {
              setBarMenu(null);
              usePlaza.getState().drink(drink);
            }}
            onClose={() => setBarMenu(null)}
          />
        </div>
      )}
      {tableMenu !== null && tables[tableMenu] && (
        <TableMenu
          channel={channelById.get(tables[tableMenu]!)}
          people={(voiceStates ?? []).filter((v) => v.channelId === tables[tableMenu]).length}
          closed={!!closedTables?.includes(tables[tableMenu]!)}
          onSit={() => sitAt(tableMenu)}
          onPeek={() => peekAt(tableMenu)}
          onClose={() => setTableMenu(null)}
        />
      )}
      {peeking && <PeekBar channel={channelById.get(peeking)} until={peekUntil} whispering={whispering} near={peekNear} />}
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

/** Mesa clicada fora de call: uma barrinha com sentar ou espiar. */
function TableMenu({ channel, people, closed, onSit, onPeek, onClose }: { channel?: Channel; people: number; closed: boolean; onSit: () => void; onPeek: () => void; onClose: () => void }) {
  const peekBlock = closed ? 'A mesa fechou para espiadas' : people === 0 ? 'Ninguém na mesa' : null;
  return (
    <div className="animate-pop-in flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border border-white/10 bg-[#1b1430]/95 p-1 pl-2.5 whitespace-nowrap text-white shadow-xl">
      <span className="plaza-pixel max-w-[140px] truncate text-[13px] font-bold">#{channel?.name ?? 'mesa'}</span>
      {people > 0 && <span className="text-[11px] text-white/50">· {people}</span>}
      <button onClick={onSit} className="ml-1 rounded-lg bg-[#e8685a] px-2.5 py-1 text-xs font-bold hover:brightness-110">
        Sentar
      </button>
      <button
        onClick={onPeek}
        disabled={!!peekBlock}
        title={peekBlock ?? 'Ouvir 10 s (a mesa vê que você está espiando)'}
        className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-bold hover:bg-white/15 disabled:opacity-40"
      >
        <Eye size={13} /> Espiar
      </button>
      <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-white/60 hover:bg-white/10">
        <X size={13} />
      </button>
    </div>
  );
}

/** Ouvindo uma mesa: chip pequeno. Espiando: tempo, segurar para cochichar e parar. De perto: só o aviso. */
function PeekBar({ channel, until, whispering, near }: { channel?: Channel; until: number; whispering: boolean; near: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (near) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [near]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const peek = usePlazaPeek.getState();
  if (near) {
    return (
      <div className="pointer-events-none absolute top-16 left-1/2 z-[63] -translate-x-1/2 rounded-full bg-[#1b1430]/90 px-3 py-1 text-[12px] font-semibold text-white shadow-lg ring-1 ring-white/15">
        👂 ouvindo #{channel?.name ?? 'mesa'}
      </div>
    );
  }
  return (
    <div className="absolute top-16 left-1/2 z-[63] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#1b1430]/95 py-1 pr-1 pl-3 text-white shadow-lg ring-1 ring-white/15">
      <span className="text-[12px] font-semibold">
        👀 #{channel?.name ?? 'mesa'} · {left}s
      </span>
      <button
        onPointerDown={() => void peek.setWhisper(true)}
        onPointerUp={() => void peek.setWhisper(false)}
        onPointerLeave={() => void peek.setWhisper(false)}
        title="Segure para cochichar"
        aria-label="Segure para cochichar"
        className={cx('grid h-7 w-7 place-items-center rounded-full select-none', whispering ? 'bg-[#2e9e6a]' : 'bg-white/10 hover:bg-white/15')}
      >
        <Mic size={13} />
      </button>
      <button onClick={() => peek.stop()} aria-label="Parar de espiar" className="grid h-7 w-7 place-items-center rounded-full text-white/70 hover:bg-white/10">
        <X size={13} />
      </button>
    </div>
  );
}

/** Editor: em que andar fica cada sala (térreo até 6, os outros 2 cada; "Automático" deixa o Concord decidir). */
function FloorAssign({ serverId, channels }: { serverId: string; channels: Channel[] }) {
  const saved = usePlaza((s) => s.floorAssign);
  const [assign, setAssign] = useState<Record<string, number>>(saved);
  const [saving, setSaving] = useState(false);
  const preview = planFloors(
    channels.map((c) => c.id),
    assign,
  );
  const levelOf = (id: string) => preview.findIndex((f) => f.includes(id));
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/servers/${serverId}/plaza/floors`, { assign });
      toast.success('Andares salvos.');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold tracking-wider text-white/50 uppercase">Andares</div>
      <p className="mb-2 text-[11px] text-white/45">
        O térreo cabe {GROUND_TABLES} salas e cada andar {FLOOR_TABLES}. Escolha onde fica cada uma; em Automático, o Concord encaixa.
      </p>
      <div className="space-y-1">
        {channels.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">#{c.name}</span>
            <select
              value={assign[c.id] ?? -1}
              onChange={(e) => {
                const v = Number(e.target.value);
                const next = { ...assign };
                if (v < 0) delete next[c.id];
                else next[c.id] = v;
                setAssign(next);
              }}
              className="rounded-md bg-white/10 px-1.5 py-1 text-xs outline-none"
            >
              <option value={-1}>Automático ({floorName(Math.max(0, levelOf(c.id)))})</option>
              {Array.from({ length: MAX_FLOORS + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {floorName(i)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button onClick={() => void save()} disabled={saving} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-50">
        {saving ? 'Salvando…' : 'Salvar andares'}
      </button>
    </div>
  );
}

/** Elevador: escolhe o andar (mostra as salas de cada um). */
function FloorMenu({
  floors,
  current,
  inHall,
  onHall,
  channelName,
  onPick,
  onClose,
}: {
  floors: (string | null)[][];
  current: number;
  inHall: boolean;
  onHall: () => void;
  channelName: (id: string | null) => string | undefined;
  onPick: (floor: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="animate-pop-in absolute bottom-[76px] left-1/2 z-[64] w-[min(92vw,360px)] -translate-x-1/2 rounded-xl border border-white/10 bg-[#1b1430]/95 p-2 text-white shadow-xl">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="plaza-pixel text-[13px] font-bold">Elevador</span>
        <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-white/60 hover:bg-white/10">
          <X size={13} />
        </button>
      </div>
      <div className="max-h-[40vh] space-y-1 overflow-y-auto">
        {floors.map((f, i) => (
          <button
            key={i}
            disabled={i === current}
            onClick={() => onPick(i)}
            className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs', i === current ? 'bg-white/15' : 'hover:bg-white/10')}
          >
            <span className="w-16 shrink-0 font-bold">{floorName(i)}</span>
            <span className="min-w-0 flex-1 truncate text-white/60">{f.map((id) => (id ? `#${channelName(id) ?? 'sala'}` : 'reservada')).join(' · ') || 'sem salas'}</span>
            {i === current && <span className="text-[10px] text-white/50">você está aqui</span>}
          </button>
        ))}
        <button
          disabled={inHall}
          onClick={onHall}
          className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs', inHall ? 'bg-white/15' : 'hover:bg-white/10')}
        >
          <span className="w-16 shrink-0 font-bold">Quartos</span>
          <span className="min-w-0 flex-1 truncate text-white/60">o corredor com o quarto de cada um</span>
          {inHall && <span className="text-[10px] text-white/50">você está aqui</span>}
        </button>
      </div>
    </div>
  );
}

/** Cardápio do balcão: aparece em cima do balcão, quando o boneco chega lá. */
function BarMenu({ holding, onPick, onClose }: { holding: string | null; onPick: (drink: string | null) => void; onClose: () => void }) {
  return (
    <div className="animate-pop-in absolute bottom-[76px] left-1/2 z-[64] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-[#1b1430]/95 p-1 pl-2.5 text-white shadow-xl">
      <span className="plaza-pixel mr-1 text-[13px] font-bold">Balcão</span>
      {DRINKS.map((d) => (
        <button
          key={d.id}
          onClick={() => onPick(d.id)}
          title={d.label}
          aria-label={d.label}
          className={cx('grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/10', holding === d.id && 'bg-white/15')}
        >
          {d.emoji}
        </button>
      ))}
      {holding && (
        <button onClick={() => onPick(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-white/70 hover:bg-white/10">
          Largar
        </button>
      )}
      <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-white/60 hover:bg-white/10">
        <X size={13} />
      </button>
    </div>
  );
}

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
  peeking,
  playing,
}: {
  peeking?: 'peek' | 'near';
  playing?: string;
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
      {idle && (
        <div className="pointer-events-none absolute -top-5 -right-2">
          <span className="plaza-zzz plaza-pixel absolute top-2 right-3 text-xs font-bold text-[#bfc7ff]">z</span>
          <span className="plaza-zzz plaza-pixel absolute top-0 right-1 text-sm font-bold text-[#bfc7ff]" style={{ animationDelay: '0.8s' }}>
            z
          </span>
          <span className="plaza-zzz plaza-pixel absolute -top-2 -right-1 text-base font-bold text-[#bfc7ff]" style={{ animationDelay: '1.6s' }}>
            Z
          </span>
        </div>
      )}

      <div className={cx('plaza-pixel flex items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] font-bold leading-[16px]', isMe ? 'bg-[#e8685a] text-white' : 'bg-[#1b1430]/75 text-white')}>
        {voice?.streaming && <span className="rounded-sm bg-[#ff5c7a] px-0.5 text-[9px] leading-[12px]">AO VIVO</span>}
        {peeking && <span title={peeking === 'near' ? 'Ouvindo uma mesa de perto' : 'Espiando uma mesa'}>{peeking === 'near' ? '👂' : '👀'}</span>}
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
  // o que a pessoa está jogando (o app desktop detecta): só aparece aqui, no cartão
  const playingNow = useApp((st) => st.online[userId]?.activities?.find((a) => a.type === 'playing')?.name);
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
          {playingNow && <div className="truncate text-xs text-[#9fe7b5]">🎮 Jogando {playingNow}</div>}
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
