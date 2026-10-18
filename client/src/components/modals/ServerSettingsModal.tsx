import { ArrowDown, ArrowUp, Crown, Link2, Plus, Search, Shield, Trash2, UserX, Users, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { P, PERMISSION_INFO, has, type PermissionInfo } from '../../../../shared/permissions.ts';
import { api } from '../../lib/api';
import type { Invite, Role, ServerDetail } from '../../lib/types';
import { memberPosition, useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Avatar, Button, IconButton, Input, RoleDot, Toggle, cx } from '../ui';

const COLORS = ['#ed4245', '#f47b67', '#faa61a', '#fee75c', '#3ba55c', '#1abc9c', '#00b0f4', '#5865f2', '#7c5cff', '#9b59b6', '#eb459e', '#99aab5'];

export function ServerSettingsModal({ serverId, initialTab }: { serverId: string; initialTab?: string }) {
  const close = useApp((s) => s.closeModal);
  const detail = useApp((s) => s.details[serverId]);
  const [tab, setTab] = useState(initialTab ?? 'overview');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!detail) return null;
  const perms = detail.permissions;
  const tabs = [
    { id: 'overview', label: 'Visão geral', icon: <Wrench size={16} />, show: has(perms, P.MANAGE_SERVER) },
    { id: 'roles', label: 'Cargos', icon: <Shield size={16} />, show: has(perms, P.MANAGE_ROLES) },
    { id: 'members', label: 'Membros', icon: <Users size={16} />, show: true },
    { id: 'invites', label: 'Convites', icon: <Link2 size={16} />, show: has(perms, P.CREATE_INVITE) },
  ].filter((t) => t.show);
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in bg-surface-2">
      <nav className="flex w-[30%] min-w-56 justify-end bg-surface-1 py-14 pr-2">
        <div className="w-52 space-y-0.5">
          <div className="mb-2 truncate px-2.5 text-[11px] font-bold tracking-wider text-fg-subtle uppercase">{detail.server.name}</div>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium',
                current === t.id ? 'bg-white/10 text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="relative flex-1 overflow-y-auto py-14 pr-6 pl-10">
        <div className="max-w-3xl">
          {current === 'overview' && <Overview detail={detail} />}
          {current === 'roles' && <Roles detail={detail} />}
          {current === 'members' && <Members detail={detail} />}
          {current === 'invites' && <Invites detail={detail} />}
        </div>
        <button
          onClick={close}
          className="fixed top-14 right-10 flex flex-col items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-current">
            <X size={18} />
          </span>
          ESC
        </button>
      </div>
    </div>
  );
}

function Overview({ detail }: { detail: ServerDetail }) {
  const [name, setName] = useState(detail.server.name);
  const [color, setColor] = useState(detail.server.iconColor);
  const [saving, setSaving] = useState(false);
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-bold">Visão geral do servidor</h2>
      <div className="flex items-center gap-5">
        <Avatar name={name} color={color} size={88} className="[&>div]:rounded-3xl" />
        <div className="flex-1">
          <Input label="Nome do servidor" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </div>
      </div>
      <div>
        <span className="mb-2 block text-xs font-bold tracking-wide text-fg-muted uppercase">Cor do ícone</span>
        <ColorPicker value={color} onChange={(c) => c && setColor(c)} />
      </div>
      <Button
        loading={saving}
        onClick={async () => {
          setSaving(true);
          await api.patch(`/servers/${detail.server.id}`, { name, iconColor: color }).then(() => toast.success('Servidor atualizado'), toast.error);
          setSaving(false);
        }}
      >
        Salvar alterações
      </Button>
    </section>
  );
}

function ColorPicker({ value, onChange, allowNone }: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNone && (
        <button
          title="Sem cor"
          onClick={() => onChange(null)}
          className={cx('h-8 w-8 rounded-lg border-2 bg-[#99aab5]', value === null ? 'border-white' : 'border-transparent')}
        />
      )}
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cx('h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110', value === c ? 'border-white' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
      <input type="color" value={value ?? '#99aab5'} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded bg-transparent" />
    </div>
  );
}

// ------------------------------------------------------------------ Cargos

function Roles({ detail }: { detail: ServerDetail }) {
  const [selected, setSelected] = useState<string>(detail.roles[0]?.id);
  const role = detail.roles.find((r) => r.id === selected) ?? detail.roles[0];
  const myPos = memberPosition(detail, useApp.getState().me!.id);

  async function create() {
    try {
      const r = await api.post<Role>(`/servers/${detail.server.id}/roles`, { name: 'novo cargo', color: '#99aab5' });
      setSelected(r.id);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Cargos</h2>
          <p className="text-sm text-fg-muted">Use cargos para organizar membros e definir o que cada um pode fazer. Cargos mais acima têm prioridade.</p>
        </div>
        <Button onClick={create}>
          <Plus size={16} /> Criar cargo
        </Button>
      </div>
      <div className="flex gap-6">
        <div className="w-52 shrink-0 space-y-0.5">
          {detail.roles.map((r) => {
            const count = r.isDefault ? detail.members.length : detail.members.filter((m) => m.roleIds.includes(r.id)).length;
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={cx('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm', role?.id === r.id ? 'bg-white/10' : 'hover:bg-white/5')}
              >
                <RoleDot color={r.color} />
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <span className="text-xs text-fg-subtle">{count}</span>
              </button>
            );
          })}
        </div>
        {role && <RoleEditor key={role.id} detail={detail} role={role} editable={role.isDefault || role.position < myPos} />}
      </div>
    </section>
  );
}

function RoleEditor({ detail, role, editable }: { detail: ServerDetail; role: Role; editable: boolean }) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [hoist, setHoist] = useState(role.hoist);
  const [perms, setPerms] = useState(role.permissions);
  const [saving, setSaving] = useState(false);
  const dirty = name !== role.name || color !== role.color || hoist !== role.hoist || perms !== role.permissions;
  const myPerms = detail.permissions;
  const openModal = useApp((s) => s.openModal);

  const categories = [...new Set(PERMISSION_INFO.map((p) => p.category))];

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/roles/${role.id}`, role.isDefault ? { permissions: perms } : { name, color, hoist, permissions: perms });
      toast.success('Cargo salvo');
    } catch (err) {
      toast.error(err);
    }
    setSaving(false);
  }

  const toggle = (p: PermissionInfo, on: boolean) => setPerms(on ? perms | P[p.key] : perms & ~P[p.key]);

  return (
    <div className="min-w-0 flex-1 space-y-5 pb-24">
      {!editable && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">Este cargo está igual ou acima do seu cargo mais alto, então você não pode editá-lo.</p>
      )}
      {!role.isDefault && (
        <>
          <Input label="Nome do cargo" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} disabled={!editable} />
          <div>
            <span className="mb-2 block text-xs font-bold tracking-wide text-fg-muted uppercase">Cor</span>
            <ColorPicker value={color} onChange={setColor} allowNone />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-surface-1 p-3">
            <div>
              <div className="text-sm font-semibold">Exibir separadamente</div>
              <div className="text-xs text-fg-muted">Mostra membros deste cargo em um grupo próprio na lista de membros.</div>
            </div>
            <Toggle checked={hoist} onChange={setHoist} disabled={!editable} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!editable} onClick={() => void api.patch(`/roles/${role.id}`, { move: 'up' }).catch(toast.error)}>
              <ArrowUp size={16} /> Subir
            </Button>
            <Button variant="secondary" disabled={!editable} onClick={() => void api.patch(`/roles/${role.id}`, { move: 'down' }).catch(toast.error)}>
              <ArrowDown size={16} /> Descer
            </Button>
            <div className="flex-1" />
            <Button
              variant="danger"
              disabled={!editable}
              onClick={() =>
                openModal({
                  type: 'confirm',
                  title: `Apagar o cargo "${role.name}"`,
                  message: 'Os membros com este cargo vão perdê-lo. Isso não pode ser desfeito.',
                  confirmLabel: 'Apagar cargo',
                  danger: true,
                  onConfirm: async () => {
                    await api.del(`/roles/${role.id}`);
                    useApp.getState().openModal({ type: 'serverSettings', serverId: detail.server.id, tab: 'roles' });
                  },
                })
              }
            >
              <Trash2 size={16} /> Apagar
            </Button>
          </div>
        </>
      )}
      {role.isDefault && <p className="text-sm text-fg-muted">Permissões padrão que todos os membros do servidor recebem.</p>}

      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="mb-2 text-xs font-bold tracking-wider text-fg-subtle uppercase">{cat}</h3>
          <div className="divide-y divide-line rounded-xl bg-surface-1">
            {PERMISSION_INFO.filter((p) => p.category === cat).map((p) => {
              const on = (perms & P[p.key]) !== 0;
              const allowed = editable && has(myPerms, P[p.key]);
              return (
                <div key={p.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{p.label}</div>
                    <div className="text-xs text-fg-muted">{p.description}</div>
                  </div>
                  <Toggle checked={on} onChange={(v) => toggle(p, v)} disabled={!allowed} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {dirty && editable && (
        <div className="fixed bottom-6 left-1/2 z-10 flex w-[min(640px,90vw)] -translate-x-1/2 animate-slide-up items-center gap-3 rounded-xl border border-line bg-surface-0 p-3 shadow-2xl">
          <span className="flex-1 text-sm font-medium">Cuidado — você tem alterações não salvas!</span>
          <Button
            variant="ghost"
            onClick={() => {
              setName(role.name);
              setColor(role.color);
              setHoist(role.hoist);
              setPerms(role.permissions);
            }}
          >
            Redefinir
          </Button>
          <Button variant="primary" className="bg-ok hover:bg-green-600" loading={saving} onClick={save}>
            Salvar alterações
          </Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Membros

function Members({ detail }: { detail: ServerDetail }) {
  const me = useApp((s) => s.me)!;
  const openModal = useApp((s) => s.openModal);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const myPos = memberPosition(detail, me.id);
  const canRoles = has(detail.permissions, P.MANAGE_ROLES);
  const canKick = has(detail.permissions, P.KICK_MEMBERS);
  const assignable = detail.roles.filter((r) => !r.isDefault && r.position < myPos);
  const list = detail.members.filter((m) => `${m.displayName} ${m.username}`.toLowerCase().includes(query.toLowerCase()));

  async function toggleRole(memberId: string, roleIds: string[], roleId: string) {
    const next = roleIds.includes(roleId) ? roleIds.filter((r) => r !== roleId) : [...roleIds, roleId];
    await api.put(`/servers/${detail.server.id}/members/${memberId}/roles`, { roleIds: next }).catch(toast.error);
  }

  return (
    <section>
      <h2 className="mb-1 text-xl font-bold">Membros</h2>
      <p className="mb-4 text-sm text-fg-muted">{detail.members.length} membro(s) no servidor.</p>
      <div className="relative mb-4">
        <Search size={16} className="absolute top-3 left-3 text-fg-subtle" />
        <Input placeholder="Buscar membros" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>
      <div className="divide-y divide-line rounded-xl bg-surface-1">
        {list.map((m) => {
          const owner = detail.server.ownerId === m.id;
          const manageable = m.id === me.id || (!owner && myPos > memberPosition(detail, m.id));
          const roles = detail.roles.filter((r) => m.roleIds.includes(r.id));
          return (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={m.displayName} color={m.avatarColor} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {m.displayName} {owner && <Crown size={14} className="text-warn" />}
                  </div>
                  <div className="text-xs text-fg-muted">@{m.username}</div>
                </div>
                <div className="flex max-w-[45%] flex-wrap justify-end gap-1">
                  {roles.map((r) => (
                    <span key={r.id} className="flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-xs">
                      <RoleDot color={r.color} /> {r.name}
                    </span>
                  ))}
                </div>
                {canRoles && manageable && assignable.length > 0 && (
                  <IconButton label="Gerenciar cargos" className="h-8 w-8" active={editing === m.id} onClick={() => setEditing(editing === m.id ? null : m.id)}>
                    <Shield size={16} />
                  </IconButton>
                )}
                {canKick && manageable && m.id !== me.id && (
                  <IconButton
                    label="Expulsar"
                    danger
                    className="h-8 w-8"
                    onClick={() =>
                      openModal({
                        type: 'confirm',
                        title: `Expulsar ${m.displayName}`,
                        message: `${m.displayName} será removido do servidor.`,
                        confirmLabel: 'Expulsar',
                        danger: true,
                        onConfirm: async () => {
                          await api.del(`/servers/${detail.server.id}/members/${m.id}`);
                          useApp.getState().openModal({ type: 'serverSettings', serverId: detail.server.id, tab: 'members' });
                        },
                      })
                    }
                  >
                    <UserX size={16} />
                  </IconButton>
                )}
              </div>
              {editing === m.id && (
                <div className="mt-3 flex flex-wrap gap-2 pl-12">
                  {assignable.map((r) => {
                    const on = m.roleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => void toggleRole(m.id, m.roleIds, r.id)}
                        className={cx(
                          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          on ? 'border-accent bg-accent/15 text-fg' : 'border-line text-fg-muted hover:border-line-strong',
                        )}
                      >
                        <RoleDot color={r.color} /> {r.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Convites

function Invites({ detail }: { detail: ServerDetail }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const load = () => api.get<Invite[]>(`/servers/${detail.server.id}/invites`).then(setInvites).catch(toast.error);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.server.id]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Convites ativos</h2>
        <Button onClick={() => useApp.getState().openModal({ type: 'invite', serverId: detail.server.id })}>
          <Plus size={16} /> Novo convite
        </Button>
      </div>
      <div className="divide-y divide-line rounded-xl bg-surface-1">
        {invites?.length === 0 && <p className="p-4 text-sm text-fg-muted">Nenhum convite ativo.</p>}
        {invites?.map((i) => (
          <div key={i.code} className="flex items-center gap-4 px-4 py-3 text-sm">
            <code className="rounded bg-surface-0 px-2 py-1 font-mono">{i.code}</code>
            <span className="flex-1 text-fg-muted">por {i.creatorName}</span>
            <span className="text-fg-muted">
              {i.uses}
              {i.maxUses ? `/${i.maxUses}` : ''} usos
            </span>
            <span className="w-36 text-right text-fg-muted">{i.expiresAt ? `expira ${new Date(i.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'nunca expira'}</span>
            <IconButton label="Revogar" danger className="h-8 w-8" onClick={() => void api.del(`/invites/${i.code}`).then(load, toast.error)}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </section>
  );
}
