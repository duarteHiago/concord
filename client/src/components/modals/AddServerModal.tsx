import { Link2, MessagesSquare, Sparkles, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import type { InvitePreview, ServerSummary } from '../../lib/types';
import { useApp } from '../../store/app';
import { Avatar, Button, Input, Modal, Spinner, cx } from '../ui';

function extractCode(input: string) {
  const v = input.trim();
  const m = v.match(/invite\/([\w-]+)/);
  return m ? m[1] : v;
}

export function AddServerModal({ initialTab = 'create', code }: { initialTab?: 'create' | 'join'; code?: string }) {
  const close = useApp((s) => s.closeModal);
  const [tab, setTab] = useState(initialTab);

  return (
    <Modal title="Adicionar servidor" subtitle="Crie seu próprio espaço ou entre em um existente." onClose={close}>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-0 p-1">
        {(['create', 'join'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              'flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
              tab === t ? 'bg-surface-4 text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t === 'create' ? <Sparkles size={16} /> : <Link2 size={16} />}
            {t === 'create' ? 'Criar' : 'Entrar com convite'}
          </button>
        ))}
      </div>
      {tab === 'create' ? <CreateForm /> : <JoinForm initialCode={code} />}
    </Modal>
  );
}

function CreateForm() {
  const me = useApp((s) => s.me)!;
  const [name, setName] = useState(`Servidor de ${me.displayName}`);
  const [template, setTemplate] = useState<'friends' | 'community'>('friends');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const server = await api.post<ServerSummary>('/servers', { name, template });
      const st = useApp.getState();
      useApp.setState({ servers: [...st.servers, server] });
      st.openServer(server.id);
      st.closeModal();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Nome do servidor" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Modelo">
        {(
          [
            ['friends', <Users key="i" size={20} />, 'Amigos', 'Chat e salas pra jogar junto'],
            ['community', <MessagesSquare key="i" size={20} />, 'Comunidade', 'Anúncios e fóruns de ideias, bugs e ajuda'],
          ] as const
        ).map(([id, icon, label, hint]) => (
          <button
            type="button"
            role="radio"
            aria-checked={template === id}
            key={id}
            onClick={() => setTemplate(id)}
            className={cx(
              'rounded-xl border p-3 text-left transition-colors',
              template === id ? 'border-accent bg-accent/10' : 'border-line bg-surface-0 hover:bg-surface-3',
            )}
          >
            {icon}
            <div className="mt-1 font-semibold">{label}</div>
            <div className="text-xs text-fg-muted">{hint}</div>
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-subtle">
        {template === 'friends' ? (
          <>
            Já vem com <b>#geral</b>, <b>#clipes-e-prints</b>, as salas <b>Sala de Transmissão</b> e <b>Lounge</b>, e os cargos Admin e Moderador.
          </>
        ) : (
          <>
            Já vem com <b>#anúncios</b> e <b>#boas-vindas</b> (só a moderação escreve), os fóruns <b>ideias</b>, <b>bugs</b>, <b>feedback</b> e{' '}
            <b>ajuda</b>, <b>#geral</b>, <b>#off-topic</b> e duas salas de voz.
          </>
        )}
      </p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">
        Criar servidor
      </Button>
    </form>
  );
}

function JoinForm({ initialCode }: { initialCode?: string }) {
  const [input, setInput] = useState(initialCode ?? '');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = extractCode(input);
    setPreview(null);
    setError('');
    if (code.length < 6) return;
    const t = setTimeout(() => {
      api.get<InvitePreview>(`/invites/${encodeURIComponent(code)}`).then(setPreview).catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  async function join(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const server = await api.post<ServerSummary>(`/invites/${encodeURIComponent(extractCode(input))}`);
      const st = useApp.getState();
      if (!st.servers.some((s) => s.id === server.id)) useApp.setState({ servers: [...st.servers, server] });
      st.openServer(server.id);
      st.closeModal();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={join} className="space-y-4">
      <Input
        label="Link ou código do convite"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={`${location.origin}/invite/abc123`}
        autoFocus
      />
      {preview ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-0 p-3">
          <Avatar name={preview.server.name} color={preview.server.iconColor} src={preview.server.iconUrl} size={48} className="[&>*]:rounded-2xl" />
          <div>
            <div className="font-bold">{preview.server.name}</div>
            <div className="text-xs text-fg-muted">{preview.memberCount} membro(s)</div>
          </div>
        </div>
      ) : (
        input.length >= 6 && !error && (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <Button type="submit" loading={loading} disabled={!preview} className="w-full">
        {preview?.alreadyMember ? 'Abrir servidor' : 'Entrar no servidor'}
      </Button>
    </form>
  );
}
