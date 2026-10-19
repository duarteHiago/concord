import { Check, Copy, Gift, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FRAMES, MAX_PATCHES } from '../../../../shared/cosmetics.ts';
import { api } from '../../lib/api';
import type { Me, Patch, ServerPatch } from '../../lib/types';
import { pickImage, prepareImage, uploadImage } from '../../lib/upload';
import { HOME, useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { PATCH_PRESETS, PATCH_TILTS, PatchBadge } from '../PatchBadge';
import { PatchForm } from '../PatchForm';
import { ServerPatchesPanel, equipPatch, newPatchDraft } from '../ServerPatches';
import { Avatar, Button, ImageHint, cx } from '../ui';

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


function Title({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <span className="block text-xs font-bold tracking-wide text-fg-muted uppercase">{children}</span>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </div>
  );
}


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
      setMe(await uploadImage<Me>('/me/card-bg', await prepareImage(file, 1200, 2 / 3)));
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
          <ImageHint spec="cardBg" className="mb-3" />
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
          <img src={me.bannerUrl} alt="" className="aspect-[3/1] w-full object-cover" />
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
  const servers = useApp((s) => s.servers);
  const activeServerId = useApp((s) => s.activeServerId);
  const patches = me.patches ?? [];
  const [editing, setEditing] = useState<Patch | null>(null);
  const [gallery, setGallery] = useState(false);
  const [source, setSource] = useState<string>('preset');
  const [shareTo, setShareTo] = useState<string>('');
  const [giftOf, setGiftOf] = useState<Patch | null>(null);
  const full = patches.length >= MAX_PATCHES;
  const isNew = editing ? !patches.some((x) => x.id === editing.id) : false;

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
    if (isNew && shareTo) {
      // cria no servidor (todo mundo de lá pode usar) e costura no perfil
      try {
        const created = await api.post<ServerPatch>(`/servers/${shareTo}/patches`, { patch: p });
        if (await equipPatch(created.patch)) setEditing(null);
        toast.success('Patch criado e compartilhado no servidor');
      } catch (err) {
        toast.error(err);
      }
      return;
    }
    const exists = patches.some((x) => x.id === p.id);
    if (await save(exists ? patches.map((x) => (x.id === p.id ? p : x)) : [...patches, p])) setEditing(null);
  }

  function startCreate() {
    setShareTo(activeServerId && activeServerId !== HOME ? activeServerId : (servers[0]?.id ?? ''));
    setEditing(newPatchDraft());
  }

  return (
    <div className="mt-6">
      <Title hint={`Bordados que ficam costurados no seu cartão (até ${MAX_PATCHES}). Os patches criados num servidor ficam disponíveis para todo mundo de lá.`}>
        Patches
      </Title>

      <div className="flex flex-wrap items-center gap-2">
        {patches.map((p, i) => (
          <div key={p.id} className="group relative">
            <PatchBadge patch={p} size={56} tilt={PATCH_TILTS[i % PATCH_TILTS.length]} />
            <div className="absolute -top-1.5 -right-1.5 hidden gap-0.5 group-focus-within:flex group-hover:flex">
              {!p.drop && (
                <button
                  aria-label={`Criar link de presente do patch ${p.text}`}
                  title="Link de presente: amigos resgatam este patch"
                  onClick={() => setGiftOf(p)}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-on-accent shadow"
                >
                  <Gift size={11} />
                </button>
              )}
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
              <Plus size={15} /> Escolher
            </Button>
            <Button variant="secondary" className="h-10" onClick={startCreate}>
              <Pencil size={14} /> Criar
            </Button>
          </>
        )}
      </div>

      {gallery && !full && (
        <div className="mt-3 rounded-2xl bg-surface-0 p-3">
          <div role="tablist" className="mb-3 flex flex-wrap gap-1.5">
            {[{ id: 'preset', name: 'Prontos' }, ...servers.map((sv) => ({ id: sv.id, name: sv.name }))].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={source === t.id}
                onClick={() => setSource(t.id)}
                className={cx(
                  'max-w-40 truncate rounded-full px-3 py-1 text-xs font-semibold',
                  source === t.id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
          {source === 'preset' ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {PATCH_PRESETS.map((p, i) => (
                <button
                  key={i}
                  title={`Costurar "${p.text}"`}
                  onClick={() =>
                    void save([...patches, { ...p, id: newPatchDraft().id }]).then((ok) => ok && patches.length + 1 >= MAX_PATCHES && setGallery(false))
                  }
                  className="flex items-center justify-center rounded-xl p-1 hover:bg-surface-2"
                >
                  <PatchBadge patch={{ ...p, id: `p${i}` }} size={52} />
                </button>
              ))}
            </div>
          ) : (
            <ServerPatchesPanel key={source} serverId={source} compact />
          )}
        </div>
      )}

      {giftOf && <GiftLinks patch={giftOf} onClose={() => setGiftOf(null)} />}
      <ClaimedPatches />

      {editing && (
        <PatchForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={commit}
          saveLabel={isNew && shareTo ? 'Criar e compartilhar' : 'Costurar'}
          extra={
            isNew &&
            servers.length > 0 && (
              <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-muted">
                Compartilhar no servidor
                <select
                  value={shareTo}
                  onChange={(e) => setShareTo(e.target.value)}
                  className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg outline-none focus:border-accent"
                >
                  <option value="">Não, só para mim</option>
                  {servers.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name}
                    </option>
                  ))}
                </select>
              </label>
            )
          }
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ patches de presente

interface DropLink {
  code: string;
  patch: Patch;
  uses: number;
  maxUses: number;
  expiresAt: number | null;
}

const dropUrl = (code: string) => `${location.origin}/resgatar/${code}`;

/** Links de presente de um patch: quem abre o link resgata o patch (uma vez por pessoa). */
function GiftLinks({ patch, onClose }: { patch: Patch; onClose: () => void }) {
  const [links, setLinks] = useState<DropLink[] | null>(null);
  const [maxUses, setMaxUses] = useState(10);
  const [expiresIn, setExpiresIn] = useState(7 * 86400);
  const [copied, setCopied] = useState('');
  const same = (d: DropLink) => JSON.stringify({ ...d.patch, drop: undefined }) === JSON.stringify({ ...patch, id: undefined, drop: undefined });

  const load = () => void api.get<DropLink[]>('/me/drops').then((all) => setLinks(all.filter(same)), toast.error);
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    try {
      const d = await api.post<DropLink>('/me/drops', { patchId: patch.id, maxUses, expiresIn });
      setLinks((cur) => [d, ...(cur ?? [])]);
      void copy(d.code);
    } catch (err) {
      toast.error(err);
    }
  }
  async function copy(code: string) {
    await navigator.clipboard.writeText(dropUrl(code)).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? '' : c)), 2000);
  }

  const sel = 'h-9 rounded-xl border border-line bg-surface-2 px-2 text-sm text-fg outline-none focus:border-accent';
  return (
    <div className="mt-3 rounded-2xl bg-surface-0 p-4">
      <div className="mb-3 flex items-center gap-3">
        <PatchBadge patch={patch} size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">Link de presente</div>
          <div className="text-xs text-fg-muted">Quem abrir o link resgata este patch para o próprio perfil. Quem ganhou não consegue repassar.</div>
        </div>
        <button aria-label="Fechar" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Quantos resgates" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className={sel}>
          {[1, 5, 10, 25, 50, 0].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Resgates ilimitados' : n === 1 ? '1 resgate' : `${n} resgates`}
            </option>
          ))}
        </select>
        <select aria-label="Validade" value={expiresIn} onChange={(e) => setExpiresIn(Number(e.target.value))} className={sel}>
          <option value={86400}>Vale 1 dia</option>
          <option value={7 * 86400}>Vale 7 dias</option>
          <option value={30 * 86400}>Vale 30 dias</option>
          <option value={0}>Nunca expira</option>
        </select>
        <Button className="h-9" onClick={() => void create()}>
          <Gift size={14} /> Criar link
        </Button>
      </div>
      {links && links.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {links.map((d) => {
            const expired = !!d.expiresAt && d.expiresAt < Date.now();
            return (
              <li key={d.code} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <code className={cx('min-w-0 flex-1 truncate', expired && 'line-through opacity-50')}>{dropUrl(d.code)}</code>
                <span className="shrink-0 text-xs text-fg-muted">
                  {d.uses}
                  {d.maxUses ? `/${d.maxUses}` : ''} resgates
                </span>
                {!expired && (
                  <button aria-label="Copiar link" onClick={() => void copy(d.code)} className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg">
                    {copied === d.code ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
                  </button>
                )}
                {!expired && (
                  <button
                    aria-label="Desativar link"
                    title="Desativar (quem já resgatou continua com o patch)"
                    onClick={() => void api.del(`/me/drops/${d.code}`).then(load, toast.error)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-danger hover:bg-danger/15"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Patches ganhos de presente que não estão no perfil agora: dá para costurar de novo. */
function ClaimedPatches() {
  const me = useApp((s) => s.me)!;
  const [list, setList] = useState<Patch[]>([]);
  useEffect(() => void api.get<Patch[]>('/me/claimed-patches').then(setList, () => setList([])), []);
  const off = list.filter((p) => !(me.patches ?? []).some((x) => x.id === p.id));
  if (off.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-0 p-3">
      <span className="mr-1 text-xs font-bold text-fg-muted">Ganhos de presente</span>
      {off.map((p) => (
        <button key={p.id} title="Costurar no perfil" onClick={() => void equipPatch(p)} className="rounded-xl p-1 hover:bg-surface-2">
          <PatchBadge patch={p} size={44} />
        </button>
      ))}
    </div>
  );
}
