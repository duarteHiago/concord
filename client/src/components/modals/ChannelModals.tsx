import { ArrowDown, ArrowUp, Check, Hash, Slash, Trash2, Volume2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { P, PERMISSION_INFO, has } from '../../../../shared/permissions.ts';
import { api } from '../../lib/api';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { Button, Input, Modal, RoleDot, Toggle, cx } from '../ui';

export function CreateChannelModal({ serverId, kind }: { serverId: string; kind: 'text' | 'voice' }) {
  const close = useApp((s) => s.closeModal);
  const [type, setType] = useState(kind);
  const [name, setName] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { id } = await api.post<{ id: string }>(`/servers/${serverId}/channels`, { name, type, private: isPrivate });
      await useApp.getState().loadDetail(serverId);
      useApp.getState().openChannel(serverId, id);
      close();
    } catch (err) {
      toast.error(err);
      setLoading(false);
    }
  }

  return (
    <Modal title="Criar canal" onClose={close}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <span className="block text-xs font-bold tracking-wide text-fg-muted uppercase">Tipo de canal</span>
          {(['text', 'voice'] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={cx(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                type === t ? 'border-accent bg-accent/10' : 'border-line bg-surface-0 hover:bg-surface-3',
              )}
            >
              {t === 'text' ? <Hash size={22} /> : <Volume2 size={22} />}
              <div>
                <div className="font-semibold">{t === 'text' ? 'Texto' : 'Sala de voz'}</div>
                <div className="text-xs text-fg-muted">
                  {t === 'text' ? 'Mensagens, links e imagens' : 'Voz, câmera e transmissão de tela a 60 fps'}
                </div>
              </div>
            </button>
          ))}
        </div>
        <Input label="Nome do canal" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'text' ? 'novo-canal' : 'Nova sala'} autoFocus required maxLength={50} />
        <div className="flex items-center justify-between rounded-xl bg-surface-0 p-3">
          <div>
            <div className="text-sm font-semibold">Canal privado</div>
            <div className="text-xs text-fg-muted">Apenas cargos liberados nas permissões do canal poderão vê-lo.</div>
          </div>
          <Toggle checked={isPrivate} onChange={setPrivate} />
        </div>
        <Button type="submit" loading={loading} className="w-full" disabled={!name.trim()}>
          Criar canal
        </Button>
      </form>
    </Modal>
  );
}

export function ChannelSettingsModal({ serverId, channelId }: { serverId: string; channelId: string }) {
  const close = useApp((s) => s.closeModal);
  const openModal = useApp((s) => s.openModal);
  const detail = useApp((s) => s.details[serverId]);
  const channel = detail?.channels.find((c) => c.id === channelId);
  const [tab, setTab] = useState<'overview' | 'perms'>('overview');
  const [name, setName] = useState(channel?.name ?? '');
  const [topic, setTopic] = useState(channel?.topic ?? '');
  const [userLimit, setUserLimit] = useState(channel?.userLimit ?? 0);
  const [saving, setSaving] = useState(false);
  if (!detail || !channel) return null;

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/channels/${channelId}`, { name, topic, userLimit });
      toast.success('Canal atualizado');
    } catch (err) {
      toast.error(err);
    }
    setSaving(false);
  }

  return (
    <Modal title={<span className="flex items-center gap-2">{channel.type === 'text' ? <Hash size={20} /> : <Volume2 size={20} />} {channel.name}</span>} onClose={close} width={720}>
      <div className="mb-5 flex gap-1 border-b border-line">
        {(['overview', 'perms'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx('-mb-px border-b-2 px-3 pb-2 text-sm font-semibold', tab === t ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}
          >
            {t === 'overview' ? 'Visão geral' : 'Permissões'}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-4">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
          {channel.type === 'text' ? (
            <Input label="Tópico" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="Do que se trata este canal?" />
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">
                Limite de pessoas: {userLimit === 0 ? 'sem limite' : userLimit}
              </span>
              <input type="range" min={0} max={99} value={userLimit} onChange={(e) => setUserLimit(Number(e.target.value))} className="w-full" />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={saving}>
              Salvar alterações
            </Button>
            <Button variant="secondary" onClick={() => void api.patch(`/channels/${channelId}`, { move: 'up' }).catch(toast.error)}>
              <ArrowUp size={16} /> Subir
            </Button>
            <Button variant="secondary" onClick={() => void api.patch(`/channels/${channelId}`, { move: 'down' }).catch(toast.error)}>
              <ArrowDown size={16} /> Descer
            </Button>
            <div className="flex-1" />
            <Button
              variant="danger"
              onClick={() =>
                openModal({
                  type: 'confirm',
                  title: `Apagar ${channel.type === 'text' ? '#' : ''}${channel.name}`,
                  message: 'Este canal e todo o seu conteúdo serão apagados permanentemente.',
                  confirmLabel: 'Apagar canal',
                  danger: true,
                  onConfirm: async () => {
                    await api.del(`/channels/${channelId}`);
                  },
                })
              }
            >
              <Trash2 size={16} /> Apagar
            </Button>
          </div>
        </div>
      ) : (
        <ChannelPermissions serverId={serverId} channelId={channelId} />
      )}
    </Modal>
  );
}

function ChannelPermissions({ serverId, channelId }: { serverId: string; channelId: string }) {
  const detail = useApp((s) => s.details[serverId])!;
  const channel = detail.channels.find((c) => c.id === channelId)!;
  const [roleId, setRoleId] = useState(detail.roles.find((r) => r.isDefault)!.id);
  const canEdit = has(detail.permissions, P.MANAGE_ROLES);
  const ow = channel.overwrites.find((o) => o.roleId === roleId) ?? { roleId, allow: 0, deny: 0 };
  const perms = PERMISSION_INFO.filter((p) => p.channel && (channel.type === 'voice' || !['CONNECT', 'SPEAK', 'STREAM', 'MUTE_MEMBERS', 'MOVE_MEMBERS'].includes(p.key)))
    .filter((p) => channel.type === 'text' || !['SEND_MESSAGES', 'MANAGE_MESSAGES'].includes(p.key));

  async function set(flag: number, state: 'allow' | 'inherit' | 'deny') {
    let { allow, deny } = ow;
    allow &= ~flag;
    deny &= ~flag;
    if (state === 'allow') allow |= flag;
    if (state === 'deny') deny |= flag;
    await api.put(`/channels/${channelId}/overwrites/${roleId}`, { allow, deny }).catch(toast.error);
  }

  return (
    <div className="flex gap-4">
      <div className="w-48 shrink-0 space-y-0.5">
        <div className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Cargos</div>
        {detail.roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoleId(r.id)}
            className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', roleId === r.id ? 'bg-white/10' : 'hover:bg-white/5')}
          >
            <RoleDot color={r.color} />
            <span className="flex-1 truncate">{r.name}</span>
            {channel.overwrites.some((o) => o.roleId === r.id) && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-1">
        {!canEdit && <p className="mb-2 text-sm text-warn">Você precisa de "Gerenciar cargos" para editar permissões.</p>}
        {perms.map((p) => {
          const flag = P[p.key];
          const state = ow.allow & flag ? 'allow' : ow.deny & flag ? 'deny' : 'inherit';
          return (
            <div key={p.key} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/3">
              <div className="flex-1">
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="text-xs text-fg-muted">{p.description}</div>
              </div>
              <div className="flex overflow-hidden rounded-md border border-line">
                {(
                  [
                    ['deny', <X size={14} />, 'bg-danger text-white'],
                    ['inherit', <Slash size={14} />, 'bg-surface-4 text-fg'],
                    ['allow', <Check size={14} />, 'bg-ok text-white'],
                  ] as const
                ).map(([s, icon, activeCls]) => (
                  <button
                    key={s}
                    disabled={!canEdit}
                    title={s === 'deny' ? 'Negar' : s === 'allow' ? 'Permitir' : 'Herdar do cargo'}
                    onClick={() => void set(flag, s)}
                    className={cx('flex h-7 w-8 items-center justify-center transition-colors', state === s ? activeCls : 'text-fg-subtle hover:bg-white/5')}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
