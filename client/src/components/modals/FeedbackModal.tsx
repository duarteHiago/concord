// Feedback para a equipe: bug, sugestão, melhoria ou outro, com até 3 prints (colar, arrastar ou escolher).
// "Meus envios" mostra a situação de cada um (e a pessoa recebe um aviso quando a equipe muda).
import { ImagePlus, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_STATUSES,
  type FeedbackKind,
} from '../../../../shared/feedback.ts';
import { api } from '../../lib/api';
import { desktop } from '../../lib/desktop';
import { prepareImage, uploadImage } from '../../lib/upload';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Button, Modal, Spinner, cx } from '../ui';

interface Mine {
  id: string;
  kind: FeedbackKind;
  body: string;
  images: number;
  status: string;
  teamNote: string;
  createdAt: number;
}

export function FeedbackModal({ initialKind, initialBody, area }: { initialKind?: FeedbackKind; initialBody?: string; area?: string }) {
  const close = useApp((s) => s.closeModal);
  const [tab, setTab] = useState<'enviar' | 'meus'>('enviar');
  const [kind, setKind] = useState<FeedbackKind>(initialKind ?? 'bug');
  const [body, setBody] = useState(initialBody ?? '');
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.url)), [images]);

  const addFiles = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setImages((cur) => {
      const room = FEEDBACK_MAX_IMAGES - cur.length;
      if (imgs.length > room) toast.info(`No máximo ${FEEDBACK_MAX_IMAGES} prints.`);
      return [...cur, ...imgs.slice(0, Math.max(0, room)).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files];
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault();
      addFiles(files);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles([...e.dataTransfer.files]);
  };

  const send = async () => {
    if (body.trim().length < 5) return toast.info('Conta um pouco mais (pelo menos uma frase).');
    setSending(true);
    try {
      const desktopVersion = desktop ? await desktop.info().then((i) => i.version).catch(() => '') : '';
      const { id } = await api.post<{ id: string }>('/feedback', {
        kind,
        body,
        context: {
          commit: __COMMIT__,
          path: location.pathname,
          userAgent: navigator.userAgent,
          desktop: desktopVersion,
          screen: `${window.screen.width}x${window.screen.height}`,
          area: area ?? '',
        },
      });
      for (const img of images) {
        // prints grandes viram WebP de até 2560 px (bem menor que um PNG de tela cheia)
        await uploadImage(`/feedback/${id}/images`, await prepareImage(img.file, 2560, false));
      }
      toast.success('Valeu! A equipe vai ler, e você acompanha em "Meus envios".');
      setBody('');
      setImages([]);
      setTab('meus');
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  };

  const k = FEEDBACK_KINDS.find((x) => x.id === kind)!;

  return (
    <Modal title="Feedback para a equipe" subtitle="Achou um bug, tem uma ideia ou algo podia ser melhor? Conta pra gente: toda mensagem é lida." onClose={close} width={540}>
      <div className="mb-3 flex gap-1 rounded-full bg-surface-3 p-1">
        {(
          [
            ['enviar', 'Escrever'],
            ['meus', 'Meus envios'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cx('flex-1 rounded-full py-1.5 text-sm font-semibold', tab === id ? 'bg-surface-2 shadow-sm' : 'text-fg-muted hover:text-fg')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'enviar' ? (
        <div className="space-y-3" onPaste={onPaste}>
          <div className="grid grid-cols-4 gap-1.5">
            {FEEDBACK_KINDS.map((x) => (
              <button
                key={x.id}
                onClick={() => setKind(x.id)}
                aria-pressed={kind === x.id}
                className={cx('flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-semibold transition', kind === x.id ? 'bg-accent text-on-accent' : 'bg-surface-3 hover:bg-surface-4')}
              >
                <span className="text-lg">{x.emoji}</span>
                {x.label}
              </button>
            ))}
          </div>
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={FEEDBACK_BODY_MAX}
            rows={5}
            placeholder={kind === 'bug' ? 'O que aconteceu? O que você estava fazendo e o que esperava que acontecesse?' : `${k.hint}. Conta os detalhes.`}
            className="w-full resize-none rounded-xl bg-surface-3 p-3 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx('rounded-xl border-2 border-dashed p-2.5 transition', dragging ? 'border-accent bg-accent/5' : 'border-line-strong')}
          >
            <div className="flex flex-wrap items-center gap-2">
              {images.map((img, i) => (
                <div key={img.url} className="relative h-16 w-24 overflow-hidden rounded-lg bg-surface-3">
                  <img src={img.url} alt={`Print ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => setImages((cur) => cur.filter((x) => x !== img))}
                    aria-label="Tirar print"
                    className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {images.length < FEEDBACK_MAX_IMAGES && (
                <button onClick={() => fileRef.current?.click()} className="flex h-16 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-fg-muted hover:bg-surface-3 hover:text-fg">
                  <ImagePlus size={18} /> Anexar print
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles([...(e.target.files ?? [])])} />
            </div>
            <p className="mt-1.5 text-[11px] text-fg-subtle">
              Até {FEEDBACK_MAX_IMAGES} prints: arraste aqui, escolha um arquivo ou cole com Ctrl+V. Dica: Win+Shift+S (ou Cmd+Shift+4 no Mac) tira o print.
            </p>
          </div>
          <p className="text-[11px] text-fg-subtle">Vai junto: a versão do app, o navegador e a página aberta. Nada das suas mensagens. Só a equipe do Concord vê.</p>
          <div className="flex justify-end">
            <Button loading={sending} onClick={() => void send()} disabled={body.trim().length < 5}>
              <Send size={15} /> Enviar
            </Button>
          </div>
        </div>
      ) : (
        <MyFeedback />
      )}
    </Modal>
  );
}

function MyFeedback() {
  const [list, setList] = useState<Mine[] | null>(null);
  useEffect(() => {
    api.get<Mine[]>('/feedback/mine').then(setList, (e) => {
      toast.error(e);
      setList([]);
    });
  }, []);
  if (!list) {
    return (
      <div className="grid h-32 place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!list.length) return <p className="py-8 text-center text-sm text-fg-muted">Você ainda não mandou nenhum feedback.</p>;
  const tone: Record<string, string> = {
    novo: 'bg-surface-4 text-fg-muted',
    vendo: 'bg-warn/20 text-fg',
    planejado: 'bg-accent/15 text-accent',
    feito: 'bg-ok/20 text-fg',
    fechado: 'bg-surface-4 text-fg-subtle',
  };
  return (
    <div className="max-h-[55vh] space-y-2 overflow-y-auto">
      {list.map((f) => {
        const k = FEEDBACK_KINDS.find((x) => x.id === f.kind);
        const s = FEEDBACK_STATUSES.find((x) => x.id === f.status);
        return (
          <div key={f.id} className="rounded-xl bg-surface-3 p-3">
            <div className="mb-1 flex items-center gap-2 text-xs">
              <span>
                {k?.emoji} {k?.label}
              </span>
              <span className="text-fg-subtle">· {new Date(f.createdAt).toLocaleDateString('pt-BR')}</span>
              <span className={cx('ml-auto rounded-full px-2 py-0.5 font-semibold', tone[f.status] ?? tone.novo)}>{s?.label ?? f.status}</span>
            </div>
            <p className="line-clamp-3 text-sm whitespace-pre-wrap">{f.body}</p>
            {f.teamNote && (
              <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs">
                <b>Equipe:</b> {f.teamNote}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
