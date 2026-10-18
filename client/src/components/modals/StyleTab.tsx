import { Check, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { FRAMES, MAX_PATCHES, PATCH_SHAPES } from '../../../../shared/cosmetics.ts';
import { api } from '../../lib/api';
import type { Me, Patch } from '../../lib/types';
import { pickImage, prepareImage, uploadImage } from '../../lib/upload';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { PATCH_PRESETS, PATCH_TILTS, PatchBadge } from '../PatchBadge';
import { Avatar, Button, Input, cx } from '../ui';

const FRAME_NAMES: Record<string, string> = {
  neon: 'Neon',
  fire: 'Em chamas',
  rainbow: 'Arco-íris',
  gold: 'Ouro',
  ice: 'Gelo',
  toxic: 'Tóxico',
  galaxy: 'Galáxia',
  pulse: 'Pulso',
  orbit: 'Órbita',
  glitch: 'Glitch',
  hearts: 'Corações',
  sakura: 'Sakura',
};

const SHAPE_NAMES: Record<Patch['shape'], string> = {
  circle: 'Redondo',
  shield: 'Escudo',
  rect: 'Retângulo',
  hex: 'Hexágono',
  star: 'Selo',
  banner: 'Faixa',
};

function Title({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <span className="block text-xs font-bold tracking-wide text-fg-muted uppercase">{children}</span>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  );
}

const newId = () => Math.random().toString(36).slice(2, 10);

export function StyleTab() {
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const [uploadingBg, setUploadingBg] = useState(false);

  async function setFrame(frame: string | null) {
    try {
      setMe(await api.patch<Me>('/me/style', { frame }));
    } catch (err) {
      toast.error(err);
    }
  }

  async function changeCardBg() {
    const file = await pickImage();
    if (!file) return;
    setUploadingBg(true);
    try {
      setMe(await uploadImage<Me>('/me/card-bg', await prepareImage(file, 1000, false)));
      toast.success('Fundo do perfil atualizado');
    } catch (err) {
      toast.error(err);
    }
    setUploadingBg(false);
  }

  const name = me.displayName || me.username;

  return (
    <div className="space-y-7">
      {/* moldura */}
      <section>
        <Title hint="Aparece em volta da sua foto em todo lugar: chat, sala de voz, lista de membros…">Moldura animada</Title>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          <FrameOption label="Nenhuma" active={!me.frame} onClick={() => void setFrame(null)}>
            <Avatar name={name} color={me.avatarColor} src={me.avatarUrl} size={44} />
          </FrameOption>
          {FRAMES.map((f) => (
            <FrameOption key={f} label={FRAME_NAMES[f] ?? f} active={me.frame === f} onClick={() => void setFrame(f)}>
              <Avatar name={name} color={me.avatarColor} src={me.avatarUrl} frame={f} size={44} />
            </FrameOption>
          ))}
        </div>
      </section>

      {/* fundo do mini perfil + prévia */}
      <section className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <Title hint="Imagem ou GIF que preenche o cartão que abre quando clicam em você (até 8 MB).">Fundo do mini perfil</Title>
          <div className="flex gap-2">
            <Button variant="secondary" loading={uploadingBg} onClick={changeCardBg}>
              <ImagePlus size={15} /> {me.cardBgUrl ? 'Trocar fundo' : 'Escolher imagem ou GIF'}
            </Button>
            {me.cardBgUrl && (
              <Button variant="ghost" title="Remover fundo" onClick={() => void api.del<Me>('/me/card-bg').then(setMe, toast.error)}>
                <Trash2 size={15} />
              </Button>
            )}
          </div>
          <PatchesEditor />
        </div>
        <CardPreview me={me} />
      </section>
    </div>
  );
}

function FrameOption({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex flex-col items-center gap-2 rounded-2xl p-3 pt-4 text-[11px] font-semibold transition-colors',
        active ? 'bg-accent/15 text-fg ring-2 ring-accent' : 'bg-surface-0 text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      {children}
      {label}
    </button>
  );
}

/** Prévia do mini perfil como os outros veem. */
function CardPreview({ me }: { me: Me }) {
  const name = me.displayName || me.username;
  const patches = me.patches ?? [];
  const top = me.bannerColor ?? me.avatarColor;
  return (
    <div>
      <Title>Prévia</Title>
      <div
        className="overflow-hidden rounded-[22px] bg-popover bg-cover bg-center ring-1 ring-line"
        style={me.cardBgUrl ? { backgroundImage: `linear-gradient(rgb(0 0 0 / 0.15), rgb(0 0 0 / 0.45)), url("${me.cardBgUrl}")` } : undefined}
      >
        {me.bannerUrl ? (
          <img src={me.bannerUrl} alt="" className="h-20 w-full object-cover" />
        ) : (
          <div className="h-14" style={me.cardBgUrl ? undefined : { background: `linear-gradient(135deg, ${top}, ${top}55)` }} />
        )}
        <div className="px-3 pb-3">
          <div className="-mt-8 mb-2 flex items-end justify-between gap-1">
            <Avatar name={name} color={me.avatarColor} src={me.avatarUrl} frame={me.frame} size={60} status="online" className="rounded-full ring-[5px] ring-surface-1" />
            <div className="flex flex-wrap justify-end pl-1">
              {patches.map((p, i) => (
                <div key={p.id} className="-ml-1.5">
                  <PatchBadge patch={p} size={patches.length > 4 ? 28 : 34} tilt={PATCH_TILTS[i % PATCH_TILTS.length]} />
                </div>
              ))}
            </div>
          </div>
          <div className={cx('rounded-2xl p-2.5', me.cardBgUrl ? 'bg-surface-0/80 backdrop-blur-md' : 'bg-surface-0')}>
            <div className="truncate font-bold">{name}</div>
            <div className="text-xs text-fg-muted">@{me.username}</div>
            {me.bio && <p className="mt-2 line-clamp-3 text-xs">{me.bio}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ patches

function PatchesEditor() {
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const patches = me.patches ?? [];
  const [editing, setEditing] = useState<Patch | null>(null);
  const [gallery, setGallery] = useState(false);
  const full = patches.length >= MAX_PATCHES;

  async function save(next: Patch[]) {
    try {
      setMe(await api.patch<Me>('/me/style', { patches: next }));
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  }

  async function commit(p: Patch) {
    const exists = patches.some((x) => x.id === p.id);
    if (await save(exists ? patches.map((x) => (x.id === p.id ? p : x)) : [...patches, p])) setEditing(null);
  }

  return (
    <div className="mt-6">
      <Title hint={`Bordados que ficam costurados no seu cartão (até ${MAX_PATCHES}). Monte o seu com emoji, texto ou a logo do seu time.`}>Patches</Title>

      <div className="flex flex-wrap items-center gap-2">
        {patches.map((p, i) => (
          <div key={p.id} className="group relative">
            <PatchBadge patch={p} size={56} tilt={PATCH_TILTS[i % PATCH_TILTS.length]} />
            <div className="absolute -top-1.5 -right-1.5 hidden gap-0.5 group-focus-within:flex group-hover:flex">
              <button
                aria-label={`Editar patch ${p.text}`}
                onClick={() => setEditing(p)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-4 text-fg shadow"
              >
                <Pencil size={11} />
              </button>
              <button
                aria-label={`Tirar patch ${p.text}`}
                onClick={() => void save(patches.filter((x) => x.id !== p.id))}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
        {!full && (
          <>
            <Button variant="secondary" className="h-10" onClick={() => setGallery(!gallery)}>
              <Plus size={15} /> Prontos
            </Button>
            <Button
              variant="secondary"
              className="h-10"
              onClick={() => setEditing({ id: newId(), shape: 'shield', bg: '#211a28', border: '#ff8a6b', fg: '#ffffff', icon: '⭐', text: 'MEU TIME' })}
            >
              <Pencil size={14} /> Criar
            </Button>
          </>
        )}
      </div>

      {gallery && !full && (
        <div className="mt-3 grid grid-cols-4 gap-2 rounded-2xl bg-surface-0 p-3 sm:grid-cols-8">
          {PATCH_PRESETS.map((p, i) => (
            <button
              key={i}
              title={`Costurar "${p.text}"`}
              onClick={() => void save([...patches, { ...p, id: newId() }]).then((ok) => ok && patches.length + 1 >= MAX_PATCHES && setGallery(false))}
              className="flex items-center justify-center rounded-xl p-1 hover:bg-surface-2"
            >
              <PatchBadge patch={{ ...p, id: `p${i}` }} size={52} />
            </button>
          ))}
        </div>
      )}

      {editing && <PatchForm initial={editing} onCancel={() => setEditing(null)} onSave={commit} />}
    </div>
  );
}

function PatchForm({ initial, onCancel, onSave }: { initial: Patch; onCancel: () => void; onSave: (p: Patch) => Promise<void> }) {
  const [p, setP] = useState<Patch>(initial);
  const [busy, setBusy] = useState(false);
  const set = (part: Partial<Patch>) => setP((cur) => ({ ...cur, ...part }));

  async function uploadLogo() {
    const file = await pickImage();
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadImage<{ url: string }>('/me/patch-image', await prepareImage(file, 256, false));
      set({ image: url });
    } catch (err) {
      toast.error(err);
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 flex animate-pop-in flex-col gap-4 rounded-2xl bg-surface-0 p-4 sm:flex-row">
      <div className="flex shrink-0 items-center justify-center rounded-2xl bg-surface-2 p-4 sm:w-36">
        <PatchBadge patch={p} size={104} tilt={-4} />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PATCH_SHAPES.map((shape) => (
            <button
              key={shape}
              onClick={() => set({ shape })}
              aria-pressed={p.shape === shape}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-semibold',
                p.shape === shape ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg',
              )}
            >
              {SHAPE_NAMES[shape]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <Input label="Texto" value={p.text} maxLength={14} onChange={(e) => set({ text: e.target.value })} placeholder="Ex.: CLUTCH" />
          <Input label="Emoji" value={p.icon} onChange={(e) => set({ icon: [...e.target.value].slice(0, 4).join('') })} placeholder="🔥" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-fg-muted">
          <ColorField label="Tecido" value={p.bg} onChange={(bg) => set({ bg })} />
          <ColorField label="Borda" value={p.border} onChange={(border) => set({ border })} />
          <ColorField label="Linha" value={p.fg} onChange={(fg) => set({ fg })} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="h-9 text-xs" loading={busy} onClick={uploadLogo}>
            <ImagePlus size={14} /> {p.image ? 'Trocar logo' : 'Usar logo/imagem'}
          </Button>
          {p.image && (
            <Button variant="ghost" className="h-9 text-xs" onClick={() => set({ image: undefined })}>
              Tirar logo
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" className="h-9" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              className="h-9"
              disabled={!p.text.trim() && !p.icon && !p.image}
              onClick={async () => {
                setBusy(true);
                await onSave({ ...p, text: p.text.trim() });
                setBusy(false);
              }}
            >
              <Check size={15} /> Costurar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
      {label}
    </label>
  );
}
