import { Check, ClipboardCopy, Copy, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CLIP_EVENT, clipSettings, copyText, shareClip, type ClipEvent } from '../lib/clip';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Toggle, cx } from './ui';

/** Cartão do código dentro do papo da sala, com botão de copiar. */
export function ClipCard({ text, author }: { text: string; author: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-[min(320px,100%)] rounded-[22px] bg-surface-2 p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fg-muted">
        <ClipboardCopy size={14} className="text-accent" /> {author} compartilhou um código
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-surface-0 px-3 py-2 font-mono text-lg font-bold text-accent select-all">{text}</code>
        <button
          aria-label="Copiar código"
          title="Copiar"
          onClick={async () => {
            if (await copyText(text)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } else toast.error('Não foi possível copiar');
          }}
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
            copied ? 'bg-ok text-white' : 'bg-accent text-on-accent hover:bg-accent-hover',
          )}
        >
          {copied ? <Check size={17} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

/** Botão da barra da sala: digitar e mandar um código para todo mundo da sala. */
export function ClipButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const me = useApp((s) => s.me);
  const saveSettings = useApp((s) => s.saveSettings);
  const prefs = clipSettings(me);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function send() {
    setSending(true);
    if (await shareClip(text)) {
      setText('');
      setOpen(false);
    }
    setSending(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        title="Compartilhar código com a sala"
        aria-label="Compartilhar código com a sala"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex h-[52px] w-[52px] items-center justify-center rounded-full transition-all hover:scale-105',
          open ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg hover:bg-surface-4',
        )}
      >
        <ClipboardCopy size={20} />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-3 w-[340px] -translate-x-1/2 animate-pop-in rounded-[24px] bg-popover p-4 shadow-2xl ring-1 ring-line">
          <div className="mb-1 font-display font-bold">Compartilhar código</div>
          <p className="mb-3 text-xs text-fg-muted">Aparece por cima da tela de quem está na sala, até dentro do jogo. É só apertar Ctrl+C para copiar.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              placeholder="Ex.: X7K2-PQ9"
              aria-label="Código"
              className="h-11 min-w-0 flex-1 rounded-full bg-surface-0 px-4 font-mono text-[15px] outline-none ring-accent focus:ring-2"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              aria-label="Enviar código"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
            >
              <Send size={17} />
            </button>
          </form>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-xs text-fg-muted">Receber códigos da sala</span>
            <Toggle checked={prefs.receive} onChange={(receive) => void saveSettings({ clips: { ...prefs, receive } })} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Pop-up do código dentro do app (navegador ou app desktop sem a janelinha nova). */
export function ClipToast() {
  const [clip, setClip] = useState<ClipEvent | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onClip = (e: Event) => {
      setClip((e as CustomEvent<ClipEvent>).detail);
      setCopied(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setClip(null), 20_000);
    };
    window.addEventListener(CLIP_EVENT, onClip);
    return () => window.removeEventListener(CLIP_EVENT, onClip);
  }, []);

  useEffect(() => {
    if (!clip) return;
    const copy = async () => {
      if (await copyText(clip.text)) {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setClip(null), 3000);
      }
    };
    // Ctrl+C copia o código (se não houver outro texto selecionado)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        e.preventDefault();
        void copy();
      }
      if (e.key === 'Escape') setClip(null);
    };
    window.addEventListener('keydown', onKey);
    if (clipSettings(useApp.getState().me).autoCopy) void copy();
    return () => window.removeEventListener('keydown', onKey);
  }, [clip]);

  if (!clip) return null;
  const from = clip.from.nickname || clip.from.displayName;
  return (
    <div role="alert" className="fixed top-5 left-1/2 z-[90] w-[min(440px,92vw)] -translate-x-1/2 animate-pop-in">
      <div className="relative overflow-hidden rounded-[22px] bg-popover p-4 pr-12 shadow-2xl ring-1 ring-line">
        <div className="text-xs text-fg-muted">
          📋 <b className="text-fg">{from}</b> compartilhou um código
        </div>
        <button
          onClick={() => void copyText(clip.text).then((ok) => ok && setCopied(true))}
          title="Clique para copiar"
          className={cx('mt-1 block max-w-full truncate font-mono text-2xl font-bold', copied ? 'text-ok' : 'text-accent')}
        >
          {clip.text}
        </button>
        <div className="mt-1 text-xs text-fg-muted">
          {copied ? (
            '✔ Copiado! Agora é só Ctrl + V'
          ) : (
            <>
              Aperte <kbd className="rounded border border-line-strong px-1.5 font-sans">Ctrl</kbd> + <kbd className="rounded border border-line-strong px-1.5 font-sans">C</kbd> ou clique no código
            </>
          )}
        </div>
        <button aria-label="Fechar" onClick={() => setClip(null)} className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
