import { Check, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { MAX_PATCHES } from '../../../shared/cosmetics.ts';
import { P, has } from '../../../shared/permissions.ts';
import { api } from '../lib/api';
import { memberName, type Me, type Patch, type ServerPatch } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { PatchBadge } from './PatchBadge';
import { PatchForm } from './PatchForm';
import { Button, Spinner } from './ui';

/** Patches compartilhados num servidor (atualiza sozinho quando alguém cria ou apaga). */
export function useServerPatches(serverId: string | null | undefined) {
  const [list, setList] = useState<ServerPatch[] | null>(null);
  const load = useCallback(() => {
    if (!serverId) return;
    void api.get<ServerPatch[]>(`/servers/${serverId}/patches`).then(setList, () => setList([]));
  }, [serverId]);

  useEffect(() => {
    setList(null);
    load();
    const onChange = (e: Event) => (e as CustomEvent<{ serverId: string }>).detail.serverId === serverId && load();
    window.addEventListener('concord:server-patches', onChange);
    return () => window.removeEventListener('concord:server-patches', onChange);
  }, [serverId, load]);

  return list;
}

/** Coloca um patch no próprio perfil. */
export async function equipPatch(patch: Patch) {
  const { me, setMe } = useApp.getState();
  if (!me) return false;
  const mine = me.patches ?? [];
  if (mine.some((p) => p.id === patch.id)) return true;
  if (mine.length >= MAX_PATCHES) {
    toast.error(`Você já usa ${MAX_PATCHES} patches. Tire algum na aba Estilo.`);
    return false;
  }
  try {
    setMe(await api.patch<Me>('/me/style', { patches: [...mine, patch] }));
    return true;
  } catch (err) {
    toast.error(err);
    return false;
  }
}

export const newPatchDraft = (): Patch => ({
  id: Math.random().toString(36).slice(2, 10),
  shape: 'shield',
  bg: '#211a28',
  border: '#ff8a6b',
  fg: '#ffffff',
  icon: '⭐',
  text: 'MEU TIME',
});

/** Coleção de patches de um servidor: todo mundo usa, qualquer membro cria. */
export function ServerPatchesPanel({ serverId, compact }: { serverId: string; compact?: boolean }) {
  const list = useServerPatches(serverId);
  const me = useApp((s) => s.me)!;
  const detail = useApp((s) => s.details[serverId]);
  const [creating, setCreating] = useState<Patch | null>(null);
  const [wear, setWear] = useState(true);
  const mine = me.patches ?? [];
  const canManage = has(detail?.permissions ?? 0, P.MANAGE_SERVER);

  async function create(p: Patch) {
    try {
      const created = await api.post<ServerPatch>(`/servers/${serverId}/patches`, { patch: p });
      if (wear) await equipPatch(created.patch);
      toast.success(wear ? 'Patch criado e costurado no seu perfil' : 'Patch criado no servidor');
      setCreating(null);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div>
      {!creating && (
        <Button variant="secondary" className="mb-3 h-10" onClick={() => setCreating(newPatchDraft())}>
          <Plus size={15} /> Criar patch para o servidor
        </Button>
      )}
      {creating && (
        <div className="mb-3">
          <PatchForm
            initial={creating}
            saveLabel="Criar no servidor"
            onCancel={() => setCreating(null)}
            onSave={create}
            extra={
              <label className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                <input type="checkbox" checked={wear} onChange={(e) => setWear(e.target.checked)} className="accent-[var(--color-accent)]" />
                Usar no meu perfil também
              </label>
            }
          />
        </div>
      )}

      {list === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl bg-surface-0 p-4 text-sm text-fg-muted">Ninguém criou patches aqui ainda. Que tal o primeiro, com a logo do time de vocês?</p>
      ) : (
        <div className={compact ? 'grid grid-cols-3 gap-2 sm:grid-cols-5' : 'grid grid-cols-2 gap-3 sm:grid-cols-4'}>
          {list.map((sp) => {
            const creator = detail?.members.find((m) => m.id === sp.creatorId);
            const wearing = mine.some((p) => p.id === sp.patch.id);
            const canDelete = sp.creatorId === me.id || canManage;
            return (
              <div key={sp.id} className="group relative flex flex-col items-center gap-1.5 rounded-2xl bg-surface-0 p-3">
                <button
                  aria-label={`Ver o patch ${sp.patch.text || ''} de perto`}
                  title="Clique para ver de perto"
                  onClick={() => useApp.getState().openModal({ type: 'patch', patch: sp.patch, caption: creator ? `criado por ${memberName(creator)}` : undefined })}
                  className="cursor-zoom-in"
                >
                  <PatchBadge patch={sp.patch} size={compact ? 52 : 68} />
                </button>
                {!compact && <span className="max-w-full truncate text-[11px] text-fg-subtle">por {creator ? memberName(creator) : 'alguém'}</span>}
                <button
                  disabled={wearing}
                  onClick={() => void equipPatch(sp.patch)}
                  className="flex h-7 items-center gap-1 rounded-full bg-accent px-3 text-[11px] font-bold text-on-accent transition-all hover:brightness-110 disabled:bg-surface-3 disabled:text-fg-muted"
                >
                  {wearing ? (
                    <>
                      <Check size={12} /> Usando
                    </>
                  ) : (
                    'Usar'
                  )}
                </button>
                {canDelete && (
                  <button
                    aria-label={`Apagar patch ${sp.patch.text} do servidor`}
                    title="Apagar do servidor"
                    onClick={() => void api.del(`/server-patches/${sp.id}`).catch(toast.error)}
                    className="absolute top-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-danger text-white group-focus-within:flex group-hover:flex"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
