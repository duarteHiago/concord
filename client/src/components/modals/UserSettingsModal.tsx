import { BellOff, Check, ImagePlus, LogOut, RotateCcw, Trash2, Zap } from 'lucide-react';
import { notifySettings, receiveNudge } from '../../lib/nudge';
import { NOISE_MODES } from '../../lib/voiceEffects';
import { systemReducesMotion } from '../../lib/motion';
import { BotsTab } from './BotsTab';
import { ShortcutsTab } from './ShortcutsTab';
import { StyleTab } from './StyleTab';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { desktop, desktopInfo, type UpdateState } from '../../lib/desktop';
import { DEFAULT_THEME, PRESETS, normalizeTheme } from '../../lib/theme';
import { memberName, type Activity, type Me, type ThemeSettings } from '../../lib/types';
import { pickImage, prepareImage, uploadImage } from '../../lib/upload';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { useVoice } from '../../store/voice';
import { Avatar, Button, ImageHint, Input, Modal, Toggle, cx } from '../ui';

const COLORS = ['#5865f2', '#7c5cff', '#3ba55c', '#1abc9c', '#00b0f4', '#faa61a', '#e67e22', '#ed4245', '#eb459e', '#9b59b6'];

type Tab = 'profile' | 'style' | 'appearance' | 'notifications' | 'audio' | 'shortcuts' | 'bots' | 'account';

export function UserSettingsModal() {
  const close = useApp((s) => s.closeModal);
  const [tab, setTab] = useState<Tab>('profile');
  return (
    <Modal title="Configurações de usuário" onClose={close} width={720}>
      <div className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            ['profile', 'Perfil'],
            ['style', 'Estilo'],
            ['appearance', 'Aparência'],
            ['notifications', 'Notificações'],
            ['audio', 'Voz e vídeo'],
            ['shortcuts', 'Atalhos'],
            ['bots', 'Bots'],
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
      {tab === 'style' && <StyleTab />}
      {tab === 'appearance' && <Appearance />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'shortcuts' && <ShortcutsTab />}
      {tab === 'bots' && <BotsTab />}
      {tab === 'audio' && <Audio />}
      {tab === 'account' && <Account />}
    </Modal>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block text-xs font-bold tracking-wide text-fg-muted uppercase">{children}</span>;
}

// ------------------------------------------------------------------ Perfil

function Profile() {
  const me = useApp((s) => s.me)!;
  const setMe = useApp((s) => s.setMe);
  const [name, setName] = useState(me.displayName);
  const [color, setColor] = useState(me.avatarColor);
  const [banner, setBanner] = useState<string | null>(me.bannerColor);
  const [bio, setBio] = useState(me.bio);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const saveSettings = useApp((s) => s.saveSettings);
  const [customStatus, setCustomStatus] = useState(me.settings.customStatus ?? '');

  async function changeBanner() {
    const file = await pickImage();
    if (!file) return;
    setUploadingBanner(true);
    try {
      setMe(await uploadImage<Me>('/me/banner', await prepareImage(file, 1200, 3)));
      toast.success('Capa atualizada');
    } catch (err) {
      toast.error(err);
    }
    setUploadingBanner(false);
  }

  async function changeAvatar() {
    const file = await pickImage();
    if (!file) return;
    setUploading(true);
    try {
      setMe(await uploadImage<Me>('/me/avatar', await prepareImage(file, 512, true)));
      toast.success('Foto de perfil atualizada');
    } catch (err) {
      toast.error(err);
    }
    setUploading(false);
  }

  return (
    <div className="space-y-5">
      {/* prévia do cartão de perfil */}
      <div className="max-w-[480px] overflow-hidden rounded-2xl border border-line bg-surface-0">
        <div className="group relative aspect-[3/1]">
          {me.bannerUrl ? (
            <img src={me.bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${banner ?? color}, ${banner ?? color}55)` }} />
          )}
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button variant="secondary" className="h-8 px-3 text-xs" loading={uploadingBanner} onClick={changeBanner}>
              <ImagePlus size={14} /> {me.bannerUrl ? 'Trocar capa' : 'Adicionar capa'}
            </Button>
            {me.bannerUrl && (
              <Button variant="secondary" className="h-8 px-2" title="Remover capa" onClick={() => void api.del<Me>('/me/banner').then(setMe, toast.error)}>
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-end gap-4 px-4 pb-4">
          <button onClick={changeAvatar} className="group relative -mt-10 rounded-full" title="Trocar foto">
            <Avatar name={name || me.username} color={color} src={me.avatarUrl} frame={me.frame} size={84} className="rounded-full ring-[6px] ring-surface-0" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? '…' : <ImagePlus size={22} />}
            </span>
          </button>
          <div className="min-w-0 pb-1">
            <div className="truncate text-lg font-bold">{name || me.username}</div>
            <div className="text-sm text-fg-muted">@{me.username}</div>
          </div>
          <div className="ml-auto flex gap-2 pb-1">
            <Button variant="secondary" className="h-8 px-3 text-xs" onClick={changeAvatar} loading={uploading}>
              Trocar foto
            </Button>
            {me.avatarUrl && (
              <Button variant="ghost" className="h-8 px-2" onClick={() => void api.del<Me>('/me/avatar').then(setMe, toast.error)} title="Remover foto">
                <Trash2 size={15} />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="-mt-2 space-y-1.5">
        <ImageHint spec="avatar" label="Foto" />
        <ImageHint spec="banner" label="Capa" />
        <p className="pl-[34px] text-xs text-fg-subtle">Até 8 MB. Fotos são recortadas no centro na proporção certa; GIFs são enviados como estão.</p>
      </div>

      <Input label="Nome de exibição" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} hint="Em cada servidor você também pode usar um apelido diferente." />

      <div className="flex items-end gap-2">
        <Input
          label="Status personalizado"
          value={customStatus}
          maxLength={80}
          placeholder="Ex.: estudando para a prova, volto às 22h"
          onChange={(e) => setCustomStatus(e.target.value)}
          className="flex-1"
        />
        <Button variant="secondary" className="h-11 shrink-0" onClick={() => void saveSettings({ customStatus: customStatus.trim() }).then(() => toast.success('Status atualizado'))}>
          Salvar status
        </Button>
      </div>
      {desktop && (
        <div className="space-y-3 rounded-2xl bg-surface-0 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Mostrar o que estou jogando e ouvindo</div>
              <div className="text-xs text-fg-muted">O app detecta o jogo aberto na Steam e a música tocando no Spotify.</div>
            </div>
            <Toggle checked={me.settings.shareActivity !== false} onChange={(v) => void saveSettings({ shareActivity: v })} />
          </div>
          <DetectedActivity />
        </div>
      )}

      <label className="block">
        <SectionTitle>Sobre mim</SectionTitle>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={190}
          rows={3}
          placeholder="Conte algo sobre você"
          className="w-full resize-none rounded-lg border border-line bg-surface-0 p-3 text-sm outline-none focus:border-accent"
        />
        <span className="text-xs text-fg-subtle">{bio.length}/190</span>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <SectionTitle>Cor do avatar (sem foto)</SectionTitle>
          <Swatches value={color} onChange={(c) => c && setColor(c)} />
        </div>
        <div>
          <SectionTitle>Cor do banner</SectionTitle>
          <Swatches value={banner} onChange={setBanner} allowNone />
        </div>
      </div>

      <Button
        loading={saving}
        onClick={async () => {
          setSaving(true);
          try {
            setMe(await api.patch<Me>('/me', { displayName: name, avatarColor: color, bannerColor: banner, bio }));
            toast.success('Perfil atualizado');
          } catch (err) {
            toast.error(err);
          }
          setSaving(false);
        }}
      >
        Salvar perfil
      </Button>
    </div>
  );
}

/** Diagnóstico: o que o app desktop está detectando agora. */
function DetectedActivity() {
  const [activity, setActivity] = useState<Activity | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const supported = !!desktop?.refreshActivity;

  useEffect(() => {
    if (!desktop?.getActivity) return;
    void desktop.getActivity().then((a) => setActivity((a as Activity | null) ?? null));
    return desktop.onActivity?.((a) => setActivity((a as Activity | null) ?? null));
  }, []);

  if (!supported) return <p className="text-xs text-fg-subtle">Atualize o app desktop para ver o que está sendo detectado.</p>;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
      <span className="min-w-0 truncate text-fg-muted">
        Detectado agora:{' '}
        <b className="text-fg">
          {activity === undefined ? '…' : activity ? (activity.type === 'playing' ? `Jogando ${activity.name}` : `Ouvindo ${activity.details}`) : 'nada'}
        </b>
      </span>
      <Button
        variant="secondary"
        className="h-8 shrink-0 px-3 text-xs"
        loading={checking}
        onClick={async () => {
          setChecking(true);
          setActivity(((await desktop!.refreshActivity!()) as Activity | null) ?? null);
          setChecking(false);
        }}
      >
        Verificar agora
      </Button>
    </div>
  );
}

function Swatches({ value, onChange, allowNone }: { value: string | null; onChange: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNone && (
        <button
          title="Automático"
          onClick={() => onChange(null)}
          className={cx('flex h-7 w-7 items-center justify-center rounded-full border-2 bg-surface-4 text-[10px] font-bold', value === null ? 'border-fg' : 'border-transparent')}
        >
          A
        </button>
      )}
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cx('h-7 w-7 rounded-full border-2 transition-transform hover:scale-110', value === c ? 'border-fg' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
      <input type="color" value={value ?? '#7c5cff'} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded bg-transparent" title="Cor personalizada" />
    </div>
  );
}

// ------------------------------------------------------------------ Aparência

/** Animações: o Windows costuma pedir "reduzir movimento" sem a pessoa saber, então o padrão é ligado. */
function MotionSetting() {
  const motion = useApp((s) => s.me?.settings.motion) ?? 'full';
  const saveSettings = useApp((s) => s.saveSettings);
  const options = [
    ['full', 'Sempre ligadas'],
    ['system', 'Seguir o sistema'],
    ['reduce', 'Reduzidas'],
  ] as const;
  return (
    <div>
      <SectionTitle>Animações</SectionTitle>
      <div role="radiogroup" aria-label="Animações" className="flex flex-wrap gap-1.5">
        {options.map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={motion === id}
            onClick={() => void saveSettings({ motion: id })}
            className={cx('rounded-full px-4 py-1.5 text-sm font-semibold', motion === id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fg-subtle">
        Tremida, roleta, dados, moeda, reações, molduras e brilho dos stickers.
        {systemReducesMotion() && ' Seu sistema está pedindo menos movimento (efeitos de animação desligados no Windows).'}
      </p>
    </div>
  );
}

function Appearance() {
  // o seletor devolve o objeto guardado (estável); normalizar dentro dele criaria um objeto novo a cada render
  const stored = useApp((s) => s.me?.settings?.theme);
  const saveTheme = useApp((s) => s.saveTheme);
  const [theme, setTheme] = useState<ThemeSettings>(() => normalizeTheme(stored));
  const saved = theme;
  const [css, setCss] = useState(saved.customCss);
  const [bgUrl, setBgUrl] = useState(saved.background.url ?? '');
  const [uploading, setUploading] = useState(false);

  const update = (patch: Partial<ThemeSettings>) => {
    const next = { ...theme, ...patch };
    setTheme(next);
    saveTheme(next);
  };
  const updateBg = (patch: Partial<ThemeSettings['background']>) => update({ background: { ...theme.background, ...patch } });

  async function uploadBackground() {
    const file = await pickImage();
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage<{ url: string }>('/me/background', await prepareImage(file, 2560, false));
      setBgUrl(url);
      updateBg({ url });
    } catch (err) {
      toast.error(err);
    }
    setUploading(false);
  }

  return (
    <div className="space-y-6">
      <MotionSetting />
      <div>
        <SectionTitle>Tema</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ preset: p.id })}
              className={cx(
                'overflow-hidden rounded-xl border-2 text-left transition-all',
                theme.preset === p.id ? 'border-accent' : 'border-line hover:border-line-strong',
              )}
            >
              <div className="flex h-14" style={{ background: p.palette['surface-0'] }}>
                <div className="w-4" style={{ background: p.palette['surface-0'] }} />
                <div className="w-8" style={{ background: p.palette['surface-1'] }} />
                <div className="flex flex-1 flex-col justify-end gap-1 p-1.5" style={{ background: p.palette['surface-2'] }}>
                  <div className="h-1.5 w-3/4 rounded-full" style={{ background: p.palette['fg-subtle'] }} />
                  <div className="h-2 w-1/2 rounded-full" style={{ background: p.palette.accent }} />
                </div>
              </div>
              <div className="flex items-center justify-between bg-surface-0 px-2 py-1.5 text-xs font-semibold">
                {p.name}
                {theme.preset === p.id && <Check size={13} className="text-accent" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Cor de destaque</SectionTitle>
        <Swatches value={theme.accent} onChange={(accent) => update({ accent })} allowNone />
        <p className="mt-1 text-xs text-fg-subtle">"A" usa a cor do tema escolhido.</p>
      </div>

      <div>
        <SectionTitle>Imagem de fundo</SectionTitle>
        <ImageHint spec="background" className="mb-2" />
        <div className="flex gap-2">
          <Input value={bgUrl} onChange={(e) => setBgUrl(e.target.value)} placeholder="https://… (link de uma imagem)" className="flex-1" />
          <Button variant="secondary" onClick={() => updateBg({ url: bgUrl.trim() || null })}>
            Usar link
          </Button>
          <Button variant="secondary" onClick={uploadBackground} loading={uploading}>
            <ImagePlus size={16} /> Enviar
          </Button>
          {theme.background.url && (
            <Button variant="ghost" title="Remover fundo" onClick={() => { setBgUrl(''); updateBg({ url: null }); }}>
              <Trash2 size={16} />
            </Button>
          )}
        </div>
        {theme.background.url && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Slider label="Desfoque" value={theme.background.blur} min={0} max={24} step={1} format={(v) => `${v}px`} onChange={(blur) => updateBg({ blur })} />
            <Slider label="Escurecer" value={theme.background.dim} min={0} max={0.85} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(dim) => updateBg({ dim })} />
          </div>
        )}
      </div>

      <Slider label="Tamanho da interface" value={theme.scale} min={0.8} max={1.25} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(scale) => update({ scale })} />

      <div>
        <SectionTitle>CSS personalizado</SectionTitle>
        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={':root {\n  --color-accent: #ff6b6b;\n}\n.avatar img { border-radius: 30%; }'}
          className="w-full rounded-lg border border-line bg-surface-0 p-3 font-mono text-xs outline-none focus:border-accent"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-fg-subtle">
            Use as variáveis <code>--color-surface-0…4</code>, <code>--color-fg</code>, <code>--color-accent</code> etc. Vale para todos os seus dispositivos.
          </p>
          <Button variant="secondary" className="h-8 shrink-0 px-3 text-xs" onClick={() => update({ customCss: css })}>
            Aplicar CSS
          </Button>
        </div>
      </div>

      <Button
        variant="ghost"
        onClick={() => {
          setCss('');
          setBgUrl('');
          update(DEFAULT_THEME);
        }}
      >
        <RotateCcw size={16} /> Restaurar aparência padrão
      </Button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-xs font-bold tracking-wide text-fg-muted uppercase">
        {label} <span className="font-mono normal-case">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

// ------------------------------------------------------------------ Notificações

function Notifications() {
  const me = useApp((s) => s.me)!;
  const details = useApp((s) => s.details);
  const saveSettings = useApp((s) => s.saveSettings);
  const prefs = notifySettings(me);
  const status = me.settings.status === 'dnd' ? 'dnd' : 'online';
  const muted = me.settings.mutedNudges ?? [];
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');

  const set = (patch: Partial<typeof prefs>) => void saveSettings({ notifications: { ...prefs, ...patch } });
  const nameOf = (id: string) => {
    for (const d of Object.values(details)) {
      const m = d.members.find((x) => x.id === id);
      if (m) return memberName(m);
    }
    return 'Pessoa de outro servidor';
  };

  const row = (title: string, hint: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-fg-muted">{hint}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Status</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['online', 'Online', 'Recebe chamadas de atenção', 'bg-ok'],
              ['dnd', 'Não perturbe', 'Ninguém consegue chamar sua atenção', 'bg-danger'],
            ] as const
          ).map(([value, label, hint, dot]) => (
            <button
              key={value}
              onClick={() => void saveSettings({ status: value })}
              className={cx(
                'flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors',
                status === value ? 'border-accent bg-accent/10' : 'border-transparent bg-surface-0 hover:bg-surface-3',
              )}
            >
              <span className={cx('mt-1 h-3 w-3 shrink-0 rounded-full', dot)} />
              <span>
                <span className="block text-sm font-bold">{label}</span>
                <span className="block text-xs text-fg-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Chamar atenção</SectionTitle>
          <Button
            variant="secondary"
            className="h-8 px-3 text-xs"
            onClick={() =>
              receiveNudge({ from: { ...me, nickname: null }, serverId: '', serverName: 'teste', channelId: null, at: Date.now() })
            }
          >
            <Zap size={14} /> Testar em mim
          </Button>
        </div>
        <div className="divide-y divide-line rounded-2xl bg-surface-0">
          {row('Receber chamadas de atenção', 'Amigos podem fazer sua tela tremer para chamar você.', prefs.nudges, (nudges) => set({ nudges }))}
          {row('Tremer a tela', 'A interface (e a janela, no app desktop) chacoalha.', prefs.shake, (shake) => set({ shake }), !prefs.nudges)}
          {row('Tocar som', 'Um trinado curto, diferente dos sons da sala.', prefs.sound, (sound) => set({ sound }), !prefs.nudges)}
          {row(
            'Notificação do sistema',
            desktop ? 'Aparece na central de notificações do Windows.' : 'Aparece quando a aba do Concord não está visível.',
            prefs.desktop,
            (v) => set({ desktop: v }),
            !prefs.nudges,
          )}
        </div>
        {!desktop && prefs.desktop && permission !== 'granted' && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-warn/10 p-3 text-sm text-warn">
            {permission === 'denied' ? 'O navegador está bloqueando notificações deste site. Libere no cadeado ao lado do endereço.' : 'Falta permitir as notificações neste navegador.'}
            {permission === 'default' && (
              <Button variant="secondary" className="h-8 shrink-0 px-3 text-xs" onClick={() => void Notification.requestPermission().then(setPermission)}>
                Permitir
              </Button>
            )}
          </div>
        )}
      </div>

      <div>
        <SectionTitle>Pessoas silenciadas</SectionTitle>
        {muted.length === 0 ? (
          <p className="text-sm text-fg-muted">Ninguém. Para silenciar alguém, abra o perfil da pessoa e toque no sininho.</p>
        ) : (
          <div className="divide-y divide-line rounded-2xl bg-surface-0">
            {muted.map((id) => (
              <div key={id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <BellOff size={15} className="text-danger" /> {nameOf(id)}
                </span>
                <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => void saveSettings({ mutedNudges: muted.filter((x) => x !== id) })}>
                  Reativar
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-fg-subtle">Quem você silencia não fica sabendo: para essa pessoa, o chamado parece ter sido entregue.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Áudio

function CameraSettings({ cameras }: { cameras: MediaDeviceInfo[] }) {
  const settings = useVoice((s) => s.audioSettings);
  const setAudioSettings = useVoice((s) => s.setAudioSettings);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const deviceId = settings.videoInputId || cameras[0]?.deviceId || '';

  // prévia: abre a câmera só enquanto o botão estiver ligado, e fecha ao sair da aba
  useEffect(() => {
    if (!preview) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError('');
    navigator.mediaDevices
      .getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId }, width: 1280, height: 720 } : true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'Permissão da câmera negada.' : `Não foi possível abrir a câmera: ${e.message}`));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [preview, deviceId]);

  return (
    <div className="space-y-3">
      <label className="block">
        <SectionTitle>Câmera</SectionTitle>
        <select
          value={deviceId}
          onChange={(e) => void setAudioSettings({ videoInputId: e.target.value })}
          className="h-11 w-full rounded-2xl bg-surface-3 px-3 text-sm outline-none"
        >
          {cameras.length === 0 && <option value="">Nenhuma câmera encontrada</option>}
          {cameras.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Câmera sem nome'}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        {(['720p', '1080p'] as const).map((q) => (
          <button
            key={q}
            onClick={() => void setAudioSettings({ cameraQuality: q })}
            className={cx(
              'h-9 rounded-full px-4 text-sm font-bold transition-colors',
              settings.cameraQuality === q ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg',
            )}
          >
            {q}
          </button>
        ))}
        <span className="text-xs text-fg-subtle">1080p usa mais internet de quem envia.</span>
      </div>
      <div className="overflow-hidden rounded-2xl bg-surface-0">
        {preview ? (
          <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full -scale-x-100 bg-black object-cover" />
        ) : (
          <div className="flex aspect-video items-center justify-center">
            <Button variant="secondary" disabled={cameras.length === 0} onClick={() => setPreview(true)}>
              Testar câmera
            </Button>
          </div>
        )}
      </div>
      {preview && (
        <Button variant="ghost" onClick={() => setPreview(false)}>
          Desligar prévia
        </Button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Audio() {
  const settings = useVoice((s) => s.audioSettings);
  const setAudioSettings = useVoice((s) => s.setAudioSettings);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

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
        setCameras(devices.filter((d) => d.kind === 'videoinput'));
      } catch {
        toast.error('Não foi possível listar os dispositivos de áudio.');
      }
    })();
  }, []);

  const select = (label: string, value: string, list: MediaDeviceInfo[], onChange: (v: string) => void) => (
    <label className="block">
      <SectionTitle>{label}</SectionTitle>
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
      <CameraSettings cameras={cameras} />
      <div>
        <SectionTitle>Supressão de ruído</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {NOISE_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => void setAudioSettings({ noiseMode: m.id })}
              aria-pressed={settings.noiseMode === m.id}
              className={cx(
                'rounded-2xl border-2 p-3 text-left transition-colors',
                settings.noiseMode === m.id ? 'border-accent bg-accent/10' : 'border-transparent bg-surface-0 hover:bg-surface-3',
              )}
            >
              <span className="block text-sm font-bold">{m.label}</span>
              <span className="block text-xs text-fg-muted">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-line rounded-xl bg-surface-0">
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

// ------------------------------------------------------------------ Conta

function RecoverySection() {
  const hasCode = useApp((s) => !!s.me?.hasRecoveryCode);
  const openModal = useApp((s) => s.openModal);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const { code } = await api.post<{ code: string }>('/me/recovery-code', { password });
      setPassword('');
      openModal({ type: 'recoveryCode', code, next: { type: 'userSettings' } });
    } catch (err) {
      toast.error(err);
    }
    setLoading(false);
  }

  return (
    <div className={cx('space-y-3 rounded-2xl p-4', hasCode ? 'bg-surface-0' : 'bg-warn/10 ring-1 ring-warn/40')}>
      <h3 className="font-semibold">Código de recuperação</h3>
      <p className="text-sm text-fg-muted">
        {hasCode
          ? 'Você já tem um código. Gerar outro invalida o anterior.'
          : 'Você ainda não tem um código. Sem ele, se esquecer a senha, só quem administra o servidor consegue redefini-la.'}
      </p>
      <div className="flex items-end gap-2">
        <Input label="Senha atual" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1" />
        <Button variant={hasCode ? 'secondary' : 'primary'} disabled={!password} loading={loading} onClick={generate} className="h-11 shrink-0">
          {hasCode ? 'Gerar novo código' : 'Gerar código'}
        </Button>
      </div>
    </div>
  );
}

function DesktopServer() {
  const [server, setServer] = useState('');
  const [version, setVersion] = useState('');
  useEffect(() => {
    void desktopInfo().then((i) => {
      setServer(i.server);
      setVersion(i.version);
    });
  }, []);
  return (
    <div className="space-y-3 rounded-xl bg-surface-0 p-4">
      <h3 className="font-semibold">App desktop {version && <span className="text-xs font-normal text-fg-subtle">v{version}</span>}</h3>
      <div className="flex gap-2">
        <Input label="Servidor" value={server} onChange={(e) => setServer(e.target.value)} className="flex-1" hint="Endereço do Concord que este app abre." />
      </div>
      <Button variant="secondary" onClick={() => void desktop!.setServer(server).catch(toast.error)}>
        Conectar a este servidor
      </Button>
      <UpdateRow />
    </div>
  );
}

function UpdateRow() {
  const [s, setS] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!desktop?.updateState) return;
    void desktop.updateState().then(setS);
    return desktop.onUpdateState?.(setS);
  }, []);
  if (!desktop?.checkForUpdates) {
    return <p className="text-xs text-fg-subtle">Esta versão do app não tem atualização automática. Baixe a mais recente no site.</p>;
  }
  const text: Record<UpdateState['state'], string> = {
    idle: 'Atualização automática ativada.',
    dev: 'Modo desenvolvimento: sem atualização automática.',
    checking: 'Procurando…',
    latest: 'Você está na versão mais recente.',
    downloading: `Baixando a versão ${s?.version ?? ''}… ${s?.progress ?? 0}%`,
    ready: `Versão ${s?.version ?? ''} pronta. Reinicie para instalar.`,
    error: `Não foi possível verificar: ${s?.error ?? ''}`,
  };
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
      <span className={cx('text-sm', s?.state === 'error' ? 'text-danger' : 'text-fg-muted')}>{text[s?.state ?? 'idle']}</span>
      {s?.state === 'ready' ? (
        <Button className="h-9 shrink-0 px-4 text-xs" onClick={() => void desktop!.installUpdate?.()}>
          Reiniciar agora
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="h-9 shrink-0 px-4 text-xs"
          loading={s?.state === 'checking'}
          disabled={s?.state === 'downloading'}
          onClick={() => void desktop!.checkForUpdates!().then(setS)}
        >
          Procurar atualizações
        </Button>
      )}
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
      {desktop && <DesktopServer />}
      <RecoverySection />
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
