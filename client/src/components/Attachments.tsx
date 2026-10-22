// Anexos nas conversas (canais, chat da call e DMs): o arquivo sobe assim que é escolhido e só
// aparece para alguém quando a mensagem é enviada junto com ele.
import { Download, FileText, Paperclip, X } from 'lucide-react';
import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { getToken } from '../lib/api';
import type { Attachment } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Spinner, cx } from './ui';

const MAX_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 10;
// o servidor confere de novo; aqui é só para avisar antes de enviar
const ACCEPT =
  '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.json,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.zip,.rar,.7z,.mp3,.ogg,.wav,.m4a,.flac,.mp4,.webm,.mov,.mkv';
const ALLOWED = new Set(ACCEPT.split(',').map((e) => e.slice(1)));

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

async function upload(file: File): Promise<Attachment> {
  const token = getToken();
  const res = await fetch(`/api/attachments?name=${encodeURIComponent(file.name || 'arquivo')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? (res.status === 413 ? 'Arquivo muito grande (máx. 20 MB)' : `Erro ${res.status}`));
  return data as Attachment;
}

interface Pending {
  key: string;
  name: string;
  done?: Attachment;
}

/** Arquivos escolhidos para a próxima mensagem. */
export function useAttachmentDraft() {
  const [items, setItems] = useState<Pending[]>([]);

  function add(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    if (items.length + list.length > MAX_FILES) return toast.error(`Até ${MAX_FILES} arquivos por mensagem`);
    for (const file of list) {
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
      // imagem colada da área de transferência vem sem nome
      const named = ext ? file : new File([file], `imagem.${file.type.split('/')[1] || 'png'}`, { type: file.type });
      const realExt = ext || named.name.split('.').pop()!;
      if (!ALLOWED.has(realExt)) {
        toast.error(`"${file.name}": tipo de arquivo não permitido`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`"${file.name}" passa de 20 MB`);
        continue;
      }
      const key = crypto.randomUUID();
      setItems((cur) => [...cur, { key, name: named.name }]);
      upload(named).then(
        (done) => setItems((cur) => cur.map((p) => (p.key === key ? { ...p, done } : p))),
        (err) => {
          setItems((cur) => cur.filter((p) => p.key !== key));
          toast.error(`"${named.name}": ${(err as Error).message}`);
        },
      );
    }
  }

  return {
    items,
    add,
    remove: (key: string) => setItems((cur) => cur.filter((p) => p.key !== key)),
    clear: () => setItems([]),
    /** algum arquivo ainda subindo: espera antes de enviar */
    uploading: items.some((p) => !p.done),
    ids: items.flatMap((p) => (p.done ? [p.done.id] : [])),
    /** colar (Ctrl+V) um print ou arquivo direto no campo de mensagem */
    onPaste: (e: ClipboardEvent) => {
      if (e.clipboardData.files.length) {
        e.preventDefault();
        add(e.clipboardData.files);
      }
    },
    /** arrastar arquivos para cima do campo de mensagem */
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      add(e.dataTransfer.files);
    },
  };
}

/** Botão de clipe ao lado do campo de mensagem. */
/** Abre o seletor de arquivos para anexar (usado pelo menu + do chat estreito, que não tem o botão de clipe). */
export function pickAttachments(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT;
    input.onchange = () => resolve(input.files);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function AttachButton({ onFiles, disabled }: { onFiles: (files: FileList) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label="Anexar arquivo"
        title="Anexar arquivo (até 20 MB)"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Paperclip size={19} />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** Arquivos esperando o envio, logo acima do campo de mensagem. */
export function PendingAttachments({ items, onRemove }: { items: Pending[]; onRemove: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((p) => (
        <span key={p.key} className="flex max-w-60 items-center gap-2 rounded-2xl bg-surface-3 py-1.5 pr-1.5 pl-3 text-sm">
          {p.done ? <FileText size={15} className="shrink-0 text-fg-muted" /> : <Spinner size={14} />}
          <span className="truncate font-semibold">{p.name}</span>
          {p.done && <span className="shrink-0 text-xs text-fg-subtle">{formatSize(p.done.size)}</span>}
          <button
            type="button"
            aria-label={`Remover ${p.name}`}
            onClick={() => onRemove(p.key)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-4 hover:text-fg"
          >
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}

/** Anexos dentro da mensagem: imagem com prévia (clique amplia), o resto como cartão para baixar. */
export function MessageAttachments({ items, mine }: { items: Attachment[] | undefined; mine: boolean }) {
  const openModal = useApp((s) => s.openModal);
  if (!items?.length) return null;
  return (
    <div className={cx('mt-1.5 flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
      {items.map((a) =>
        a.image ? (
          <button key={a.id} onClick={() => openModal({ type: 'image', src: a.url, alt: a.name })} className="block overflow-hidden rounded-2xl">
            <img src={a.url} alt={a.name} loading="lazy" className="max-h-72 max-w-full rounded-2xl object-contain" />
          </button>
        ) : (
          <a
            key={a.id}
            href={a.url}
            download={a.name}
            className="flex w-72 max-w-full items-center gap-3 rounded-2xl bg-surface-3 p-3 ring-1 ring-line transition-colors hover:bg-surface-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <FileText size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{a.name}</span>
              <span className="block text-xs text-fg-muted">{formatSize(a.size)}</span>
            </span>
            <Download size={17} className="shrink-0 text-fg-muted" />
          </a>
        ),
      )}
    </div>
  );
}
