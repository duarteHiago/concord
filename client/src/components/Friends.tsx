// Tela de Amigos (a "casa" das Mensagens quando nenhuma conversa está aberta) e o botão de amizade usado no
// mini perfil e na página do perfil.
import { Ban, Check, Clock, MessageCircle, UserCheck, UserPlus, Users, UserX, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { acceptFriend, addFriend, confirmBlock, confirmUnfriend, dropRequest, unblock, usePendingCount, useRelation } from '../lib/friends';
import type { Relationship, User } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { activityLabel } from './MemberList';
import { MobileBackButton } from './MobileNav';
import { Avatar, Button, IconButton, Spinner, cx } from './ui';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

/** Um servidor em comum já carregado (o perfil mostra cargos e ações dele), ou null. */
const sharedServerId = (userId: string) =>
  Object.values(useApp.getState().details).find((d) => d.members.some((m) => m.id === userId))?.server.id ?? null;

export function FriendsView() {
  const relationships = useApp((s) => s.relationships);
  const online = useApp((s) => s.online);
  const pending = usePendingCount();
  const [tab, setTab] = useState<Tab>('online');

  const list = (relationships ?? []).filter((r) =>
    tab === 'online' ? r.type === 'friend' && !!online[r.user.id] : tab === 'all' ? r.type === 'friend' : tab === 'pending' ? r.type === 'incoming' || r.type === 'outgoing' : r.type === 'blocked',
  );
  // pendentes: os recebidos primeiro (são os que pedem uma resposta)
  if (tab === 'pending') list.sort((a, b) => (a.type === b.type ? 0 : a.type === 'incoming' ? -1 : 1));

  const tabs: [Tab, string][] = [
    ['online', 'Online'],
    ['all', 'Todos'],
    ['pending', 'Pendentes'],
    ['blocked', 'Bloqueados'],
  ];

  return (
    <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 pt-5 pb-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <MobileBackButton />
          <Users size={22} className="text-fg-subtle" /> Amigos
        </h1>
        <nav aria-label="Listas de amigos" className="flex flex-wrap items-center gap-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cx('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors', tab === id ? 'bg-surface-4 text-fg' : 'text-fg-muted hover:bg-surface-3 hover:text-fg')}
            >
              {label}
              {id === 'pending' && pending > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{pending}</span>}
            </button>
          ))}
          <button
            onClick={() => setTab('add')}
            aria-current={tab === 'add' ? 'page' : undefined}
            className={cx('rounded-full px-3 py-1.5 text-sm font-bold transition-colors', tab === 'add' ? 'bg-accent/15 text-accent' : 'bg-accent text-on-accent hover:bg-accent-hover')}
          >
            Adicionar amigo
          </button>
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {tab === 'add' ? (
          <AddFriend />
        ) : !relationships ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <Empty tab={tab} hasFriends={relationships.some((r) => r.type === 'friend')} onAdd={() => setTab('add')} />
        ) : (
          <>
            <h2 className="mb-2 text-xs font-bold tracking-wide text-fg-subtle uppercase">
              {tab === 'online' ? 'Online' : tab === 'all' ? 'Todos os amigos' : tab === 'pending' ? 'Pendentes' : 'Bloqueados'} — {list.length}
            </h2>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <FriendRow key={r.user.id} rel={r} />
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

function FriendRow({ rel }: { rel: Relationship }) {
  const { user, type } = rel;
  const presence = useApp((s) => s.online[user.id]);
  const openDm = useApp((s) => s.openDm);
  const run = (fn: () => Promise<void> | void) => () => void Promise.resolve(fn()).catch(toast.error);

  const subtitle =
    type === 'incoming'
      ? 'Quer ser seu amigo'
      : type === 'outgoing'
        ? 'Pedido enviado'
        : type === 'blocked'
          ? `@${user.username}`
          : !presence
            ? 'Offline'
            : presence.activities?.length
              ? presence.activities.map(activityLabel).join(' · ')
              : presence.customStatus || (presence.status === 'dnd' ? 'Não perturbe' : 'Online');

  return (
    <li className="group flex items-center gap-3 py-2.5">
      <button
        onClick={() => useApp.getState().openProfile(user.id, sharedServerId(user.id))}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left"
        aria-label={`Perfil de ${user.displayName}`}
      >
        <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl} frame={user.frame} size={40} status={type === 'friend' ? (presence?.status ?? 'offline') : undefined} />
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-semibold">{user.displayName}</span>
            <span className="hidden truncate text-xs text-fg-subtle group-hover:inline">@{user.username}</span>
          </span>
          <span className="block truncate text-xs text-fg-muted">{subtitle}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {type === 'friend' && (
          <>
            <IconButton label={`Mensagem para ${user.displayName}`} className="h-9 w-9 bg-surface-3" onClick={run(() => openDm(user.id))}>
              <MessageCircle size={16} />
            </IconButton>
            <IconButton label="Desfazer amizade" className="h-9 w-9 bg-surface-3" onClick={() => confirmUnfriend(user)}>
              <UserX size={16} />
            </IconButton>
            <IconButton label="Bloquear" danger className="h-9 w-9 bg-surface-3" onClick={() => confirmBlock(user)}>
              <Ban size={16} />
            </IconButton>
          </>
        )}
        {type === 'incoming' && (
          <>
            <IconButton label="Aceitar" className="h-9 w-9 bg-surface-3 text-ok hover:text-ok" onClick={run(() => acceptFriend(user))}>
              <Check size={17} />
            </IconButton>
            <IconButton label="Recusar" className="h-9 w-9 bg-surface-3" onClick={run(() => dropRequest(user))}>
              <X size={17} />
            </IconButton>
          </>
        )}
        {type === 'outgoing' && (
          <IconButton label="Cancelar pedido" className="h-9 w-9 bg-surface-3" onClick={run(() => dropRequest(user))}>
            <X size={17} />
          </IconButton>
        )}
        {type === 'blocked' && (
          <Button variant="secondary" className="h-9 px-4 text-xs" onClick={run(() => unblock(user))}>
            Desbloquear
          </Button>
        )}
      </div>
    </li>
  );
}

function AddFriend() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await addFriend({ username: username.trim() });
      setUsername('');
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-2">
      <h2 className="text-lg font-bold">Adicionar amigo</h2>
      <p className="text-sm text-fg-muted">Digite o nome de usuário da pessoa (o que aparece com @ no perfil dela). Ela recebe o pedido na hora.</p>
      <div className="flex gap-2 pt-1">
        <label className="sr-only" htmlFor="add-friend">
          Nome de usuário
        </label>
        <input
          id="add-friend"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError('');
          }}
          placeholder="@usuario"
          autoComplete="off"
          autoFocus
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-3 px-5 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60"
        />
        <Button type="submit" loading={loading} disabled={!username.trim()} className="h-11 shrink-0 px-5">
          <UserPlus size={16} /> Mandar pedido
        </Button>
      </div>
      {error && <p className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
    </form>
  );
}

function Empty({ tab, hasFriends, onAdd }: { tab: Tab; hasFriends: boolean; onAdd: () => void }) {
  const text =
    tab === 'online'
      ? hasFriends
        ? 'Nenhum amigo online agora.'
        : 'Você ainda não adicionou ninguém.'
      : tab === 'all'
        ? 'Você ainda não adicionou ninguém.'
        : tab === 'pending'
          ? 'Nenhum pedido de amizade esperando resposta.'
          : 'Você não bloqueou ninguém.';
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-surface-3">
        <Users size={30} className="text-fg-subtle" />
      </div>
      <p className="text-fg-muted">{text}</p>
      {(tab === 'online' || tab === 'all') && !hasFriends && (
        <Button onClick={onAdd}>
          <UserPlus size={16} /> Adicionar amigo
        </Button>
      )}
    </div>
  );
}

/** Botão de amizade do mini perfil (ícone) e da página do perfil (com texto). Some para bots e bloqueados. */
export function FriendButton({ user, variant }: { user: User; variant: 'icon' | 'full' }) {
  const relation = useRelation(user.id);
  const me = useApp((s) => s.me);
  const [busy, setBusy] = useState(false);
  if (!me || user.id === me.id || user.bot || relation === 'blocked') return null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    }
    setBusy(false);
  };

  const states = {
    none: { icon: UserPlus, label: 'Adicionar amigo', title: `Mandar um pedido de amizade para ${user.displayName}`, run: () => act(() => addFriend({ userId: user.id })) },
    outgoing: { icon: Clock, label: 'Pedido enviado', title: 'Pedido enviado. Clique para cancelar.', run: () => act(() => dropRequest(user)) },
    incoming: { icon: UserCheck, label: 'Aceitar pedido', title: `${user.displayName} quer ser seu amigo. Clique para aceitar.`, run: () => act(() => acceptFriend(user)) },
    friend: { icon: UserCheck, label: 'Amigos', title: `Você e ${user.displayName} são amigos. Clique para desfazer.`, run: () => confirmUnfriend(user) },
  } as const;
  const s = states[relation ?? 'none'];
  const Icon = s.icon;

  if (variant === 'icon') {
    return (
      <button
        onClick={() => void s.run()}
        disabled={busy}
        title={s.title}
        aria-label={s.label}
        className={cx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 transition-colors disabled:opacity-50',
          relation === 'friend' ? 'text-ok' : relation === 'incoming' ? 'text-accent' : 'text-fg-muted hover:text-fg',
        )}
      >
        <Icon size={16} />
      </button>
    );
  }
  return (
    <Button variant={relation ? 'secondary' : 'primary'} loading={busy} title={s.title} className={cx('h-11 px-5', relation === 'friend' && 'text-ok')} onClick={() => void s.run()}>
      <Icon size={16} /> {s.label}
    </Button>
  );
}
