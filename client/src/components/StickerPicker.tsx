// Figurinhas do chat: botão no campo de mensagem com os packs da pessoa, importação (.wastickers/.zip do
// WhatsApp ou imagens soltas) e a figurinha que aparece na conversa (com "adicionar este pack").
import { Check, CircleMinus, Pencil, Plus, Sticker, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MAX_PACK_STICKERS } from '../../../shared/cosmetics.ts';
import { api } from '../lib/api';
import { importPack, readStickerFiles, uploadStickers, type PackDraft } from '../lib/stickerImport';
import type { StickerMessageData, StickerPack } from '../lib/types';
import { useStickerPacks } from '../store/stickerPacks';
import { toast } from '../store/toast';
import { Button, IconButton, Spinner, cx } from './ui';

export type StickerTarget = { kind: 'channel' | 'dm'; id: string };

const TAB_KEY = 'concord.stickerTab';
const ACCEPT = '.wastickers,.zip,image/webp,image/png,image/gif,image/jpeg';

function readTab() {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

function saveTab(id: string) {
  try {
    localStorage.setItem(TAB_KEY, id);
  } catch {
    // armazenamento indisponível
  }
}

function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

const skippedNote = (n: number) => (n ? ` (${n} ${n === 1 ? 'ficou' : 'ficaram'} de fora: animada grande demais ou formato inválido)` : '');

export function StickerButton({ target }: { target: StickerTarget }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        aria-label="Figurinhas"
        title="Figurinhas"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx('flex h-[50px] w-[50px] items-center justify-center rounded-full transition-colors', open ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
      >
        <Sticker size={20} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 flex h-[420px] w-[min(380px,calc(100vw-32px))] animate-pop-in flex-col overflow-hidden rounded-3xl bg-popover shadow-2xl ring-1 ring-line">
          <StickerPanel target={target} />
        </div>
      )}
    </div>
  );
}

function StickerPanel({ target }: { target: StickerTarget }) {
  const packs = useStickerPacks((s) => s.packs);
  const loaded = useStickerPacks((s) => s.loaded);
  const load = useStickerPacks((s) => s.load);
  const [tab, setTab] = useState<string | null>(readTab);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const active = tab === 'import' ? null : (packs.find((p) => p.id === tab) ?? packs[0] ?? null);
  const select = (id: string) => {
    setTab(id);
    saveTab(id);
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 py-2" role="tablist" aria-label="Packs de figurinhas">
        {packs.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={active?.id === p.id}
            title={p.name}
            onClick={() => select(p.id)}
            className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', active?.id === p.id ? 'bg-surface-4' : 'hover:bg-surface-3')}
          >
            {p.stickers[0] ? <img src={p.stickers[0].url} alt="" className="h-8 w-8 object-contain" draggable={false} /> : <span className="text-sm font-bold">{p.name.slice(0, 1)}</span>}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={!active}
          title="Importar pack"
          onClick={() => setTab('import')}
          className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg-muted', !active ? 'bg-surface-4 text-fg' : 'hover:bg-surface-3 hover:text-fg')}
        >
          <Plus size={20} />
        </button>
      </div>
      {active ? <PackView key={active.id} pack={active} target={target} /> : <ImportView onDone={select} />}
    </>
  );
}

function PackView({ pack, target }: { pack: StickerPack; target: StickerTarget }) {
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(pack.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function send(stickerId: string) {
    const path = target.kind === 'channel' ? `/channels/${target.id}/sticker-messages` : `/dms/${target.id}/sticker-messages`;
    await api.post(path, { stickerId }).catch(toast.error);
  }

  async function rename() {
    setRenaming(false);
    if (name.trim() && name.trim() !== pack.name) await api.patch(`/sticker-packs/${pack.id}`, { name: name.trim() }).catch(toast.error);
  }

  async function add() {
    const files = await pickFiles();
    if (!files.length) return;
    try {
      const draft = await readStickerFiles(files);
      setAdding('Lendo…');
      const r = await uploadStickers(pack.id, draft.images, MAX_PACK_STICKERS - pack.stickers.length, (d, t) => setAdding(`Enviando ${d} de ${t}…`));
      toast.success(`${r.sent} ${r.sent === 1 ? 'figurinha adicionada' : 'figurinhas adicionadas'}${skippedNote(r.skipped)}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setAdding(null);
    }
  }

  async function remove() {
    await api.del(`/sticker-packs/${pack.id}`).catch(toast.error);
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {pack.stickers.length === 0 ? (
          <p className="p-6 text-center text-sm text-fg-muted">Pack vazio.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {pack.stickers.map((s) => (
              <div key={s.id} className="relative">
                <button
                  title={editing ? undefined : 'Enviar'}
                  disabled={editing}
                  onClick={() => void send(s.id)}
                  className="flex aspect-square w-full items-center justify-center rounded-2xl p-1 transition-transform hover:bg-surface-3 active:scale-95 disabled:hover:bg-transparent"
                >
                  <img src={s.url} alt="Figurinha" loading="lazy" draggable={false} className="max-h-full max-w-full object-contain" />
                </button>
                {editing && (
                  <IconButton
                    label="Tirar do pack"
                    danger
                    className="absolute top-0 right-0 h-7 w-7 bg-popover shadow"
                    onClick={() => void api.del(`/sticker-packs/${pack.id}/stickers/${s.id}`).catch(toast.error)}
                  >
                    <X size={14} />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-line px-3 py-2">
        {renaming ? (
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename();
              if (e.key === 'Escape') {
                setName(pack.name);
                setRenaming(false);
              }
            }}
            aria-label="Nome do pack"
            className="h-8 min-w-0 flex-1 rounded-lg bg-surface-3 px-2 text-sm outline-none ring-2 ring-accent"
          />
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{pack.name}</p>
            <p className="truncate text-xs text-fg-muted">
              {adding ?? `${pack.stickers.length} ${pack.stickers.length === 1 ? 'figurinha' : 'figurinhas'}${pack.author ? ` · ${pack.author}` : ''}`}
            </p>
          </div>
        )}
        {confirmRemove ? (
          <>
            <Button variant="danger" className="h-8 px-3" onClick={() => void remove()}>
              Remover
            </Button>
            <IconButton label="Cancelar" className="h-8 w-8" onClick={() => setConfirmRemove(false)}>
              <X size={16} />
            </IconButton>
          </>
        ) : (
          <>
            {pack.mine && !renaming && (
              <>
                <IconButton label="Adicionar figurinhas" className="h-8 w-8" disabled={!!adding} onClick={() => void add()}>
                  {adding ? <Spinner size={14} /> : <Upload size={16} />}
                </IconButton>
                <IconButton label="Renomear" className="h-8 w-8" onClick={() => setRenaming(true)}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton label={editing ? 'Pronto' : 'Tirar figurinhas'} active={editing} className="h-8 w-8" onClick={() => setEditing(!editing)}>
                  {editing ? <Check size={16} /> : <CircleMinus size={16} />}
                </IconButton>
              </>
            )}
            <IconButton label="Remover pack das minhas figurinhas" danger className="h-8 w-8" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={15} />
            </IconButton>
          </>
        )}
      </div>
    </>
  );
}

function ImportView({ onDone }: { onDone: (packId: string) => void }) {
  const [draft, setDraft] = useState<PackDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = (draft?.images ?? []).slice(0, 12).map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [draft]);

  async function read(files: File[]) {
    if (!files.length) return;
    setReading(true);
    try {
      const next = await readStickerFiles(files);
      if (!next.images.length) throw new Error('Nenhuma figurinha encontrada. Escolha um .wastickers, .zip ou imagens (WEBP, PNG, GIF).');
      setDraft({ ...next, name: next.name.slice(0, 40) });
    } catch (err) {
      toast.error(err);
    } finally {
      setReading(false);
    }
  }

  async function confirm() {
    if (!draft?.name.trim()) return toast.info('Dê um nome ao pack.');
    setProgress('Criando o pack…');
    try {
      const r = await importPack(draft, (d, t) => setProgress(`Enviando ${d} de ${t}…`));
      toast.success(`Pack "${r.pack.name}" importado: ${r.sent} ${r.sent === 1 ? 'figurinha' : 'figurinhas'}${skippedNote(r.skipped)}`);
      await useStickerPacks.getState().load();
      onDone(r.pack.id);
    } catch (err) {
      toast.error(err);
      setProgress(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void read([...e.dataTransfer.files]);
  }

  if (draft) {
    const extra = Math.max(0, draft.images.length - MAX_PACK_STICKERS);
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-fg-subtle">Nome do pack</span>
          <input
            autoFocus
            value={draft.name}
            maxLength={40}
            disabled={!!progress}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && void confirm()}
            className="h-10 w-full rounded-xl bg-surface-3 px-3 text-sm outline-none focus:ring-2 focus:ring-accent/60"
          />
        </label>
        <div className="grid grid-cols-6 gap-1">
          {previews.map((src) => (
            <img key={src} src={src} alt="" className="aspect-square w-full object-contain" />
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          {draft.images.length} {draft.images.length === 1 ? 'figurinha' : 'figurinhas'}
          {draft.author && ` · ${draft.author}`}
          {extra > 0 && ` · só as ${MAX_PACK_STICKERS} primeiras entram`}
        </p>
        <div className="mt-auto flex items-center justify-end gap-2">
          {progress ? (
            <span className="flex items-center gap-2 text-sm text-fg-muted">
              <Spinner size={16} /> {progress}
            </span>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Voltar
              </Button>
              <Button onClick={() => void confirm()}>Importar</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <button
        onClick={() => void pickFiles().then(read)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={reading}
        className={cx(
          'flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60 hover:bg-surface-3',
        )}
      >
        {reading ? <Spinner /> : <Upload size={26} className="text-accent" />}
        <span className="text-sm font-bold">Importar pack de figurinhas</span>
        <span className="text-xs text-fg-muted">Arraste aqui ou clique: arquivo .wastickers / .zip, ou várias imagens (WEBP, PNG, GIF)</span>
      </button>
      <div className="space-y-1.5 text-xs text-fg-muted">
        <p className="font-bold text-fg-subtle">Como tirar do WhatsApp</p>
        <p>
          <b>Android:</b> no gerenciador de arquivos, abra <code className="rounded bg-surface-3 px-1">Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Stickers</code>, selecione as
          figurinhas e mande para o computador (ou arraste direto, se estiver no PC).
        </p>
        <p>
          <b>WhatsApp Web / Desktop:</b> clique com o botão direito numa figurinha e escolha "Salvar imagem".
        </p>
        <p>
          <b>Apps de figurinhas</b> (Sticker Maker e outros) exportam o pack inteiro como <code className="rounded bg-surface-3 px-1">.wastickers</code>, com nome e tudo.
        </p>
        <p>As animadas continuam animadas.</p>
      </div>
    </div>
  );
}

/** Figurinha numa conversa: grande e sem balão. Clicar mostra o pack e deixa salvar nas suas figurinhas. */
export function StickerMessage({ data, mine }: { data: StickerMessageData; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const loaded = useStickerPacks((s) => s.loaded);
  const owned = useStickerPacks((s) => s.packs.some((p) => p.id === data.packId));

  function toggle() {
    if (!open && !loaded) void useStickerPacks.getState().load();
    setOpen(!open);
  }

  async function save() {
    setSaving(true);
    try {
      await api.post(`/sticker-packs/${data.packId}/save`);
      await useStickerPacks.getState().load();
      toast.success(`Pack "${data.packName}" adicionado às suas figurinhas`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <button onClick={toggle} title={`Pack "${data.packName}"`} className="rounded-2xl">
        <img src={data.url} alt={`Figurinha do pack ${data.packName}`} loading="lazy" draggable={false} className="h-36 w-36 object-contain" />
      </button>
      {open && (
        <div className="mt-1 flex animate-pop-in items-center gap-2 rounded-2xl bg-surface-3 px-3 py-2 text-xs">
          <span className="max-w-48 truncate">
            Pack <b>{data.packName}</b>
          </span>
          {!loaded ? (
            <Spinner size={14} />
          ) : owned ? (
            <span className="flex items-center gap-1 text-fg-muted">
              <Check size={13} /> nas suas figurinhas
            </span>
          ) : (
            <Button className="h-7 px-3 text-xs" loading={saving} onClick={() => void save()}>
              Adicionar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
