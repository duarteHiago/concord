import { Clapperboard, ExternalLink, QrCode, Smartphone, Square, Volume2, Wand2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { PRANK_EFFECTS } from '../../../shared/contracts.ts';
import { api } from '../lib/api';
import { memberName, type Channel, type ServerDetail } from '../lib/types';
import { EFFECTS } from '../lib/voiceEffects';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Avatar, cx } from './ui';

/** Selo em cima do nome da sala quando o modo gravação da equipe está ligado. */
export function RecordingPill({ className }: { className?: string }) {
  return (
    <span
      title="A equipe do Concord está gravando esta sala para um vídeo (com o programa dela, não pelo Concord)"
      className={cx('inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold text-live', className)}
    >
      <span className="recording-dot h-2 w-2 rounded-full bg-live" />
      Gravando
    </span>
  );
}

// 0 = fixo: fica até tirar, a pessoa sair da sala ou a gravação acabar
const DURATIONS = [3, 5, 10, 15, 0];

/** Painel de direção solto numa janela própria (a sala que ele controla), em qualquer tela do app. */
const useDirectorWindow = create<{ target: { serverId: string; channelId: string } | null; set: (t: { serverId: string; channelId: string } | null) => void }>(
  (set) => ({ target: null, set: (target) => set({ target }) }),
);

async function setRecording(channelId: string, on: boolean) {
  try {
    await api.post(`/channels/${channelId}/recording`, { on });
    return true;
  } catch (err) {
    toast.error(err);
    return false;
  }
}

/**
 * Controles do modo gravação no cabeçalho da sala (só a equipe, nas salas do servidor da equipe):
 * ligar/desligar e o painel de direção para disparar efeitos em quem está na sala.
 */
export function RecordingControls({ detail, channel }: { detail: ServerDetail; channel: Channel }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const recording = !!channel.recording;
  const popped = useDirectorWindow((s) => s.target?.channelId === channel.id);
  const setWindow = useDirectorWindow((s) => s.set);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!channel.canRecord) return null;

  const toggle = async () => {
    setBusy(true);
    if ((await setRecording(channel.id, !recording)) && recording) setOpen(false);
    setBusy(false);
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        title={recording ? 'Desligar o modo gravação' : 'Ligar o modo gravação (desliga sozinho em 3 h)'}
        className={cx(
          'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors disabled:opacity-60',
          recording ? 'bg-live text-white hover:bg-live/85' : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg',
        )}
      >
        {recording ? <Square size={13} fill="currentColor" /> : <span className="h-2.5 w-2.5 rounded-full bg-live" />}
        {recording ? 'Parar' : 'Gravar'}
      </button>
      {recording && (
        <button
          type="button"
          onClick={() => (popped ? setWindow({ serverId: detail.server.id, channelId: channel.id }) : setOpen(!open))}
          aria-expanded={open}
          title={popped ? 'O painel está numa janela separada' : 'Painel de direção'}
          className={cx(
            'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors',
            open ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg hover:bg-surface-4',
          )}
        >
          <Clapperboard size={15} /> {popped ? 'Na janela' : 'Direção'}
        </button>
      )}
      {open && recording && !popped && (
        <div
          role="dialog"
          aria-label="Painel de direção"
          className="absolute top-full right-0 z-40 mt-2 w-[340px] max-w-[calc(100vw-24px)] animate-pop-in rounded-[22px] border border-line-strong bg-surface-2 p-4 shadow-2xl"
        >
          <DirectorBody
            detail={detail}
            channel={channel}
            onPopOut={() => {
              setWindow({ serverId: detail.server.id, channelId: channel.id });
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** O conteúdo do painel: quem, voz, tremer a tela e a mesa de sons. Igual no menu e na janela separada. */
/** Endereço do controle remoto: abre só o painel, sem entrar na call (para usar no celular). */
export function remoteUrl(serverId: string, channelId: string) {
  return `${location.origin}/?direcao=${encodeURIComponent(channelId)}&servidor=${encodeURIComponent(serverId)}`;
}

/** QR code do controle remoto: aponta a câmera do celular e a Direção abre lá, sem tirar você da call do PC. */
function RemoteQr({ serverId, channelId }: { serverId: string; channelId: string }) {
  const [qr, setQr] = useState('');
  const url = remoteUrl(serverId, channelId);
  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr, () => setQr(''));
  }, [url]);
  return (
    <div className="space-y-2 rounded-2xl bg-surface-1 p-3 text-center ring-1 ring-line">
      {qr ? <img src={qr} alt="QR code do controle remoto" className="mx-auto h-44 w-44 rounded-lg bg-white p-1" /> : <div className="mx-auto h-44 w-44" />}
      <p className="text-xs text-fg-muted">Abra com a câmera do celular, na mesma conta. O painel abre lá sem entrar na call.</p>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(url).then(() => toast.success('Link copiado'), () => {})}
        className="text-[11px] font-semibold text-accent hover:underline"
      >
        Copiar o link
      </button>
    </div>
  );
}

function DirectorBody({ detail, channel, onPopOut, remote }: { detail: ServerDetail; channel: Channel; onPopOut?: () => void; remote?: boolean }) {
  const me = useApp((s) => s.me);
  const states = useApp((s) => s.voiceStates[detail.server.id]) ?? [];
  const sounds = useApp((s) => s.sounds[detail.server.id]);
  const loadSounds = useApp((s) => s.loadSounds);
  const inRoom = states
    .filter((v) => v.channelId === channel.id)
    .flatMap((v) => {
      const m = detail.members.find((x) => x.id === v.userId);
      return m ? [m] : [];
    });
  const [target, setTarget] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  // a confirmação aparece aqui mesmo: na janela separada, os avisos da janela principal ficam escondidos
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const picked = inRoom.find((m) => m.id === target) ?? inRoom.find((m) => m.id !== me?.id) ?? inRoom[0];

  useEffect(() => {
    if (!sounds) void loadSounds(detail.server.id);
  }, [sounds, loadSounds, detail.server.id]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 2200);
    return () => clearTimeout(t);
  }, [status]);

  const run = async (call: () => Promise<unknown>, done: string) => {
    try {
      await call();
      setStatus({ text: done, ok: true });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : 'Não deu certo', ok: false });
    }
  };
  const fire = (body: Record<string, unknown>, done: string) =>
    picked && run(() => api.post(`/channels/${channel.id}/director`, { userId: picked.id, ...body }), done);

  const effects = EFFECTS.filter((e) => (PRANK_EFFECTS as readonly string[]).includes(e.id));
  const who = picked ? memberName(picked) : '';
  const active = channel.recording?.effects ?? {};
  const pickedFx = picked ? active[picked.id] : undefined;
  const label = (id: string) => EFFECTS.find((e) => e.id === id)?.label ?? id;

  return (
    <div className="space-y-4">
      {!remote && (
        <div className="-mt-1 -mb-1 flex flex-wrap justify-end gap-1">
          <button
            type="button"
            onClick={() => setShowQr(!showQr)}
            aria-expanded={showQr}
            className={cx(
              'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold hover:bg-surface-3 hover:text-fg',
              showQr ? 'bg-surface-3 text-fg' : 'text-fg-muted',
            )}
          >
            <QrCode size={12} /> Controlar pelo celular
          </button>
          {onPopOut && (
            <button
              type="button"
              onClick={onPopOut}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-fg-muted hover:bg-surface-3 hover:text-fg"
            >
              <ExternalLink size={12} /> Abrir em outra janela
            </button>
          )}
        </div>
      )}
      {showQr && !remote && <RemoteQr serverId={detail.server.id} channelId={channel.id} />}
      {inRoom.length === 0 ? (
        <p className="text-sm text-fg-muted">Ninguém na sala ainda.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quem">
            {inRoom.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={picked?.id === m.id}
                title={memberName(m)}
                onClick={() => setTarget(m.id)}
                className={cx('relative rounded-full p-0.5 transition-all', picked?.id === m.id ? 'ring-[3px] ring-accent' : 'opacity-70 hover:opacity-100')}
              >
                <Avatar name={memberName(m)} color={m.avatarColor} src={m.avatarUrl} size={38} />
                {active[m.id] && (
                  <span
                    title={`Com ${label(active[m.id].effect)}`}
                    className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface-2 bg-accent text-on-accent"
                  >
                    <Wand2 size={10} />
                  </span>
                )}
              </button>
            ))}
          </div>
          {picked && (
            <div className="-mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {who}
                {pickedFx && (
                  <span className="ml-1.5 text-xs font-semibold text-accent">
                    com {label(pickedFx.effect)}
                    {pickedFx.until === null ? ' (fixo)' : ''}
                  </span>
                )}
              </span>
              {pickedFx && (
                <button
                  type="button"
                  onClick={() => void fire({ action: 'fx_off' }, `Voz normal de novo para ${who}`)}
                  className="shrink-0 rounded-full bg-surface-3 px-3 py-1 text-xs font-bold hover:bg-surface-4"
                >
                  Tirar efeito
                </button>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-fg-muted">Voz</span>
              <div className="flex gap-1">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSeconds(d)}
                    className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', seconds === d ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg-muted')}
                  >
                    {d ? `${d} s` : 'Fixo'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {effects.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  title={e.hint}
                  aria-pressed={pickedFx?.effect === e.id}
                  onClick={() =>
                    void (pickedFx?.effect === e.id
                      ? fire({ action: 'fx_off' }, `Voz normal de novo para ${who}`)
                      : fire({ action: 'fx', effect: e.id, durationMs: seconds * 1000 }, `${e.label} em ${who}${seconds ? '' : ' (fixo)'}`))
                  }
                  className={cx(
                    'rounded-xl px-1 font-semibold hover:bg-accent hover:text-on-accent active:bg-accent active:text-on-accent',
                    pickedFx?.effect === e.id ? 'bg-accent text-on-accent ring-2 ring-accent/40' : 'bg-surface-3',
                    remote ? 'py-3.5 text-xs' : 'py-2 text-[11px]',
                  )}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void fire({ action: 'shake' }, `Tela de ${who} tremendo`)}
            className={cx('flex w-full items-center justify-center gap-2 rounded-xl bg-accent-2/15 text-sm font-bold text-accent-2 hover:bg-accent-2/25 active:bg-accent-2/30', remote ? 'py-4' : 'py-2.5')}
          >
            <Smartphone size={16} /> Tremer a tela
          </button>

          {!!sounds?.length && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fg-muted">
                <Volume2 size={13} /> Mesa de sons (toca para a sala)
              </div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {sounds.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void run(() => api.post(`/sounds/${s.id}/play`), `Tocando "${s.name}"`)}
                    className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold hover:bg-surface-4"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <p aria-live="polite" className={cx('min-h-4 text-center text-xs font-semibold', status?.ok === false ? 'text-danger' : 'text-ok')}>
        {status?.text ?? ''}
      </p>
    </div>
  );
}

/** Copia os estilos e o tema (variáveis no <html>) da janela principal para a separada, e mantém em dia. */
function mirrorStyles(win: Window) {
  const doc = win.document;
  doc.head.querySelectorAll('[data-mirror]').forEach((n) => n.remove());
  for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.dataset.mirror = '';
    doc.head.appendChild(copy);
  }
  const syncRoot = () => {
    const from = document.documentElement;
    const to = doc.documentElement;
    to.setAttribute('style', from.getAttribute('style') ?? '');
    to.className = from.className;
    for (const key of Object.keys(from.dataset)) to.dataset[key] = from.dataset[key];
    doc.body.style.background = 'var(--color-surface-1)';
  };
  syncRoot();
  const observer = new MutationObserver(syncRoot);
  observer.observe(document.documentElement, { attributes: true });
  return () => observer.disconnect();
}

/**
 * A janela separada do painel de direção. Fica montada no App (não na sala), então continua funcionando
 * enquanto você navega pelo Concord. No app desktop ela fica sempre por cima (ver desktop/main.cjs).
 */
export function DirectorWindowHost() {
  const target = useDirectorWindow((s) => s.target);
  const setWindow = useDirectorWindow((s) => s.set);
  const detail = useApp((s) => (target ? s.details[target.serverId] : undefined));
  const channel = detail?.channels.find((c) => c.id === target?.channelId);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const winRef = useRef<Window | null>(null);

  useEffect(() => {
    if (!target) return;
    const existing = winRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const w = window.open('', 'concord-director', 'popup=yes,width=380,height=640');
    if (!w) {
      toast.error('O navegador bloqueou a janela. Libere janelas pop-up para o Concord e tente de novo.');
      setWindow(null);
      return;
    }
    winRef.current = w;
    w.document.title = 'Direção · Concord';
    w.document.body.innerHTML = '';
    w.document.body.style.margin = '0';
    const stopMirror = mirrorStyles(w);
    const root = w.document.createElement('div');
    w.document.body.appendChild(root);
    setContainer(root);
    const onClose = () => setWindow(null);
    w.addEventListener('pagehide', onClose);
    const closeWithApp = () => w.close();
    window.addEventListener('beforeunload', closeWithApp);
    return () => {
      stopMirror();
      w.removeEventListener('pagehide', onClose);
      window.removeEventListener('beforeunload', closeWithApp);
    };
  }, [target, setWindow]);

  useEffect(() => {
    if (target) return;
    winRef.current?.close();
    winRef.current = null;
    setContainer(null);
  }, [target]);

  if (!target || !container || !detail || !channel) return null;
  return createPortal(
    <div className="min-h-screen bg-surface-1 p-4 font-sans text-fg">
      <div className="mb-3 flex items-center gap-2">
        <Clapperboard size={16} className="text-fg-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{channel.name}</span>
        {channel.recording ? (
          <button
            type="button"
            onClick={() => void setRecording(channel.id, false)}
            className="flex items-center gap-1.5 rounded-full bg-live px-3 py-1 text-xs font-bold text-white hover:bg-live/85"
          >
            <Square size={11} fill="currentColor" /> Parar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void setRecording(channel.id, true)}
            className="flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs font-bold hover:bg-surface-4"
          >
            <span className="h-2 w-2 rounded-full bg-live" /> Gravar
          </button>
        )}
      </div>
      {channel.recording ? (
        <>
          <RecordingPill className="mb-3" />
          <DirectorBody detail={detail} channel={channel} />
        </>
      ) : (
        <p className="text-sm text-fg-muted">A gravação desta sala está desligada. Ligue para usar a direção.</p>
      )}
    </div>,
    container,
  );
}

/**
 * Controle remoto da direção (abre pelo link ou pelo QR code do painel): só o painel, em tela cheia, sem
 * entrar na call. Assim você continua na sala pelo PC e dispara tudo pelo celular.
 */
export function DirectorRemote({ serverId, channelId }: { serverId: string; channelId: string }) {
  const detail = useApp((s) => s.details[serverId]);
  const loadDetail = useApp((s) => s.loadDetail);
  const [tried, setTried] = useState(false);
  const channel = detail?.channels.find((c) => c.id === channelId);

  useEffect(() => {
    void loadDetail(serverId).finally(() => setTried(true));
  }, [serverId, loadDetail]);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface-1 text-fg">
      <div className="mx-auto w-full max-w-md flex-1 p-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center gap-2">
          <Clapperboard size={18} className="text-fg-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-fg-muted">Direção · controle remoto</div>
            <div className="truncate text-lg font-bold">{channel?.name ?? 'Sala'}</div>
          </div>
          {channel?.canRecord &&
            (channel.recording ? (
              <button
                type="button"
                onClick={() => void setRecording(channel.id, false)}
                className="flex items-center gap-1.5 rounded-full bg-live px-3 py-2 text-xs font-bold text-white"
              >
                <Square size={11} fill="currentColor" /> Parar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setRecording(channel.id, true)}
                className="flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-2 text-xs font-bold"
              >
                <span className="h-2 w-2 rounded-full bg-live" /> Gravar
              </button>
            ))}
        </div>
        {!detail && !tried ? (
          <p className="text-sm text-fg-muted">Carregando a sala…</p>
        ) : !detail || !channel ? (
          <p className="text-sm text-fg-muted">Essa sala não está disponível para esta conta. Entre com a mesma conta do PC.</p>
        ) : !channel.canRecord ? (
          <p className="text-sm text-fg-muted">Só a equipe do Concord usa a direção, e só nas salas do servidor da equipe.</p>
        ) : channel.recording ? (
          <>
            <RecordingPill className="mb-4" />
            <DirectorBody detail={detail} channel={channel} remote />
          </>
        ) : (
          <p className="text-sm text-fg-muted">A gravação desta sala está desligada. Toque em Gravar para usar a direção.</p>
        )}
        <a href="/" className="mt-8 block text-center text-xs font-semibold text-fg-subtle hover:text-fg">
          Abrir o Concord normal
        </a>
      </div>
    </div>
  );
}
