import { Bot as BotIcon, Copy, ExternalLink, ImagePlus, KeyRound, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Bot } from '../../lib/types';
import { pickImage, prepareImage, uploadImage } from '../../lib/upload';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Avatar, Button, ImageHint, Input, Spinner } from '../ui';

const DOCS_URL = 'https://github.com/duarteHiago/concord/blob/main/docs/bots.md';

/** Aba "Bots": contas de bot com token para automatizar coisas pela API. */
export function BotsTab() {
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<{ bot: string; value: string } | null>(null);

  const load = () => api.get<Bot[]>('/bots').then(setBots, toast.error);
  useEffect(() => {
    void load();
  }, []);

  const replace = (bot: Bot) => setBots((list) => list?.map((b) => (b.id === bot.id ? bot : b)) ?? null);

  async function create() {
    setCreating(true);
    try {
      const { bot, token: value } = await api.post<{ bot: Bot; token: string }>('/bots', { name: name.trim() });
      setBots((list) => [...(list ?? []), bot]);
      setToken({ bot: bot.displayName, value });
      setName('');
    } catch (err) {
      toast.error(err);
    }
    setCreating(false);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-surface-0 p-4 text-sm text-fg-muted">
        Bots são contas controladas por um programa seu: eles leem e enviam mensagens pela API do Concord usando um <b>token</b>.{' '}
        <a href={DOCS_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
          Ver o guia e um exemplo pronto <ExternalLink size={13} />
        </a>
      </div>

      {token && <TokenReveal botName={token.bot} token={token.value} onClose={() => setToken(null)} />}

      <div className="flex items-end gap-2">
        <Input label="Nome do novo bot" value={name} maxLength={32} placeholder="Ex.: Música, Avisos, Dado" onChange={(e) => setName(e.target.value)} className="flex-1" />
        <Button className="h-11 shrink-0" loading={creating} disabled={name.trim().length < 2} onClick={create}>
          <Plus size={16} /> Criar bot
        </Button>
      </div>

      {!bots ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : bots.length === 0 ? (
        <p className="text-sm text-fg-muted">Você ainda não criou nenhum bot.</p>
      ) : (
        <div className="space-y-3">
          {bots.map((b) => (
            <BotCard key={b.id} bot={b} onChange={replace} onToken={(value) => setToken({ bot: b.displayName, value })} onDeleted={() => setBots((l) => l?.filter((x) => x.id !== b.id) ?? null)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TokenReveal({ botName, token, onClose }: { botName: string; token: string; onClose: () => void }) {
  return (
    <div className="space-y-2 rounded-2xl bg-warn/10 p-4 ring-1 ring-warn/40">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-warn">
          <KeyRound size={16} /> Token do bot {botName}
        </span>
        <button aria-label="Fechar" onClick={onClose} className="text-fg-muted hover:text-fg">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-fg-muted">Copie agora: ele não será mostrado de novo. Quem tiver este token controla o bot, então não compartilhe nem publique no GitHub.</p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-surface-0 px-3 py-2 font-mono text-xs select-all">{token}</code>
        <Button
          variant="secondary"
          className="h-9 shrink-0 px-3 text-xs"
          onClick={() => void navigator.clipboard.writeText(token).then(() => toast.success('Token copiado'), () => toast.error('Não foi possível copiar'))}
        >
          <Copy size={14} /> Copiar
        </Button>
      </div>
    </div>
  );
}

function BotCard({ bot, onChange, onToken, onDeleted }: { bot: Bot; onChange: (b: Bot) => void; onToken: (t: string) => void; onDeleted: () => void }) {
  const servers = useApp((s) => s.servers);
  const [confirming, setConfirming] = useState<'token' | 'delete' | null>(null);
  const [target, setTarget] = useState('');
  const available = servers.filter((s) => !bot.servers.some((x) => x.id === s.id));

  async function changeAvatar() {
    const file = await pickImage();
    if (!file) return;
    try {
      onChange(await uploadImage<Bot>(`/bots/${bot.id}/avatar`, await prepareImage(file, 512, true)));
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="rounded-2xl bg-surface-0 p-4">
      <div className="flex items-center gap-3">
        <button onClick={changeAvatar} title="Trocar foto do bot" className="group relative rounded-full">
          <Avatar name={bot.displayName} color={bot.avatarColor} src={bot.avatarUrl} size={44} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 group-hover:opacity-100">
            <ImagePlus size={16} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-bold">
            {bot.displayName}
            <span className="rounded bg-accent-2/20 px-1 text-[9px] leading-4 font-bold text-accent-2">BOT</span>
          </div>
          <div className="text-xs text-fg-muted">@{bot.username}</div>
          <ImageHint spec="avatar" className="mt-1 text-[11px]" />
        </div>
        {confirming === null && (
          <>
            <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => setConfirming('token')}>
              <KeyRound size={14} /> Novo token
            </Button>
            <Button variant="ghost" className="h-9 px-2" title="Apagar bot" onClick={() => setConfirming('delete')}>
              <Trash2 size={15} />
            </Button>
          </>
        )}
      </div>

      {/* confirmação dentro do próprio cartão (uma janela por cima fecharia as configurações) */}
      {confirming && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <span className="flex-1">
            {confirming === 'token'
              ? 'O token atual para de funcionar na hora. Gerar um novo?'
              : 'O bot sai de todos os servidores e as mensagens dele são apagadas. Apagar?'}
          </span>
          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => setConfirming(null)}>
            Cancelar
          </Button>
          <Button
            variant={confirming === 'delete' ? 'danger' : 'primary'}
            className="h-8 px-3 text-xs"
            onClick={async () => {
              try {
                if (confirming === 'token') {
                  const { token } = await api.post<{ token: string }>(`/bots/${bot.id}/token`);
                  onToken(token);
                } else {
                  await api.del(`/bots/${bot.id}`);
                  onDeleted();
                }
              } catch (err) {
                toast.error(err);
              }
              setConfirming(null);
            }}
          >
            {confirming === 'token' ? 'Gerar novo token' : 'Apagar bot'}
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {bot.servers.map((s) => (
          <span key={s.id} className="flex items-center gap-1 rounded-full bg-surface-3 py-1 pr-1.5 pl-3 text-xs font-semibold">
            {s.name}
            <button
              aria-label={`Tirar o bot de ${s.name}`}
              onClick={() => void api.del<Bot>(`/bots/${bot.id}/servers/${s.id}`).then(onChange, toast.error)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-fg-muted hover:bg-danger hover:text-white"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {available.length > 0 && (
          <span className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor={`bot-server-${bot.id}`}>
              Adicionar a um servidor
            </label>
            <select
              id={`bot-server-${bot.id}`}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-8 rounded-full bg-surface-3 px-3 text-xs outline-none"
            >
              <option value="">Adicionar a um servidor…</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {target && (
              <Button
                className="h-8 px-3 text-xs"
                onClick={() =>
                  void api.post<Bot>(`/bots/${bot.id}/servers/${target}`).then((b) => {
                    onChange(b);
                    setTarget('');
                  }, toast.error)
                }
              >
                <BotIcon size={14} /> Adicionar
              </Button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
