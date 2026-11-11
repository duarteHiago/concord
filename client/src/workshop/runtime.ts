// Liga a Oficina ao resto do app: som ao abrir o servidor, intro, sons das salas, anunciador e menções.
// Montado uma vez em Shell (useWorkshopRuntime). Sem Oficina (fora do Concord de testes), não faz nada.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { WorkshopPiece } from '../../../shared/workshop.ts';
import type { MentionEvent } from '../lib/mentions';
import { setSoundOverride } from '../lib/sounds';
import { HOME, useApp } from '../store/app';
import { useVoice } from '../store/voice';
import { playTones } from './audio';
import type { Pack, SoundSlot } from './packs';
import { WORKSHOP_ENABLED, activeConfig, pieceFor, useWorkshop, workshopPrefs } from './store';

// ---------------------------------------------------------------- avisos na tela (intro, anunciador, menção)

export interface MentionCard {
  id: number;
  pack: Pack;
  serverId: string;
  channelId: string;
  author: string;
  avatarUrl: string | null;
  avatarColor: string;
  where: string;
  text: string;
}

interface Overlays {
  intro: { serverId: string; pack: Pack; name: string; key: number } | null;
  announce: { pack: Pack; text: string; key: number } | null;
  mentions: MentionCard[];
}

export const useOverlays = create<Overlays>(() => ({ intro: null, announce: null, mentions: [] }));
let seq = 0;

/** Toca o som de uma peça (se a pessoa não desligou os sons). */
export function playPiece(serverId: string | null | undefined, piece: WorkshopPiece, slot: SoundSlot, gapMs = 0): boolean {
  const pack = pieceFor(serverId, piece);
  if (!pack) return false;
  const prefs = workshopPrefs();
  if (prefs.sounds) playTones(pack.sounds[slot], `${piece}:${slot}`, gapMs, prefs.volume / 100);
  return true;
}

/** Ouvir na Oficina (ignora as preferências: é a pessoa pedindo para ouvir). */
export function previewSound(pack: Pack, slot: SoundSlot) {
  playTones(pack.sounds[slot], undefined, 0, workshopPrefs().volume / 100 || 0.7);
}

export function showIntro(serverId: string, pack: Pack, name: string) {
  useOverlays.setState({ intro: { serverId, pack, name, key: ++seq } });
}

function showAnnounce(pack: Pack, text: string) {
  useOverlays.setState({ announce: { pack, text, key: ++seq } });
}

/**
 * Menção num servidor com a peça "Notificação": som próprio e um aviso com a cara do pacote.
 * Devolve true quando cuidou do som (aí o som padrão não toca).
 */
export function workshopMention(m: MentionEvent, soundOn: boolean): boolean {
  if (!WORKSHOP_ENABLED) return false;
  const pack = pieceFor(m.serverId, 'notify');
  if (!pack) return false;
  const prefs = workshopPrefs();
  if (soundOn && prefs.sounds) playTones(pack.sounds.notify, 'notify', 400, prefs.volume / 100);
  const card: MentionCard = {
    id: ++seq,
    pack,
    serverId: m.serverId,
    channelId: m.message.channelId,
    author: m.message.author.displayName,
    avatarUrl: m.message.author.avatarUrl ?? null,
    avatarColor: m.message.author.avatarColor,
    where: `#${m.channelName.replace(/^#/, '')}`,
    text: m.message.content.length > 140 ? `${m.message.content.slice(0, 140)}…` : m.message.content,
  };
  useOverlays.setState((s) => ({ mentions: [...s.mentions.slice(-2), card] }));
  setTimeout(() => useOverlays.setState((s) => ({ mentions: s.mentions.filter((c) => c.id !== card.id) })), 6000);
  return true;
}

// ---------------------------------------------------------------- sessão: intro uma vez por servidor

const INTRO_KEY = 'concord.workshop.intro.';
function introSeen(serverId: string): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY + serverId) === '1';
  } catch {
    return false;
  }
}
function markIntro(serverId: string) {
  try {
    sessionStorage.setItem(INTRO_KEY + serverId, '1');
  } catch {
    // sem sessionStorage: a intro pode aparecer de novo, sem problema
  }
}

function enteredServer(serverId: string) {
  playPiece(serverId, 'enter', 'enter', 600);
  const pack = pieceFor(serverId, 'intro');
  if (!pack || introSeen(serverId)) return;
  markIntro(serverId);
  const name = useApp.getState().servers.find((s) => s.id === serverId)?.name ?? '';
  showIntro(serverId, pack, name);
}

// ---------------------------------------------------------------- sons das salas e anunciador

const VOICE_SLOTS: Record<string, SoundSlot> = { join: 'voiceJoin', leave: 'voiceLeave', peerJoin: 'peerJoin', peerLeave: 'peerLeave' };
let lastVoiceServer: string | null = null;

const THRESHOLDS = [5, 3, 2] as const;
let lastCount = 0;
let lastChannel: string | null = null;

function checkAnnouncer() {
  const { serverId, channelId } = useVoice.getState();
  if (!serverId || !channelId) {
    lastChannel = null;
    lastCount = 0;
    return;
  }
  const count = (useApp.getState().voiceStates[serverId] ?? []).filter((v) => v.channelId === channelId).length;
  if (channelId !== lastChannel) {
    lastChannel = channelId;
    lastCount = 0;
  }
  const prev = lastCount;
  lastCount = count;
  if (count <= prev) return;
  const reached = THRESHOLDS.find((k) => count >= k && prev < k);
  if (!reached) return;
  const pack = pieceFor(serverId, 'announcer');
  if (!pack) return;
  showAnnounce(pack, pack.announcer[reached]);
  const prefs = workshopPrefs();
  if (prefs.sounds) playTones(pack.sounds.announce, 'announce', 1500, prefs.volume / 100);
}

// ---------------------------------------------------------------- hook

export function useWorkshopRuntime() {
  const serverCount = useApp((s) => s.servers.length);

  useEffect(() => {
    if (WORKSHOP_ENABLED) void useWorkshop.getState().load();
  }, [serverCount]);

  useEffect(() => {
    if (!WORKSHOP_ENABLED) return;

    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<{ serverId: string; config: never }>).detail;
      useWorkshop.getState().setConfig(d.serverId, d.config);
    };
    const onOpenChannel = () => useWorkshop.getState().closeMural();
    window.addEventListener('concord:workshop', onChanged);
    window.addEventListener('concord:open-channel', onOpenChannel);

    setSoundOverride((name) => {
      const slot = VOICE_SLOTS[name];
      if (!slot) return false;
      const serverId = useVoice.getState().serverId ?? lastVoiceServer;
      return playPiece(serverId, 'voice', slot, slot === 'peerJoin' || slot === 'peerLeave' ? 250 : 0);
    });

    let current = useApp.getState().activeServerId;
    if (current && current !== HOME) enteredServer(current);
    const unsubApp = useApp.subscribe((s, prev) => {
      if (s.activeServerId !== prev.activeServerId) {
        current = s.activeServerId;
        if (useWorkshop.getState().muralFor !== current) useWorkshop.getState().closeMural();
        if (current && current !== HOME) enteredServer(current);
      }
      if (s.voiceStates !== prev.voiceStates) checkAnnouncer();
    });
    // a configuração chegou depois de abrir o servidor (primeiro carregamento): ainda dá tempo da intro
    const unsubWs = useWorkshop.subscribe((s, prev) => {
      const id = useApp.getState().activeServerId;
      if (!id || id === HOME) return;
      if (!prev.configs[id] && s.configs[id] && activeConfig(id)) enteredServer(id);
    });
    const unsubVoice = useVoice.subscribe((s, prev) => {
      if (s.serverId) lastVoiceServer = s.serverId;
      if (s.channelId !== prev.channelId) checkAnnouncer();
    });

    return () => {
      window.removeEventListener('concord:workshop', onChanged);
      window.removeEventListener('concord:open-channel', onOpenChannel);
      setSoundOverride(null);
      unsubApp();
      unsubWs();
      unsubVoice();
    };
  }, []);
}
