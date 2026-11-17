import { Copy, ExternalLink, ImagePlus, KeyRound, Plus, Trash2, Webhook as WebhookIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Webhook } from '../../lib/types';
import { pickImage, prepareImage, uploadImage } from '../../lib/upload';
import { toast } from '../../store/toast';
import { Avatar, Button, Input, Spinner } from '../ui';

const DOCS_URL = 'https://github.com/duarteHiago/concord/blob/main/docs/webhooks.md';

const ago = (t: number) => {
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(t).toLocaleDateString('pt-BR');
};

/** Aba "Integrações" do canal: endereços (webhooks) para outros apps mandarem mensagem aqui. */
export function WebhooksTab({ channelId }: { channelId: string }) {
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  // o endereço completo só aparece uma vez (quando cria ou troca)
  const [shown, setShown] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    api.get<Webhook[]>(`/channels/${channelId}/webhooks`).then(setHooks, toast.error);
  }, [channelId]);

  async function create() {
    setCreating(true);
    try {
      const r = await api.post<{ webhook: Webhook; url: string }>(`/channels/${channelId}/webhooks`, { name });
      setHooks((h) => [...(h ?? []), r.webhook]);
      setShown({ id: r.webhook.id, url: r.url });
      setName('');
    } catch (err) {
      toast.error(err);
    }
    setCreating(false);
  }

  const replace = (w: Webhook) => setHooks((h) => h?.map((x) => (x.id === w.id ? w : x)) ?? null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Um webhook é um endereço secreto que outro app usa para mandar mensagens neste canal: alertas do Grafana, avisos do Uptime Kuma, um script seu. Ele
        aceita o formato de webhook do Discord e do Slack.{' '}
        <a href={DOCS_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent hover:underline">
          Como usar <ExternalLink size={12} />
        </a>
      </p>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="flex-1">
          <Input label="Novo webhook" value={name} onChange={(e) => setName(e.target.value)} placeholder="Grafana" maxLength={32} />
        </div>
        <Button type="submit" loading={creating} disabled={!name.trim()}>
          <Plus size={16} /> Criar
        </Button>
      </form>

      {hooks === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : hooks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface-0 py-8 text-center text-sm text-fg-muted">
          <WebhookIcon size={28} className="text-fg-subtle" />
          Nenhum webhook neste canal ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {hooks.map((w) => (
            <WebhookCard
              key={w.id}
              channelId={channelId}
              hook={w}
              url={shown?.id === w.id ? shown.url : null}
              onChange={replace}
              onUrl={(url) => setShown({ id: w.id, url })}
              onHideUrl={() => setShown(null)}
              onDeleted={() => setHooks((h) => h?.filter((x) => x.id !== w.id) ?? null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookCard({
  channelId,
  hook,
  url,
  onChange,
  onUrl,
  onHideUrl,
  onDeleted,
}: {
  channelId: string;
  hook: Webhook;
  url: string | null;
  onChange: (w: Webhook) => void;
  onUrl: (url: string) => void;
  onHideUrl: () => void;
  onDeleted: () => void;
}) {
  const base = `/channels/${channelId}/webhooks/${hook.id}`;
  const [confirming, setConfirming] = useState<'token' | 'delete' | null>(null);
  const [name, setName] = useState(hook.name);

  async function changeAvatar() {
    const file = await pickImage();
    if (!file) return;
    try {
      onChange(await uploadImage<Webhook>(`${base}/avatar`, await prepareImage(file, 512, true)));
    } catch (err) {
      toast.error(err);
    }
  }

  async function rename() {
    if (!name.trim() || name === hook.name) return setName(hook.name);
    try {
      onChange(await api.patch<Webhook>(base, { name }));
    } catch (err) {
      toast.error(err);
      setName(hook.name);
    }
  }

  async function confirm() {
    try {
      if (confirming === 'token') {
        onUrl((await api.post<{ url: string }>(`${base}/token`)).url);
      } else {
        await api.del(base);
        onDeleted();
      }
    } catch (err) {
      toast.error(err);
    }
    setConfirming(null);
  }

  return (
    <div className="rounded-2xl bg-surface-0 p-4">
      <div className="flex items-center gap-3">
        <button onClick={changeAvatar} title="Trocar a foto do webhook" className="group relative shrink-0 rounded-full">
          <Avatar name={hook.name} color={hook.avatarColor} src={hook.avatarUrl} size={40} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 group-hover:opacity-100">
            <ImagePlus size={15} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            maxLength={32}
            aria-label="Nome do webhook"
            className="w-full rounded-lg bg-transparent px-1 font-bold outline-none focus:bg-surface-3"
          />
          <div className="px-1 text-xs text-fg-muted">
            {hook.lastUsedAt ? `Última mensagem ${ago(hook.lastUsedAt)}` : 'Ainda não mandou mensagem'}
            {hook.creator && ` · criado por ${hook.creator.displayName}`}
          </div>
        </div>
        {confirming === null ? (
          <>
            <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => setConfirming('token')}>
              <KeyRound size={14} /> Novo endereço
            </Button>
            <Button variant="ghost" className="h-9 px-2" title="Apagar webhook" onClick={() => setConfirming('delete')}>
              <Trash2 size={15} />
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-fg-muted">{confirming === 'token' ? 'O endereço atual para de funcionar.' : 'Apagar? As mensagens ficam.'}</span>
            <Button variant={confirming === 'delete' ? 'danger' : 'primary'} className="h-9 px-3 text-xs" onClick={() => void confirm()}>
              Confirmar
            </Button>
            <Button variant="ghost" className="h-9 px-2" title="Cancelar" onClick={() => setConfirming(null)}>
              <X size={15} />
            </Button>
          </div>
        )}
      </div>
      {url && (
        <div className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3">
          <div className="text-xs font-semibold text-warn">Copie agora: o endereço não aparece de novo. Quem tiver ele consegue mandar mensagens aqui.</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-0 px-2 py-1.5 font-mono text-xs">{url}</code>
            <Button
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Endereço copiado'), () => toast.error('Não foi possível copiar'))}
            >
              <Copy size={13} /> Copiar
            </Button>
            <Button variant="ghost" className="h-8 px-2" title="Esconder" onClick={onHideUrl}>
              <X size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
