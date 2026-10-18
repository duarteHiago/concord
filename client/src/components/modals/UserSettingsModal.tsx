import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { User } from '../../lib/types';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { useVoice } from '../../store/voice';
import { Avatar, Button, Input, Modal, Toggle, cx } from '../ui';

const COLORS = ['#5865f2', '#7c5cff', '#3ba55c', '#1abc9c', '#00b0f4', '#faa61a', '#e67e22', '#ed4245', '#eb459e', '#9b59b6'];

export function UserSettingsModal() {
  const close = useApp((s) => s.closeModal);
  const [tab, setTab] = useState<'profile' | 'audio' | 'account'>('profile');
  return (
    <Modal title="Configurações de usuário" onClose={close} width={560}>
      <div className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            ['profile', 'Perfil'],
            ['audio', 'Voz e áudio'],
            ['account', 'Conta'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx('-mb-px border-b-2 px-3 pb-2 text-sm font-semibold', tab === id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'profile' && <Profile />}
      {tab === 'audio' && <Audio />}
      {tab === 'account' && <Account />}
    </Modal>
  );
}

function Profile() {
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const [name, setName] = useState(me.displayName);
  const [color, setColor] = useState(me.avatarColor);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl bg-surface-0 p-4">
        <Avatar name={name || me.username} color={color} size={64} />
        <div>
          <div className="text-lg font-bold">{name || me.username}</div>
          <div className="text-sm text-fg-muted">@{me.username}</div>
        </div>
      </div>
      <Input label="Nome de exibição" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
      <div>
        <span className="mb-2 block text-xs font-bold tracking-wide text-fg-muted uppercase">Cor do avatar</span>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cx('h-8 w-8 rounded-full border-2 transition-transform hover:scale-110', color === c ? 'border-white' : 'border-transparent')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <Button
        loading={saving}
        onClick={async () => {
          setSaving(true);
          try {
            setMe(await api.patch<User>('/me', { displayName: name, avatarColor: color }));
            toast.success('Perfil atualizado');
          } catch (err) {
            toast.error(err);
          }
          setSaving(false);
        }}
      >
        Salvar
      </Button>
    </div>
  );
}

function Audio() {
  const settings = useVoice((s) => s.audioSettings);
  const setAudioSettings = useVoice((s) => s.setAudioSettings);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        // sem permissão os rótulos vêm vazios: pede acesso uma vez
        if (devices.every((d) => !d.label)) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        }
        setInputs(devices.filter((d) => d.kind === 'audioinput'));
        setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      } catch {
        toast.error('Não foi possível listar os dispositivos de áudio.');
      }
    })();
  }, []);

  const select = (label: string, value: string, list: MediaDeviceInfo[], onChange: (v: string) => void) => (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-surface-0 px-2 text-sm outline-none">
        {list.length === 0 && <option value="default">Padrão</option>}
        {list.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || 'Dispositivo sem nome'}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      {select('Microfone', settings.inputId, inputs, (inputId) => void setAudioSettings({ inputId }))}
      {outputs.length > 0 && select('Saída de áudio', settings.outputId, outputs, (outputId) => void setAudioSettings({ outputId }))}
      <div className="divide-y divide-line rounded-xl bg-surface-0">
        <div className="flex items-center justify-between p-3">
          <div>
            <div className="text-sm font-semibold">Supressão de ruído</div>
            <div className="text-xs text-fg-muted">Reduz ruídos de fundo como teclado e ventilador.</div>
          </div>
          <Toggle checked={settings.noiseSuppression} onChange={(v) => void setAudioSettings({ noiseSuppression: v })} />
        </div>
        <div className="flex items-center justify-between p-3">
          <div>
            <div className="text-sm font-semibold">Cancelamento de eco</div>
            <div className="text-xs text-fg-muted">Evita que o som dos alto-falantes volte pelo microfone.</div>
          </div>
          <Toggle checked={settings.echoCancellation} onChange={(v) => void setAudioSettings({ echoCancellation: v })} />
        </div>
      </div>
    </div>
  );
}

function Account() {
  const logout = useApp((s) => s.logout);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="font-semibold">Alterar senha</h3>
        <Input label="Senha atual" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label="Nova senha" type="password" value={next} onChange={(e) => setNext(e.target.value)} hint="Mínimo de 6 caracteres" />
        <Button
          loading={saving}
          disabled={!current || next.length < 6}
          onClick={async () => {
            setSaving(true);
            try {
              await api.patch('/me', { currentPassword: current, newPassword: next });
              toast.success('Senha alterada');
              setCurrent('');
              setNext('');
            } catch (err) {
              toast.error(err);
            }
            setSaving(false);
          }}
        >
          Alterar senha
        </Button>
      </div>
      <div className="h-px bg-line" />
      <Button variant="danger" onClick={logout}>
        <LogOut size={16} /> Sair da conta
      </Button>
    </div>
  );
}
