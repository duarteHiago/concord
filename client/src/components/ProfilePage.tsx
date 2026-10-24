// Página do perfil: abre ao clicar em alguém (passar o mouse abre o mini perfil). Inspirada no perfil da Steam:
// fundo próprio, cor de destaque e vitrines que a pessoa escolhe e ordena: o que está fazendo agora, a
// biblioteca da Steam, os patches e os servidores em comum.
// A personalização fica na própria página (botão "Personalizar"), não nas Configurações.
import { ArrowDown, ArrowUp, Clock, Gamepad2, Headphones, ImagePlus, MessageCircle, Paintbrush, Server, Shirt, Trash2, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../lib/api';
import { pickImage, prepareImage, uploadImage } from '../lib/upload';
import type { Activity, Patch, ServerSummary, User } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { PATCH_TILTS, PatchBadge } from './PatchBadge';
import { SupporterPatch } from './SupporterPatch';
import { Avatar, Button, IconButton, Spinner, VerifiedBadge, cx, initials } from './ui';

type Showcase = 'playing' | 'steam' | 'patches' | 'servers';
const SHOWCASES: { id: Showcase; label: string; icon: typeof Server }[] = [
  { id: 'playing', label: 'Agora', icon: Gamepad2 },
  { id: 'steam', label: 'Biblioteca da Steam', icon: Gamepad2 },
  { id: 'patches', label: 'Patches', icon: Shirt },
  { id: 'servers', label: 'Servidores em comum', icon: Server },
];

interface PageStyle {
  bgUrl: string | null;
  dim: number;
  accent: string | null;
  layout: 'one' | 'two';
  showcases: Showcase[];
}

interface ProfileData {
  user: User & { createdAt: number };
  page: PageStyle;
  steamLinked: boolean;
  mutualServers: ServerSummary[];
}

function useJson<T>(path: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({ path: null, data: null, error: null });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api.get<T>(path).then(
      (data) => alive && setState({ path, data, error: null }),
      (err) => alive && setState({ path, data: null, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return state.path === path ? state : { path, data: null, error: null };
}

export function ProfilePage() {
  const view = useApp((s) => s.profile)!;
  const me = useApp((s) => s.me)!;
  const closeProfile = useApp((s) => s.closeProfile);
  const openDm = useApp((s) => s.openDm);
  const own = view.userId === me.id;
  // o próprio perfil recarrega quando a conta muda (Steam conectada, patches...)
  const { data, error } = useJson<ProfileData>(`/users/${view.userId}/profile`, [own ? me : null]);
  const [page, setPage] = useState<PageStyle | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => setPage(data?.page ?? null), [data]);

  if (error) {
    return (
      <main className="panel flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-fg-muted">{error}</p>
        <Button variant="secondary" onClick={closeProfile}>
          Voltar
        </Button>
      </main>
    );
  }
  if (!data || !page) {
    return (
      <main className="panel flex flex-1 items-center justify-center">
        <Spinner />
      </main>
    );
  }

  const u = data.user;
  const accentStyle = page.accent ? ({ '--color-accent': page.accent } as CSSProperties) : undefined;

  return (
    <main className="panel relative flex min-w-0 flex-1 overflow-hidden" style={accentStyle}>
      {/* fundo da página, escurecido para ler por cima */}
      <div className="absolute inset-0">
        {page.bgUrl ? (
          <img src={page.bgUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: `linear-gradient(160deg, ${u.bannerColor ?? u.avatarColor}66, transparent 60%)` }} />
        )}
        <div className="absolute inset-0 bg-black" style={{ opacity: page.bgUrl ? page.dim / 100 : 0 }} />
      </div>

      <div className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
          <div className="flex justify-end gap-2">
            {own && !editing && (
              <Button variant="secondary" className="h-9 bg-surface-2/80 backdrop-blur" onClick={() => setEditing(true)}>
                <Paintbrush size={15} /> Personalizar
              </Button>
            )}
            <IconButton label="Fechar o perfil" className="h-9 w-9 bg-surface-2/80 backdrop-blur" onClick={closeProfile}>
              <X size={18} />
            </IconButton>
          </div>

          <Hero user={u} own={own} onMessage={() => void openDm(u.id)} />

          <div className={cx('grid gap-4', page.layout === 'two' && 'lg:grid-cols-2')}>
            {page.showcases.map((id) => (
              <ShowcaseView key={id} id={id} data={data} own={own} />
            ))}
          </div>
          {page.showcases.length === 0 && own && <p className="text-center text-sm text-fg-muted">Nenhuma vitrine ligada. Clique em Personalizar para escolher.</p>}
        </div>
      </div>

      {editing && page && <Editor page={page} onChange={setPage} onClose={() => setEditing(false)} />}
    </main>
  );
}

// ------------------------------------------------------------------ topo

function Hero({ user, own, onMessage }: { user: User & { createdAt: number }; own: boolean; onMessage: () => void }) {
  return (
    <section className="overflow-hidden rounded-[28px] bg-surface-1/85 ring-1 ring-line backdrop-blur-md">
      {user.bannerUrl ? (
        <img src={user.bannerUrl} alt="" className="aspect-[4/1] w-full object-cover" />
      ) : (
        <div className="aspect-[6/1] w-full" style={{ background: `linear-gradient(135deg, ${user.bannerColor ?? user.avatarColor}, ${user.bannerColor ?? user.avatarColor}55)` }} />
      )}
      <div className="flex flex-wrap items-end gap-5 px-6 pb-6">
        <div className="-mt-14 shrink-0 rounded-full ring-[6px] ring-surface-1">
          <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl} frame={user.frame} size={112} />
        </div>
        <div className="min-w-0 flex-1 pt-3">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-extrabold">
            <span className="truncate">{user.displayName}</span>
            {user.verified && <VerifiedBadge size={22} />}
            {user.mecenas && <span className="rounded-full bg-warn/15 px-2.5 text-xs leading-6 font-extrabold tracking-wide text-warn">MECENAS</span>}
          </h1>
          <div className="text-fg-muted">
            @{user.username} · no Concord desde {new Date(user.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </div>
          {user.bio && <p className="mt-3 max-w-2xl text-[15px] whitespace-pre-wrap">{user.bio}</p>}
        </div>
        {!own && (
          <Button onClick={onMessage}>
            <MessageCircle size={16} /> Mensagem
          </Button>
        )}
      </div>
    </section>
  );
}

function Card({ title, icon, children, wide }: { title: string; icon: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={cx('rounded-[24px] bg-surface-1/85 p-5 ring-1 ring-line backdrop-blur-md', wide && 'lg:col-span-2')}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-fg-muted uppercase">
        <span className="text-accent">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function ShowcaseView({ id, data, own }: { id: Showcase; data: ProfileData; own: boolean }) {
  switch (id) {
    case 'playing':
      return <NowShowcase userId={data.user.id} />;
    case 'steam':
      return <SteamShowcase userId={data.user.id} linked={data.steamLinked} own={own} />;
    case 'patches':
      return <PatchesShowcase user={data.user} />;
    case 'servers':
      return own ? null : <ServersShowcase servers={data.mutualServers} />;
  }
}

// ------------------------------------------------------------------ vitrines

function NowShowcase({ userId }: { userId: string }) {
  const presence = useApp((s) => s.online[userId]);
  const activities: Activity[] = presence?.activities ?? [];
  return (
    <Card title="Agora" icon={<Clock size={15} />}>
      {!presence ? (
        <p className="text-sm text-fg-subtle">Offline.</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-fg-muted">{presence.customStatus || 'Online, sem nada rolando agora.'}</p>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => (
            <div key={`${a.type}:${a.name}`} className="flex items-center gap-3 rounded-2xl bg-surface-3/70 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                {a.type === 'playing' ? <Gamepad2 size={20} /> : <Headphones size={20} />}
              </span>
              <div className="min-w-0">
                <div className="text-xs text-fg-muted">{a.type === 'playing' ? 'Jogando' : 'Ouvindo'}</div>
                <div className="truncate font-semibold">{a.name}</div>
                {a.details && <div className="truncate text-xs text-fg-muted">{a.details}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

interface SteamData {
  linked: boolean;
  profile?: { name: string; avatar: string | null; url: string } | null;
  games?: { appid: number; name: string; playtimeMin: number; playtime2wMin: number }[] | null;
}

const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.round(min / 60).toLocaleString('pt-BR')} h`);
const steamCover = (appid: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

function SteamShowcase({ userId, linked, own }: { userId: string; linked: boolean; own: boolean }) {
  const me = useApp((s) => s.me)!;
  const { data, error } = useJson<SteamData>(linked ? `/users/${userId}/steam` : null);
  // jogos em comum com quem está visitando (se a pessoa também conectou a Steam)
  const mine = useJson<SteamData>(!own && linked && me.steamLinked ? `/users/${me.id}/steam` : null);
  const [all, setAll] = useState(false);

  if (!linked) {
    if (!own) return null;
    return (
      <Card title="Biblioteca da Steam" icon={<Gamepad2 size={15} />}>
        <SteamConnect />
      </Card>
    );
  }
  if (error) return <Card title="Biblioteca da Steam" icon={<Gamepad2 size={15} />}><p className="text-sm text-fg-muted">{error}</p></Card>;
  if (!data) return <Card title="Biblioteca da Steam" icon={<Gamepad2 size={15} />}><Spinner /></Card>;

  const games = data.games;
  const recent = games?.filter((g) => g.playtime2wMin > 0).sort((a, b) => b.playtime2wMin - a.playtime2wMin) ?? [];
  const totalMin = games?.reduce((n, g) => n + g.playtimeMin, 0) ?? 0;
  const mineIds = new Set(mine.data?.games?.map((g) => g.appid) ?? []);
  const common = games?.filter((g) => mineIds.has(g.appid)) ?? [];
  const shown = (games ?? []).slice(0, all ? 60 : 8);

  return (
    <Card title="Biblioteca da Steam" icon={<Gamepad2 size={15} />} wide>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {data.profile && (
          <a href={data.profile.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-2 font-semibold hover:underline">
            {data.profile.avatar && <img src={data.profile.avatar} alt="" className="h-7 w-7 rounded-md" />}
            {data.profile.name}
          </a>
        )}
        {games && (
          <>
            <span className="text-fg-muted">
              <b className="text-fg">{games.length}</b> jogos
            </span>
            <span className="text-fg-muted">
              <b className="text-fg">{hours(totalMin)}</b> jogadas
            </span>
            {!own && me.steamLinked && mine.data?.games && (
              <span className="text-fg-muted">
                <b className="text-accent">{common.length}</b> em comum com você
              </span>
            )}
          </>
        )}
        {own && <SteamDisconnect />}
      </div>

      {!games ? (
        <p className="text-sm text-fg-muted">
          {own
            ? 'Sua lista de jogos está privada na Steam. Para aparecer aqui: Steam → Perfil → Editar perfil → Privacidade → "Detalhes de jogos" como Público.'
            : 'A lista de jogos desta pessoa está privada na Steam.'}
        </p>
      ) : (
        <div className="space-y-5">
          {recent.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold text-fg-subtle">Jogou nas últimas 2 semanas</h3>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {recent.slice(0, 6).map((g) => (
                  <GameTile key={g.appid} appid={g.appid} name={g.name} sub={`${hours(g.playtime2wMin)} nas 2 semanas`} />
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-xs font-bold text-fg-subtle">Mais jogados</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((g) => (
                <GameTile key={g.appid} appid={g.appid} name={g.name} sub={hours(g.playtimeMin)} highlight={!own && mineIds.has(g.appid)} />
              ))}
            </div>
            {games.length > 8 && (
              <button onClick={() => setAll(!all)} className="mt-3 text-sm font-semibold text-accent hover:underline">
                {all ? 'Mostrar menos' : `Ver mais (${Math.min(games.length, 60) - 8})`}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function GameTile({ appid, name, sub, highlight }: { appid: number; name: string; sub: string; highlight?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <a
      href={`https://store.steampowered.com/app/${appid}`}
      target="_blank"
      rel="noreferrer noopener"
      title={highlight ? `${name} · você também tem` : name}
      className={cx('block w-full min-w-40 shrink-0 overflow-hidden rounded-2xl bg-surface-3 transition-transform hover:-translate-y-0.5', highlight && 'ring-2 ring-accent')}
    >
      {broken ? (
        <div className="flex aspect-[460/215] items-center justify-center px-2 text-center font-display text-sm font-bold text-fg-muted">{name}</div>
      ) : (
        <img src={steamCover(appid)} alt="" loading="lazy" onError={() => setBroken(true)} className="aspect-[460/215] w-full object-cover" />
      )}
      <div className="px-2.5 py-2">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="text-xs text-fg-muted">{sub}</div>
      </div>
    </a>
  );
}

function SteamConnect() {
  const me = useApp((s) => s.me)!;
  if (!me.integrations?.steam) return <p className="text-sm text-fg-muted">A integração com a Steam ainda não foi ligada neste servidor.</p>;
  async function connect() {
    try {
      const { url } = await api.post<{ url: string }>('/me/steam/link');
      // no app desktop abre no navegador; na web, em outra aba. A conta aparece aqui sozinha quando terminar.
      window.open(url, '_blank', 'noopener');
      toast.info('Entre na Steam na janela que abriu. Quando terminar, sua biblioteca aparece aqui.');
    } catch (err) {
      toast.error(err);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="min-w-0 flex-1 text-sm text-fg-muted">Conecte sua Steam para mostrar seus jogos, as horas jogadas e os jogos em comum com quem visita seu perfil.</p>
      <Button onClick={() => void connect()}>
        <Gamepad2 size={16} /> Conectar a Steam
      </Button>
    </div>
  );
}

function SteamDisconnect() {
  return (
    <button
      onClick={() => void api.del('/me/steam').catch(toast.error)}
      className="ml-auto text-xs font-semibold text-fg-subtle hover:text-danger"
    >
      Desconectar a Steam
    </button>
  );
}

function PatchesShowcase({ user }: { user: User }) {
  const patches: Patch[] = user.patches ?? [];
  if (!patches.length && !user.supporter) return null;
  return (
    <Card title="Patches" icon={<Shirt size={15} />}>
      <div className="flex flex-wrap items-center gap-4">
        {user.supporter && <SupporterPatch tier={user.supporter.tier} size={64} />}
        {patches.map((p, i) => (
          <PatchBadge key={p.id} patch={p} size={60} tilt={PATCH_TILTS[i % PATCH_TILTS.length]} />
        ))}
      </div>
    </Card>
  );
}

function ServersShowcase({ servers }: { servers: ServerSummary[] }) {
  const openServer = useApp((s) => s.openServer);
  return (
    <Card title={`Servidores em comum (${servers.length})`} icon={<Server size={15} />}>
      {servers.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhum servidor em comum.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {servers.map((s) => (
            <button key={s.id} onClick={() => openServer(s.id)} className="flex items-center gap-2 rounded-2xl bg-surface-3/70 py-1.5 pr-3 pl-1.5 text-sm font-semibold hover:bg-surface-4">
              {s.iconUrl ? (
                <img src={s.iconUrl} alt="" className="h-7 w-7 rounded-lg object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-4 text-[11px] font-bold">{initials(s.name)}</span>
              )}
              {s.name}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ personalizar

function Editor({ page, onChange, onClose }: { page: PageStyle; onChange: (p: PageStyle) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const save = async (patch: Partial<PageStyle>) => {
    onChange({ ...page, ...patch });
    try {
      onChange(await api.put<PageStyle>('/me/profile-page', patch));
    } catch (err) {
      toast.error(err);
    }
  };

  async function uploadBg() {
    const file = await pickImage();
    if (!file) return;
    setBusy(true);
    try {
      const blob = await prepareImage(file, 2560, false);
      onChange(await uploadImage<PageStyle>('/me/profile-bg', blob));
    } catch (err) {
      toast.error(err);
    }
    setBusy(false);
  }

  const move = (id: Showcase, dir: -1 | 1) => {
    const list = [...page.showcases];
    const i = list.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void save({ showcases: list });
  };
  const toggle = (id: Showcase) => void save({ showcases: page.showcases.includes(id) ? page.showcases.filter((s) => s !== id) : [...page.showcases, id] });
  // ligadas primeiro, na ordem escolhida; depois as desligadas
  const ordered = [...page.showcases, ...SHOWCASES.map((s) => s.id).filter((id) => !page.showcases.includes(id))];

  return (
    <aside aria-label="Personalizar perfil" className="relative w-80 shrink-0 animate-slide-up overflow-y-auto border-l border-line bg-surface-1/95 p-5 backdrop-blur-md">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Personalizar</h2>
        <IconButton label="Fechar" className="h-8 w-8" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-bold tracking-wider text-fg-subtle uppercase">Fundo</h3>
        <div className="flex gap-2">
          <Button variant="secondary" className="h-9 flex-1" loading={busy} onClick={() => void uploadBg()}>
            <ImagePlus size={15} /> {page.bgUrl ? 'Trocar imagem' : 'Escolher imagem'}
          </Button>
          {page.bgUrl && (
            <IconButton
              label="Tirar o fundo"
              danger
              className="h-9 w-9"
              onClick={() => void api.del<PageStyle>('/me/profile-bg').then(onChange, toast.error)}
            >
              <Trash2 size={15} />
            </IconButton>
          )}
        </div>
        <p className="text-xs text-fg-subtle">Imagem ou GIF, até 8 MB.</p>
        {page.bgUrl && (
          <label className="block">
            <span className="mb-1 flex justify-between text-xs font-bold text-fg-muted">
              Escurecer <span className="tabular-nums">{page.dim}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={80}
              value={page.dim}
              onChange={(e) => onChange({ ...page, dim: Number(e.target.value) })}
              onPointerUp={(e) => void save({ dim: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={(e) => void save({ dim: Number((e.target as HTMLInputElement).value) })}
              className="w-full"
            />
          </label>
        )}
      </section>

      <section className="mt-6 space-y-3">
        <h3 className="text-xs font-bold tracking-wider text-fg-subtle uppercase">Cor de destaque</h3>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={page.accent ?? '#ff8a6b'}
            onChange={(e) => onChange({ ...page, accent: e.target.value })}
            onBlur={(e) => void save({ accent: e.target.value })}
            aria-label="Cor de destaque da página"
            className="h-9 w-14 cursor-pointer rounded-lg bg-transparent"
          />
          {page.accent && (
            <button onClick={() => void save({ accent: null })} className="text-xs font-semibold text-fg-muted hover:text-fg">
              Usar a do tema
            </button>
          )}
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <h3 className="text-xs font-bold tracking-wider text-fg-subtle uppercase">Colunas</h3>
        <div className="flex gap-1 rounded-full bg-surface-0 p-1">
          {(['two', 'one'] as const).map((l) => (
            <button
              key={l}
              onClick={() => void save({ layout: l })}
              className={cx('flex-1 rounded-full py-1.5 text-sm font-semibold', page.layout === l ? 'bg-accent text-on-accent' : 'text-fg-muted hover:text-fg')}
            >
              {l === 'two' ? 'Duas' : 'Uma'}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-2">
        <h3 className="text-xs font-bold tracking-wider text-fg-subtle uppercase">Vitrines</h3>
        {ordered.map((id) => {
          const info = SHOWCASES.find((s) => s.id === id)!;
          const on = page.showcases.includes(id);
          const i = page.showcases.indexOf(id);
          return (
            <div key={id} className={cx('flex items-center gap-2 rounded-2xl px-3 py-2', on ? 'bg-surface-3' : 'bg-surface-0 opacity-70')}>
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={on} onChange={() => toggle(id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                <span className="truncate">{info.label}</span>
              </label>
              {on && (
                <>
                  <IconButton label="Subir" className="h-7 w-7" disabled={i === 0} onClick={() => move(id, -1)}>
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton label="Descer" className="h-7 w-7" disabled={i === page.showcases.length - 1} onClick={() => move(id, 1)}>
                    <ArrowDown size={14} />
                  </IconButton>
                </>
              )}
            </div>
          );
        })}
        <p className="pt-1 text-xs text-fg-subtle">
          Foto, capa, moldura e bio ficam em Configurações → Perfil.
        </p>
      </section>
    </aside>
  );
}
