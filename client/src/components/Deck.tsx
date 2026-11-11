import { Clapperboard, Gamepad2, Image as ImageIcon, Maximize2, MicOff, PhoneOff, RotateCcw, Shield, Smartphone, Sparkles, Star, Volume2, VolumeX, X, Zap } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';
import { PRANK_EFFECTS } from '../../../shared/contracts.ts';
import { api } from '../lib/api';
import { desktop } from '../lib/desktop';
import { getSocket } from '../lib/socket';
import { memberName, type Contract, type ContractsMe } from '../lib/types';
import { prepareImage, uploadImage } from '../lib/upload';
import { EFFECTS } from '../lib/voiceEffects';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { DirectorBody } from './Director';
import { REACTIONS } from './Reactions';
import { Avatar, cx } from './ui';

/**
 * O deck é do celular (ou tablet): tela de toque e fora do app desktop. No PC ele não abre: lá a call já
 * está na tela, e o deck por cima da barra de título do app desktop deixava a pessoa sem como sair.
 */
export const deckAvailable = () => !desktop && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** Abre o deck; fora do celular, explica onde ele fica. */
export function openDeck() {
  if (deckAvailable()) useDeck.getState().set(true);
  else toast.info('O controle é para o celular: abra Controle no app do celular, ou leia o QR code do raio no topo da sala.');
}

/** Deck aberto (tela cheia por cima do app). Abre pelo "Controle" do celular ou pelo link /?controle. */
export const useDeck = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: typeof location !== 'undefined' && new URLSearchParams(location.search).has('controle') && deckAvailable(),
  set: (open) => set({ open }),
}));

/** Endereço que abre o deck no celular (QR code da sala no PC). */
export const deckUrl = () => `${location.origin}/?controle=1`;

type Tab = 'fav' | 'sounds' | 'fun' | 'mecenato' | 'director';

/** Cor do LED de cada grupo (tokens do tema, então acompanha claro e escuro). */
const LED: Record<Exclude<Tab, 'fav'>, string> = {
  sounds: 'var(--color-accent)',
  fun: 'var(--color-accent-2)',
  mecenato: 'var(--color-warn)',
  director: 'var(--color-live)',
};

interface Item {
  key: string;
  group: Exclude<Tab, 'fav'>;
  label: string;
  /** rótulo para leitor de tela quando a tecla só mostra o emoji */
  aria?: string;
  hideLabel?: boolean;
  sub?: string;
  visual: ReactNode;
  run: () => Promise<unknown> | void;
  done?: string;
  /** ligado agora (silenciado, ensurdecido): LED aceso */
  on?: boolean;
  danger?: boolean;
  disabled?: string | null;
}

const vibrate = (ms = 12) => navigator.vibrate?.(ms);

export function DeckScreen() {
  const open = useDeck((s) => s.open);
  // link do deck aberto no PC: só tira o parâmetro do endereço
  useEffect(() => {
    if (deckAvailable()) return;
    const q = new URLSearchParams(location.search);
    if (!q.has('controle')) return;
    q.delete('controle');
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
  }, []);
  if (!open || !deckAvailable()) return null;
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
  const [fired, setFired] = useState<string | null>(null);
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

  useEffect(() => {
    if (!fired) return;
    const t = setTimeout(() => setFired(null), 650);
    return () => clearTimeout(t);
  }, [fired]);

  const exit = () => {
    const q = new URLSearchParams(location.search);
    if (q.has('controle')) {
      q.delete('controle');
      history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    close(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && exit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
      vibrate(40);
      setStatus({ text: item.disabled, ok: false });
      return;
    }
    try {
      await item.run();
      vibrate();
      setFired(item.key);
      if (item.done) setStatus({ text: item.done, ok: true });
    } catch (err) {
      vibrate(60);
      setStatus({ text: err instanceof Error ? err.message : 'Não deu certo', ok: false });
    }
  };

  const toggleFavorite = (item: Item) => {
    vibrate(25);
    const on = favorites.includes(item.key);
    void saveSettings({ deckFavorites: on ? favorites.filter((k) => k !== item.key) : [...favorites, item.key] });
    const name = item.aria ?? item.label;
    setStatus({ text: on ? `${name} saiu dos favoritos` : `${name} nos favoritos`, ok: true });
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
    group: 'sounds',
    label: s.name,
    visual: <Volume2 size={24} strokeWidth={2.2} />,
    run: () => api.post(`/sounds/${s.id}/play`),
  }));

  // ---- Brincadeiras: reações no palco e chamar atenção
  const reactionItems: Item[] = REACTIONS.map((emoji) => ({
    key: `react:${emoji}`,
    group: 'fun',
    label: emoji,
    aria: `Reação ${emoji}`,
    hideLabel: true,
    visual: <span className="text-[34px] leading-none">{emoji}</span>,
    run: () => {
      getSocket()?.emit('reaction', { emoji, x: 0.3 + Math.random() * 0.4, y: 0.85 });
    },
  }));
  const nudgeItems: Item[] = people
    .filter((m) => m.id !== me?.id)
    .map((m) => ({
      key: `nudge:${m.id}`,
      group: 'fun',
      label: memberName(m),
      aria: `Chamar a atenção de ${memberName(m)}`,
      sub: 'tremer',
      visual: <Avatar name={memberName(m)} color={m.avatarColor} src={m.avatarUrl} size={38} />,
      run: () => api.post(`/servers/${where!.serverId}/members/${m.id}/nudge`, {}),
      done: `${memberName(m)} sentiu a tela tremer`,
    }));

  // ---- Mecenato: só quando você tem os poderes num contrato em vigor
  const other = contract ? (contract.creator.id === me?.id ? contract.invitee : contract.creator) : null;
  const holder = !!contract && contract.status === 'active' && !!me && contract.holders.includes(me.id);
  const shielded = other && contract?.shields?.[other.id]?.active ? `${other.displayName} está com o Escudo ligado` : null;
  const ov = contract?.otherVoice;
  const away = other && !ov ? `${other.displayName} não está numa sala` : null;
  const call = async (body: Record<string, unknown>) => setContract(await api.post<Contract>(`/contracts/${contract!.id}/powers`, body));
  const prankLabel = (id: string) => EFFECTS.find((e) => e.id === id)?.label ?? id;
  const mecPowers: Item[] =
    holder && other
      ? [
          {
            key: 'mec:mute',
            group: 'mecenato',
            label: ov?.serverMuted ? 'Devolver a voz' : 'Silenciar',
            visual: <MicOff size={24} strokeWidth={2.2} />,
            run: () => call({ power: 'mute', on: !ov?.serverMuted }),
            done: ov?.serverMuted ? `${other.displayName} pode falar de novo` : `${other.displayName} ficou mudo`,
            on: !!ov?.serverMuted,
            disabled: shielded ?? away,
          },
          {
            key: 'mec:deafen',
            group: 'mecenato',
            label: ov?.serverDeafened ? 'Devolver o som' : 'Ensurdecer',
            visual: <VolumeX size={24} strokeWidth={2.2} />,
            run: () => call({ power: 'deafen', on: !ov?.serverDeafened }),
            done: ov?.serverDeafened ? `${other.displayName} voltou a ouvir` : `${other.displayName} não ouve mais ninguém`,
            on: !!ov?.serverDeafened,
            disabled: shielded ?? away,
          },
          {
            key: 'mec:disconnect',
            group: 'mecenato',
            label: 'Tirar da sala',
            visual: <PhoneOff size={24} strokeWidth={2.2} />,
            run: () => call({ power: 'disconnect' }),
            done: `${other.displayName} saiu da sala`,
            danger: true,
            disabled: shielded ?? away,
          },
          {
            key: 'mec:avatar',
            group: 'mecenato',
            label: 'Trocar a foto',
            visual: <ImageIcon size={24} strokeWidth={2.2} />,
            run: () => fileRef.current?.click(),
            disabled: shielded,
          },
          ...(contract?.avatarOverrides.includes(other.id)
            ? [
                {
                  key: 'mec:avatar-back',
                  group: 'mecenato',
                  label: 'Devolver a foto',
                  visual: <RotateCcw size={24} strokeWidth={2.2} />,
                  run: async () => setContract(await api.del<Contract>(`/contracts/${contract!.id}/avatar`)),
                  done: 'Foto original de volta',
                } satisfies Item,
              ]
            : []),
          ...(contract?.pendingFx
            ? [
                {
                  key: 'mec:fx-cancel',
                  group: 'mecenato',
                  label: 'Cancelar surpresa',
                  sub: prankLabel(contract.pendingFx.effect),
                  visual: <X size={24} strokeWidth={2.2} />,
                  run: async () => setContract(await api.del<Contract>(`/contracts/${contract!.id}/voice-fx`)),
                  done: 'Surpresa cancelada',
                  on: true,
                } satisfies Item,
              ]
            : []),
        ]
      : [];
  const mecVoices: Item[] =
    holder && other
      ? PRANK_EFFECTS.map((effect) => ({
          key: `mec:fx:${effect}`,
          group: 'mecenato',
          label: prankLabel(effect),
          visual: <Sparkles size={22} strokeWidth={2.2} />,
          run: () => call({ power: 'voice_fx', effect, durationMs: 4000, windowMs: surprise ? 90_000 : 0 }),
          done: surprise ? `${prankLabel(effect)} agendado: acontece em até 1 min e meio` : `${prankLabel(effect)} em ${other.displayName}`,
          disabled: shielded ?? (contract?.pendingFx ? 'Já tem um efeito esperando a hora' : null),
        }))
      : [];

  const all = [...soundItems, ...reactionItems, ...nudgeItems, ...mecPowers, ...mecVoices];
  const favItems = favorites.flatMap((k) => all.find((i) => i.key === k) ?? []);
  const canDirect = !!channel?.canRecord;
  const tabs: { id: Tab; label: string; icon: ReactNode; show: boolean }[] = [
    { id: 'fav', label: 'Favoritos', icon: <Star size={20} />, show: favItems.length > 0 },
    { id: 'sounds', label: 'Sons', icon: <Volume2 size={20} />, show: true },
    { id: 'fun', label: 'Zoeira', icon: <Gamepad2 size={20} />, show: true },
    { id: 'mecenato', label: 'Mecenato', icon: <Sparkles size={20} />, show: true },
    { id: 'director', label: 'Direção', icon: <Clapperboard size={20} />, show: canDirect },
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

  const keys = (items: Item[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(86px,1fr))] gap-2.5">
      {items.map((item) => (
        <DeckKey
          key={item.key}
          item={item}
          favorite={favorites.includes(item.key)}
          fired={fired === item.key}
          onPress={() => void press(item)}
          onHold={() => toggleFavorite(item)}
        />
      ))}
    </div>
  );

  let body: ReactNode;
  if (where === undefined) {
    body = <Empty>Procurando a sua call…</Empty>;
  } else if (!where || !detail || !channel) {
    body = <Empty>Entre numa sala de voz, no PC ou aqui, e as teclas aparecem. O controle fica de olho e atualiza sozinho.</Empty>;
  } else if (current === 'director') {
    body = channel.recording ? (
      <div className="mx-auto max-w-md rounded-[22px] bg-surface-2 p-4">
        <DirectorBody detail={detail} channel={channel} remote />
      </div>
    ) : (
      <Empty>Ligue o modo gravação da sala, no botão Gravar do PC, para usar a direção.</Empty>
    );
  } else if (current === 'mecenato' && !holder) {
    body = (
      <Empty>
        {contract?.status === 'active' && other
          ? `Agora quem tem os poderes é ${other.displayName}. Quando você virar o Mecenas, as teclas aparecem aqui.`
          : 'Com um contrato de Mecenato em vigor, os poderes viram teclas aqui: voz surpresa, trocar a foto, silenciar e mais.'}
        <button
          type="button"
          onClick={() => {
            exit();
            openSettings('mecenato');
          }}
          className="deck-key mx-auto mt-4 flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-bold"
        >
          Ver o Mecenato
        </button>
      </Empty>
    );
  } else if (current === 'mecenato' && other) {
    body = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1">
            <Avatar name={other.displayName} color={other.avatarColor} src={other.avatarUrl} size={28} />
            <span className="text-sm font-bold">{other.displayName}</span>
            {shielded && (
              <span className="flex items-center gap-1 text-xs font-bold text-warn">
                <Shield size={13} /> Escudo
              </span>
            )}
          </div>
          <div className="ml-auto flex rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Quando a voz muda">
            {[
              [false, 'Na hora'],
              [true, 'Surpresa'],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={surprise === value}
                onClick={() => setSurprise(value as boolean)}
                className={cx('rounded-full px-3 py-1 text-xs font-bold', surprise === value ? 'bg-fg text-surface-1' : 'text-fg-muted')}
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>
        {keys(mecPowers)}
        <div className="pt-1 text-xs font-semibold text-fg-muted">Voz ({surprise ? 'surpresa, em até 1 min e meio' : 'na hora'}, por 4 s)</div>
        {keys(mecVoices)}
      </div>
    );
  } else if (current === 'fun') {
    body = (
      <div className="space-y-3">
        {keys(reactionItems)}
        {nudgeItems.length > 0 && (
          <>
            <div className="pt-1 text-xs font-semibold text-fg-muted">Chamar atenção</div>
            {keys(nudgeItems)}
          </>
        )}
      </div>
    );
  } else {
    const items = current === 'fav' ? favItems : soundItems;
    body = items.length ? (
      keys(items)
    ) : (
      <Empty>{current === 'sounds' ? 'Esta sala ainda não tem sons. Quem pode, sobe na mesa de sons do servidor.' : 'Segure qualquer tecla para pôr aqui.'}</Empty>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex bg-surface-1 text-fg select-none" role="dialog" aria-label="Controle">
      {/* coluna das abas: no celular deitado, a altura é o espaço que falta */}
      <nav
        aria-label="Grupos de teclas"
        className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-surface-2 py-[max(10px,env(safe-area-inset-top))] pl-[env(safe-area-inset-left,0px)]"
      >
        <button type="button" onClick={exit} aria-label="Fechar o controle" className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-surface-3">
          <X size={18} />
        </button>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto" role="tablist" aria-orientation="vertical">
          {where &&
            shown.map((t) => {
              const led = t.id === 'fav' ? 'var(--color-fg)' : LED[t.id];
              const selected = current === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.id)}
                  style={{ '--led': led } as CSSProperties}
                  className={cx(
                    'relative flex w-[62px] flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-bold transition-colors',
                    selected ? 'bg-surface-1 text-fg shadow-sm' : 'text-fg-muted',
                  )}
                >
                  {selected && <span className="absolute top-2 left-0 h-6 w-1 rounded-r-full bg-[var(--led)]" />}
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
        </div>
        {document.fullscreenEnabled && (
          <button type="button" onClick={() => void fullscreen()} aria-label="Tela cheia" className="flex h-10 w-10 items-center justify-center rounded-full text-fg-muted">
            <Maximize2 size={17} />
          </button>
        )}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2 pr-[max(16px,env(safe-area-inset-right))]">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold">{channel?.name ?? 'Controle'}</div>
            <div className="truncate text-[11px] text-fg-muted">{detail ? detail.server.name : 'Concord'}</div>
          </div>
          {people.length > 0 && (
            <div className="ml-auto flex -space-x-2" aria-label={`${people.length} na sala`}>
              {people.slice(0, 6).map((m) => (
                <span key={m.id} className="rounded-full ring-2 ring-surface-1">
                  <Avatar name={memberName(m)} color={m.avatarColor} src={m.avatarUrl} size={26} />
                </span>
              ))}
            </div>
          )}
        </header>
        {/* a chapa do deck */}
        <div className="deck-plate mx-3 mb-[max(10px,env(safe-area-inset-bottom))] min-h-0 flex-1 overflow-y-auto rounded-[26px] p-3 mr-[max(12px,env(safe-area-inset-right))]">
          {body}
        </div>
      </div>

      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-[max(18px,env(safe-area-inset-bottom))] flex justify-center pl-[76px]">
        {status && (
          <span className={cx('animate-pop-in rounded-full px-4 py-1.5 text-xs font-bold shadow-lg', status.ok ? 'bg-fg text-surface-1' : 'bg-danger text-white')}>
            {status.text}
          </span>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onAvatarFile(e.target.files?.[0])} />
      {portrait && !standing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1/95 p-8 text-center backdrop-blur">
          <Smartphone size={44} className="deck-rotate text-accent" />
          <p className="max-w-xs text-sm font-semibold">Deite o celular: as teclas ficam maiores e cabem todas na tela.</p>
          <div className="flex gap-2">
            <button type="button" onClick={exit} className="rounded-full bg-surface-3 px-4 py-2 text-xs font-bold">
              Fechar
            </button>
            <button type="button" onClick={() => setStanding(true)} className="rounded-full bg-surface-3 px-4 py-2 text-xs font-bold">
              Usar em pé mesmo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="mx-auto mt-8 max-w-sm text-center text-sm text-fg-muted">{children}</div>;
}

/** Tecla do deck: toque dispara, segurar põe ou tira dos favoritos. O LED pisca quando deu certo. */
function DeckKey({ item, favorite, fired, onPress, onHold }: { item: Item; favorite: boolean; fired: boolean; onPress: () => void; onHold: () => void }) {
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
      aria-label={item.aria ?? item.label}
      aria-pressed={item.on ?? undefined}
      title={item.disabled ?? item.aria ?? item.label}
      style={{ '--led': item.danger ? 'var(--color-live)' : LED[item.group] } as CSSProperties}
      className={cx(
        'deck-key relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[20px] px-1.5 pt-3 pb-2 text-center',
        item.on && 'deck-key-on',
        fired && 'deck-key-fired',
        item.danger && 'text-live',
        item.disabled && 'opacity-40',
      )}
    >
      <span className="deck-led absolute top-2 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full" />
      {item.visual}
      {!item.hideLabel && <span className="line-clamp-2 text-[11px] leading-tight font-bold">{item.label}</span>}
      {item.sub && <span className="-mt-1 text-[10px] font-semibold text-fg-muted">{item.sub}</span>}
      {favorite && <Star size={11} className="absolute top-1.5 right-2 fill-current text-warn" />}
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
  // no próprio celular não faz sentido mostrar o QR
  if (deckAvailable()) return null;
  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Controlar pelo celular (sons, zoeira e Mecenato)"
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
          <p className="text-xs text-fg-muted">Abra com a câmera, na mesma conta. Sons, zoeira e Mecenato num deck, sem sair da call daqui.</p>
          <p className="text-[11px] text-fg-subtle">No app do celular, também fica em Controle, na barra de baixo.</p>
        </div>
      )}
    </div>
  );
}
