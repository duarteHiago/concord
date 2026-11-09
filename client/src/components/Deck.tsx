import { Clapperboard, Image as ImageIcon, Maximize2, MicOff, PhoneOff, RotateCcw, Smartphone, Sparkles, Star, Volume2, VolumeX, X, Zap } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { PRANK_EFFECTS } from '../../../shared/contracts.ts';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { memberName, type Contract, type ContractsMe } from '../lib/types';
import { prepareImage, uploadImage } from '../lib/upload';
import { EFFECTS } from '../lib/voiceEffects';
import { useApp } from '../store/app';
import { DirectorBody } from './Director';
import { REACTIONS } from './Reactions';
import { Avatar, cx } from './ui';

/** Deck aberto (tela cheia por cima do app). Abre pelo "Controle" do celular ou pelo link /?controle. */
export const useDeck = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: typeof location !== 'undefined' && new URLSearchParams(location.search).has('controle'),
  set: (open) => set({ open }),
}));

/** Endereço que abre o deck no celular (QR code da sala no PC). */
export const deckUrl = () => `${location.origin}/?controle=1`;

type Tab = 'fav' | 'sounds' | 'fun' | 'mecenato' | 'director';

interface Item {
  /** chave para favoritar (null: não dá para favoritar) */
  key: string;
  label: string;
  sub?: string;
  visual: ReactNode;
  run: () => Promise<unknown> | void;
  done?: string;
  tone?: 'accent' | 'live' | 'coral';
  active?: boolean;
  disabled?: string | null;
}

const vibrate = (ms = 12) => navigator.vibrate?.(ms);

export function DeckScreen() {
  const open = useDeck((s) => s.open);
  if (!open) return null;
  return <DeckInner />;
}

function DeckInner() {
  const close = useDeck((s) => s.set);
  const me = useApp((s) => s.me);
  const saveSettings = useApp((s) => s.saveSettings);
  const loadDetail = useApp((s) => s.loadDetail);
  const loadSounds = useApp((s) => s.loadSounds);
  const openSettings = useApp((s) => s.openSettings);
  const [where, setWhere] = useState<{ serverId: string; channelId: string } | null | undefined>(undefined);
  const detail = useApp((s) => (where ? s.details[where.serverId] : undefined));
  const states = useApp((s) => (where ? s.voiceStates[where.serverId] : undefined)) ?? [];
  const sounds = useApp((s) => (where ? s.sounds[where.serverId] : undefined));
  const [contract, setContract] = useState<Contract | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [surprise, setSurprise] = useState(false);
  const [portrait, setPortrait] = useState(() => matchMedia('(orientation: portrait)').matches);
  const [standing, setStanding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const favorites = me?.settings.deckFavorites ?? [];

  // em qual sala a conta está (a call pode estar no PC); confere de novo de tempos em tempos
  useEffect(() => {
    let alive = true;
    const check = () =>
      api.get<{ serverId: string; channelId: string } | null>('/me/voice').then(
        (v) => alive && setWhere((cur) => (cur?.channelId === v?.channelId && cur?.serverId === v?.serverId ? cur : v)),
        () => alive && setWhere(null),
      );
    void check();
    const t = setInterval(check, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!where) return;
    void loadDetail(where.serverId);
    void loadSounds(where.serverId);
  }, [where, loadDetail, loadSounds]);

  const refreshContract = () => api.get<ContractsMe>('/contracts/me').then((c) => setContract(c.current), () => {});
  useEffect(() => {
    void refreshContract();
    const t = setInterval(refreshContract, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const q = matchMedia('(orientation: portrait)');
    const on = () => setPortrait(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2200);
    return () => clearTimeout(t);
  }, [status]);

  const exit = () => {
    const q = new URLSearchParams(location.search);
    if (q.has('controle')) {
      q.delete('controle');
      history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    close(false);
  };

  const fullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      // celular sem tela cheia (iPhone): gira na mão mesmo
    }
  };

  const press = async (item: Item) => {
    if (item.disabled) {
      setStatus({ text: item.disabled, ok: false });
      return;
    }
    try {
      await item.run();
      vibrate();
      if (item.done) setStatus({ text: item.done, ok: true });
    } catch (err) {
      vibrate(60);
      setStatus({ text: err instanceof Error ? err.message : 'Não deu certo', ok: false });
    }
  };

  const toggleFavorite = (key: string, label: string) => {
    vibrate(25);
    const on = favorites.includes(key);
    void saveSettings({ deckFavorites: on ? favorites.filter((k) => k !== key) : [...favorites, key] });
    setStatus({ text: on ? `${label} saiu dos favoritos` : `${label} nos favoritos`, ok: true });
  };

  const channel = detail?.channels.find((c) => c.id === where?.channelId);
  const inRoom = states.filter((v) => v.channelId === where?.channelId);
  const people = inRoom.flatMap((v) => {
    const m = detail?.members.find((x) => x.id === v.userId);
    return m ? [m] : [];
  });

  // ---- Sons
  const soundItems: Item[] = (sounds ?? []).map((s) => ({
    key: `sound:${s.id}`,
    label: s.name,
    visual: <Volume2 size={22} />,
    run: () => api.post(`/sounds/${s.id}/play`),
  }));

  // ---- Brincadeiras: reações no palco e chamar atenção
  const funItems: Item[] = [
    ...REACTIONS.map<Item>((emoji) => ({
      key: `react:${emoji}`,
      label: 'Reação',
      visual: <span className="text-3xl leading-none">{emoji}</span>,
      run: () => {
        getSocket()?.emit('reaction', { emoji, x: 0.3 + Math.random() * 0.4, y: 0.85 });
      },
    })),
    ...people
      .filter((m) => m.id !== me?.id)
      .map<Item>((m) => ({
        key: `nudge:${m.id}`,
        label: memberName(m),
        sub: 'Chamar atenção',
        visual: <Avatar name={memberName(m)} color={m.avatarColor} src={m.avatarUrl} size={40} />,
        run: () => api.post(`/servers/${where!.serverId}/members/${m.id}/nudge`, {}),
        done: `${memberName(m)} sentiu a tela tremer`,
        tone: 'coral',
      })),
  ];

  // ---- Mecenato: só quando você tem os poderes num contrato em vigor
  const other = contract ? (contract.creator.id === me?.id ? contract.invitee : contract.creator) : null;
  const holder = !!contract && contract.status === 'active' && !!me && contract.holders.includes(me.id);
  const shielded = other && contract?.shields?.[other.id]?.active ? `${other.displayName} está com o Escudo ligado` : null;
  const ov = contract?.otherVoice;
  const call = async (body: Record<string, unknown>) => setContract(await api.post<Contract>(`/contracts/${contract!.id}/powers`, body));
  const prankLabel = (id: string) => EFFECTS.find((e) => e.id === id)?.label ?? id;
  const mecItems: Item[] =
    holder && other
      ? [
          {
            key: 'mec:mute',
            label: ov?.serverMuted ? 'Devolver a voz' : 'Silenciar',
            visual: <MicOff size={22} />,
            run: () => call({ power: 'mute', on: !ov?.serverMuted }),
            done: ov?.serverMuted ? `${other.displayName} pode falar de novo` : `${other.displayName} ficou mudo`,
            active: !!ov?.serverMuted,
            disabled: shielded ?? (ov ? null : `${other.displayName} não está numa sala`),
          },
          {
            key: 'mec:deafen',
            label: ov?.serverDeafened ? 'Devolver o som' : 'Ensurdecer',
            visual: <VolumeX size={22} />,
            run: () => call({ power: 'deafen', on: !ov?.serverDeafened }),
            done: ov?.serverDeafened ? `${other.displayName} voltou a ouvir` : `${other.displayName} não ouve mais ninguém`,
            active: !!ov?.serverDeafened,
            disabled: shielded ?? (ov ? null : `${other.displayName} não está numa sala`),
          },
          {
            key: 'mec:disconnect',
            label: 'Tirar da sala',
            visual: <PhoneOff size={22} />,
            run: () => call({ power: 'disconnect' }),
            done: `${other.displayName} saiu da sala`,
            tone: 'live',
            disabled: shielded ?? (ov ? null : `${other.displayName} não está numa sala`),
          },
          ...PRANK_EFFECTS.map<Item>((effect) => ({
            key: `mec:fx:${effect}`,
            label: prankLabel(effect),
            sub: surprise ? 'Surpresa' : 'Na hora',
            visual: <Sparkles size={22} />,
            run: () => call({ power: 'voice_fx', effect, durationMs: 4000, windowMs: surprise ? 90_000 : 0 }),
            done: surprise ? `${prankLabel(effect)} agendado (até 1 min e meio)` : `${prankLabel(effect)} em ${other.displayName}`,
            tone: 'accent',
            disabled: shielded ?? (contract?.pendingFx ? 'Já tem um efeito esperando a hora' : null),
          })),
          ...(contract?.pendingFx
            ? [
                {
                  key: 'mec:fx-cancel',
                  label: 'Cancelar surpresa',
                  visual: <X size={22} />,
                  run: async () => setContract(await api.del<Contract>(`/contracts/${contract!.id}/voice-fx`)),
                  done: 'Surpresa cancelada',
                } satisfies Item,
              ]
            : []),
          {
            key: 'mec:avatar',
            label: 'Trocar a foto',
            visual: <ImageIcon size={22} />,
            run: () => fileRef.current?.click(),
            disabled: shielded,
          },
          ...(contract?.avatarOverrides.includes(other.id)
            ? [
                {
                  key: 'mec:avatar-back',
                  label: 'Devolver a foto',
                  visual: <RotateCcw size={22} />,
                  run: async () => setContract(await api.del<Contract>(`/contracts/${contract!.id}/avatar`)),
                  done: 'Foto original de volta',
                } satisfies Item,
              ]
            : []),
        ]
      : [];

  const all = [...soundItems, ...funItems, ...mecItems];
  const favItems = favorites.flatMap((k) => all.find((i) => i.key === k) ?? []);
  const canDirect = !!channel?.canRecord;
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'fav', label: 'Favoritos', show: favItems.length > 0 },
    { id: 'sounds', label: 'Sons', show: true },
    { id: 'fun', label: 'Brincadeiras', show: true },
    { id: 'mecenato', label: 'Mecenato', show: true },
    { id: 'director', label: 'Direção', show: canDirect },
  ];
  const shown = tabs.filter((t) => t.show);
  const current = tab && shown.some((t) => t.id === tab) ? tab : shown[0].id;

  const onAvatarFile = async (file: File | undefined) => {
    if (!file || !contract) return;
    try {
      const blob = await prepareImage(file, 512, true);
      setContract(await uploadImage<Contract>(`/contracts/${contract.id}/avatar`, blob));
      vibrate();
      setStatus({ text: 'Foto trocada', ok: true });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : 'Não deu para trocar a foto', ok: false });
    }
  };

  let body: ReactNode;
  if (where === undefined) {
    body = <Empty>Procurando a sua call…</Empty>;
  } else if (!where || !detail || !channel) {
    body = <Empty>Entre numa sala de voz (no PC ou aqui) e o controle aparece. Ele fica de olho e atualiza sozinho.</Empty>;
  } else if (current === 'director') {
    body = channel.recording ? (
      <div className="mx-auto max-w-md">
        <DirectorBody detail={detail} channel={channel} remote />
      </div>
    ) : (
      <Empty>Ligue o modo gravação da sala (no botão Gravar, no PC) para usar a direção.</Empty>
    );
  } else if (current === 'mecenato' && !holder) {
    body = (
      <Empty>
        {contract?.status === 'active' && other
          ? `Agora quem tem os poderes é ${other.displayName}. Quando você virar o Mecenas, os botões aparecem aqui.`
          : 'Com um contrato de Mecenato em vigor, os poderes aparecem aqui: voz surpresa, trocar a foto, silenciar e mais.'}
        <button
          type="button"
          onClick={() => {
            exit();
            openSettings('mecenato');
          }}
          className="mt-3 block w-full rounded-full bg-surface-3 py-2 text-sm font-bold"
        >
          Ver o Mecenato
        </button>
      </Empty>
    );
  } else {
    const items = current === 'fav' ? favItems : current === 'sounds' ? soundItems : current === 'fun' ? funItems : mecItems;
    body = items.length ? (
      <>
        {current === 'mecenato' && other && (
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="text-fg-muted">Alvo:</span>
            <b>{other.displayName}</b>
            {shielded && <span className="rounded-full bg-warn/20 px-2 py-0.5 text-xs font-bold text-warn">Escudo ligado</span>}
            <button
              type="button"
              onClick={() => setSurprise(!surprise)}
              className={cx('ml-auto rounded-full px-3 py-1 text-xs font-bold', surprise ? 'bg-accent text-on-accent' : 'bg-surface-3')}
            >
              Voz: {surprise ? 'surpresa' : 'na hora'}
            </button>
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
          {items.map((item) => (
            <DeckButton
              key={item.key}
              item={item}
              favorite={favorites.includes(item.key)}
              onPress={() => void press(item)}
              onHold={() => toggleFavorite(item.key, item.label)}
            />
          ))}
        </div>
      </>
    ) : (
      <Empty>
        {current === 'sounds'
          ? 'Esta sala ainda não tem sons. Quem pode, sobe sons na mesa de sons do servidor.'
          : current === 'fav'
            ? 'Segure qualquer botão para pôr nos favoritos.'
            : 'Nada por aqui ainda.'}
      </Empty>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-surface-1 text-fg select-none" role="dialog" aria-label="Controle">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))]">
        <button type="button" onClick={exit} aria-label="Fechar o controle" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3">
          <X size={18} />
        </button>
        <div className="min-w-0 shrink">
          <div className="truncate text-sm font-bold">{channel?.name ?? 'Controle'}</div>
          <div className="truncate text-[11px] text-fg-muted">{detail ? `${detail.server.name} · ${people.length} na sala` : 'Concord'}</div>
        </div>
        <div className="flex min-w-0 flex-1 justify-end gap-1 overflow-x-auto" role="tablist">
          {where &&
            shown.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={current === t.id}
                onClick={() => setTab(t.id)}
                className={cx(
                  'flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold',
                  current === t.id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted',
                )}
              >
                {t.id === 'fav' && <Star size={12} />}
                {t.id === 'director' && <Clapperboard size={12} />}
                {t.label}
              </button>
            ))}
        </div>
        {document.fullscreenEnabled && (
          <button type="button" onClick={() => void fullscreen()} aria-label="Tela cheia" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3">
            <Maximize2 size={16} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pb-[max(12px,env(safe-area-inset-bottom))]">
        {body}
      </div>
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] flex justify-center">
        {status && (
          <span className={cx('rounded-full px-4 py-1.5 text-xs font-bold shadow-lg', status.ok ? 'bg-fg text-surface-1' : 'bg-danger text-white')}>
            {status.text}
          </span>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onAvatarFile(e.target.files?.[0])} />
      {portrait && !standing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1/95 p-8 text-center backdrop-blur">
          <Smartphone size={44} className="deck-rotate text-accent" />
          <p className="max-w-xs text-sm font-semibold">Gire o celular para usar como deck: os botões ficam maiores.</p>
          <button type="button" onClick={() => setStanding(true)} className="rounded-full bg-surface-3 px-4 py-2 text-xs font-bold">
            Usar em pé mesmo
          </button>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="mx-auto mt-10 max-w-sm text-center text-sm text-fg-muted">{children}</div>;
}

/** Botão do deck: toque dispara, segurar põe ou tira dos favoritos. */
function DeckButton({ item, favorite, onPress, onHold }: { item: Item; favorite: boolean; onPress: () => void; onHold: () => void }) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const start = () => {
    hold.current = {
      fired: false,
      timer: setTimeout(() => {
        if (hold.current) hold.current.fired = true;
        onHold();
      }, 550),
    };
  };
  const end = () => hold.current && clearTimeout(hold.current.timer);
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (hold.current?.fired) {
          hold.current = null;
          return;
        }
        hold.current = null;
        onPress();
      }}
      title={item.disabled ?? item.label}
      className={cx(
        'relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center transition-transform active:scale-95',
        item.active ? 'bg-accent text-on-accent' : item.tone === 'live' ? 'bg-live/15 text-live' : item.tone === 'coral' ? 'bg-accent-2/15' : item.tone === 'accent' ? 'bg-accent/12 text-accent' : 'bg-surface-3',
        item.disabled && 'opacity-45',
      )}
    >
      {item.visual}
      <span className="line-clamp-2 text-[11px] leading-tight font-bold">{item.label}</span>
      {item.sub && <span className="-mt-1 text-[10px] font-semibold opacity-70">{item.sub}</span>}
      {favorite && <Star size={12} className="absolute top-1.5 right-1.5 fill-current text-warn" />}
    </button>
  );
}

/** Botão da sala no PC: QR code para abrir o controle no celular. */
export function DeckQrButton() {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    void QRCode.toDataURL(deckUrl(), { margin: 1, width: 220 }).then(setQr, () => setQr(''));
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Controlar pelo celular (sons, brincadeiras e Mecenato)"
        aria-label="Controlar pelo celular"
        aria-expanded={open}
        className={cx('flex h-9 w-9 items-center justify-center rounded-full transition-colors', open ? 'bg-fg text-surface-1' : 'text-fg-muted hover:bg-surface-3 hover:text-fg')}
      >
        <Zap size={17} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-40 mt-2 w-[260px] animate-pop-in space-y-2 rounded-[22px] border border-line-strong bg-surface-2 p-4 text-center shadow-2xl">
          <div className="text-sm font-bold">Controle no celular</div>
          {qr ? <img src={qr} alt="QR code do controle" className="mx-auto h-44 w-44 rounded-lg bg-white p-1" /> : <div className="mx-auto h-44 w-44" />}
          <p className="text-xs text-fg-muted">Abra com a câmera, na mesma conta. Sons, brincadeiras e Mecenato num deck, sem sair da call daqui.</p>
          <p className="text-[11px] text-fg-subtle">No app do celular, também fica em Controle, na barra de baixo.</p>
        </div>
      )}
    </div>
  );
}
