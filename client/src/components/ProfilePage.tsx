// Página do perfil: abre ao clicar em alguém (passar o mouse abre o mini perfil). Sem caixas empilhadas: o fundo
// escolhido vira uma capa de cinema que se dissolve na página, o nome vem grande, e embaixo ficam só números soltos
// e as seções que importam: os jogos que a pessoa escolheu em destaque (capas em pé, o favorito maior), os mais
// jogados e o que vocês têm em comum. A personalização fica na própria página (botão "Personalizar").
import { Check, ChevronLeft, ChevronRight, Gamepad2, Headphones, ImagePlus, Paintbrush, Search, Star, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { sendNudge } from '../lib/nudge';
import { pickImage, prepareImage, uploadImage } from '../lib/upload';
import { readableOn } from '../lib/theme';
import type { Activity, Patch, ServerSummary, User } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { PATCH_TILTS, PatchBadge } from './PatchBadge';
import { SupporterPatch } from './SupporterPatch';
import { Avatar, Button, IconButton, Spinner, VerifiedBadge, cx, initials } from './ui';

type Showcase = 'playing' | 'steam' | 'patches' | 'servers';
const SECTIONS: { id: Showcase; label: string }[] = [
  { id: 'playing', label: 'O que estou fazendo agora' },
  { id: 'steam', label: 'Jogos da Steam' },
  { id: 'patches', label: 'Patches' },
  { id: 'servers', label: 'Em comum com quem visita' },
];
const MAX_FEATURED = 5;

interface PageStyle {
  bgUrl: string | null;
  dim: number;
  accent: string | null;
  showcases: Showcase[];
  featured: number[];
  favoriteAsBg: boolean;
}

interface ProfileData {
  user: User & { createdAt: number };
  page: PageStyle;
  steamLinked: boolean;
  mutualServers: ServerSummary[];
}

interface SteamGame {
  appid: number;
  name: string;
  playtimeMin: number;
  playtime2wMin: number;
}

interface SteamData {
  linked: boolean;
  profile?: { name: string; avatar: string | null; url: string } | null;
  /** null = lista de jogos privada na Steam */
  games?: SteamGame[] | null;
}

const steamArt = (appid: number, kind: 'portrait' | 'hero' | 'header') =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${kind === 'portrait' ? 'library_600x900' : kind === 'hero' ? 'library_hero' : 'header'}.jpg`;
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.round(min / 60).toLocaleString('pt-BR')} h`);

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
  const own = view.userId === me.id;
  // o próprio perfil recarrega quando a conta muda (Steam conectada, patches...)
  const { data, error } = useJson<ProfileData>(`/users/${view.userId}/profile`, [own ? me : null]);
  const steam = useJson<SteamData>(data?.steamLinked ? `/users/${view.userId}/steam` : null, [own ? me.steamLinked : null]);
  // jogos de quem está visitando, para marcar o que vocês dois têm
  const mine = useJson<SteamData>(!own && data?.steamLinked && me.steamLinked ? `/users/${me.id}/steam` : null);
  const [page, setPage] = useState<PageStyle | null>(null);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  useEffect(() => setPage(data?.page ?? null), [data]);

  const games = steam.data?.games ?? null;
  const mineIds = useMemo(() => new Set(mine.data?.games?.map((g) => g.appid) ?? []), [mine.data]);

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
  const show = (id: Showcase) => page.showcases.includes(id);
  const byId = new Map((games ?? []).map((g) => [g.appid, g]));
  const featured = page.featured.map((id) => byId.get(id)).filter((g): g is SteamGame => !!g);
  const common = (games ?? []).filter((g) => mineIds.has(g.appid));

  return (
    // cor de destaque da página: o texto em cima dela (selo, botão Mensagem) ganha um tom que leia bem sobre ela
    <main
      className="panel relative flex min-w-0 flex-1 overflow-hidden"
      style={page.accent ? ({ '--color-accent': page.accent, '--color-on-accent': readableOn(page.accent) } as CSSProperties) : undefined}
    >
      <div className="relative min-w-0 flex-1 overflow-y-auto">
        <Hero
          user={u}
          page={page}
          own={own}
          serverId={view.serverId}
          favorite={page.favoriteAsBg ? featured[0] : undefined}
          showNow={show('playing')}
          onEdit={() => setEditing(true)}
          onClose={closeProfile}
        />

        <div className="mx-auto flex max-w-5xl flex-col gap-14 px-6 pb-20 md:px-10">
          <Stats user={u} games={show('steam') ? games : null} common={!own && mineIds.size ? common.length : null} patches={show('patches')} />

          {show('steam') &&
            (!data.steamLinked ? (
              own && <SteamConnect />
            ) : steam.error ? (
              <p className="text-sm text-fg-muted">{steam.error}</p>
            ) : !steam.data ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !games ? (
              <p className="text-sm text-fg-muted">
                {own
                  ? 'Sua lista de jogos está privada na Steam. Para aparecer aqui: Steam → Perfil → Editar perfil → Privacidade → "Detalhes de jogos" como Público.'
                  : 'A lista de jogos desta pessoa está privada na Steam.'}
              </p>
            ) : (
              <>
                {featured.length > 0 ? (
                  <Featured games={featured} mineIds={mineIds} own={own} onPick={() => setPicking(true)} name={u.displayName} />
                ) : (
                  own && (
                    <button
                      onClick={() => setPicking(true)}
                      className="flex items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line-strong py-10 font-display font-bold text-fg-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      <Star size={18} /> Escolha os jogos que aparecem em destaque no seu perfil
                    </button>
                  )
                )}
                <div className="flex flex-wrap gap-14">
                  <MostPlayed games={games} profileUrl={steam.data.profile?.url} own={own} />
                  {show('servers') && !own && <Common servers={data.mutualServers} common={common} />}
                </div>
              </>
            ))}

          {show('servers') && !own && (!data.steamLinked || !games) && data.mutualServers.length > 0 && <Common servers={data.mutualServers} common={[]} />}
        </div>
      </div>

      {editing && <Editor page={page} canPick={!!games} onChange={setPage} onPick={() => setPicking(true)} onClose={() => setEditing(false)} />}
      {picking && games && <FeaturedPicker games={games} current={page.featured} onSaved={setPage} onClose={() => setPicking(false)} />}
    </main>
  );
}

// ------------------------------------------------------------------ capa

function Hero({
  user,
  page,
  own,
  serverId,
  favorite,
  showNow,
  onEdit,
  onClose,
}: {
  user: User & { createdAt: number };
  page: PageStyle;
  own: boolean;
  serverId: string | null;
  favorite?: SteamGame;
  showNow: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const openDm = useApp((s) => s.openDm);
  const presence = useApp((s) => s.online[user.id]);
  const [heroBroken, setHeroBroken] = useState(false);
  const activity: Activity | undefined = presence?.activities?.[0];
  // capa: o fundo próprio; senão a arte do jogo favorito; senão a capa do perfil; senão a cor da pessoa
  const cover = page.bgUrl ?? (favorite && !heroBroken ? steamArt(favorite.appid, 'hero') : null) ?? user.bannerUrl ?? null;
  const tint = user.bannerColor ?? user.avatarColor;

  return (
    <header className="relative h-[460px] overflow-hidden md:h-[520px]">
      {cover ? (
        <img src={cover} alt="" onError={() => setHeroBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 70% 15%, ${tint}88, transparent 65%)` }} />
      )}
      <div className="absolute inset-0 bg-black" style={{ opacity: cover ? page.dim / 100 : 0 }} />
      {/* a capa se dissolve na cor da página: nada de caixa por cima dela */}
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-b from-transparent to-surface-2" />

      <div className="absolute top-5 right-5 flex gap-2">
        {own && (
          <Button variant="secondary" className="h-9 bg-black/45 text-white backdrop-blur hover:bg-black/60" onClick={onEdit}>
            <Paintbrush size={15} /> Personalizar
          </Button>
        )}
        <IconButton label="Fechar o perfil" className="h-9 w-9 bg-black/45 text-white backdrop-blur hover:bg-black/60" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="absolute inset-x-0 bottom-8 mx-auto flex max-w-5xl flex-wrap items-end gap-x-7 gap-y-4 px-6 md:px-10">
        <div className="shrink-0 rounded-full ring-[6px] ring-surface-2">
          <Avatar name={user.displayName} color={user.avatarColor} src={user.avatarUrl} frame={user.frame} size={136} />
        </div>
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5 pb-1">
          {showNow && activity && (
            <span className="inline-flex w-fit max-w-full items-center gap-2 rounded-full bg-ok/15 py-1 pr-3 pl-2.5 text-[13px] font-bold text-ok">
              <span className="h-2 w-2 shrink-0 rounded-full bg-ok shadow-[0_0_0_4px] shadow-ok/25" />
              {activity.type === 'playing' ? <Gamepad2 size={14} /> : <Headphones size={14} />}
              <span className="truncate">
                {activity.type === 'playing' ? 'Jogando' : 'Ouvindo'} {activity.name}
                {activity.since ? ` · ${hours(Math.max(1, Math.round((Date.now() - activity.since) / 60_000)))}` : ''}
              </span>
            </span>
          )}
          <h1 className="flex flex-wrap items-center gap-3 font-display text-5xl leading-none font-extrabold tracking-tight md:text-6xl">
            <span className="truncate">{user.displayName}</span>
            {user.verified && <VerifiedBadge size={28} />}
            {user.mecenas && <span className="rounded-full bg-warn/15 px-3 text-xs leading-7 font-extrabold tracking-widest text-warn">MECENAS</span>}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-fg-muted">
            <span>@{user.username}</span>
            {user.bio && (
              <>
                <span className="h-1 w-1 rounded-full bg-fg-subtle" />
                <span className="line-clamp-2 max-w-xl whitespace-pre-wrap">{user.bio}</span>
              </>
            )}
          </div>
        </div>
        {!own && (
          <div className="flex gap-2 pb-2">
            <Button className="h-11 px-6" onClick={() => void openDm(user.id)}>
              Mensagem
            </Button>
            {serverId && presence && (
              <IconButton
                label="Chamar atenção"
                className="h-11 w-11 bg-surface-3 hover:bg-surface-4"
                onClick={() => void sendNudge(serverId, user.id, user.displayName)}
              >
                <Zap size={18} />
              </IconButton>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ números

function Stats({ user, games, common, patches }: { user: User & { createdAt: number }; games: SteamGame[] | null; common: number | null; patches: boolean }) {
  const totalMin = games?.reduce((n, g) => n + g.playtimeMin, 0) ?? 0;
  const list: Patch[] = patches ? (user.patches ?? []) : [];
  const stat = (value: string, label: string, accent = false) => (
    <div className="flex flex-col gap-0.5">
      <b className={cx('font-display text-3xl font-bold tabular-nums', accent && 'text-accent')}>{value}</b>
      <span className="text-[13px] text-fg-subtle">{label}</span>
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-12 gap-y-6 border-b border-line pt-2 pb-7">
      {games && stat(hours(totalMin), 'jogadas na Steam')}
      {games && stat(games.length.toLocaleString('pt-BR'), 'jogos')}
      {common !== null && stat(String(common), 'em comum com você', true)}
      {stat(new Date(user.createdAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', ''), 'no Concord desde')}
      {patches && (list.length > 0 || user.supporter) && (
        <div className="ml-auto flex items-center gap-2.5">
          {user.supporter && <SupporterPatch tier={user.supporter.tier} size={44} />}
          {list.map((p, i) => (
            <PatchBadge key={p.id} patch={p} size={40} tilt={PATCH_TILTS[i % PATCH_TILTS.length]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ jogos

function Cover({ game, big }: { game: SteamGame; big?: boolean }) {
  // capa em pé; se o jogo não tiver, a larga; se nem essa, o nome
  const [step, setStep] = useState<'portrait' | 'header' | 'none'>('portrait');
  return (
    <div className="absolute inset-0 bg-surface-3">
      {step !== 'none' ? (
        <img
          src={steamArt(game.appid, step)}
          alt=""
          loading="lazy"
          onError={() => setStep(step === 'portrait' ? 'header' : 'none')}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={cx('flex h-full items-center justify-center p-3 text-center font-display font-bold text-fg-muted', big ? 'text-2xl' : 'text-sm')}>{game.name}</div>
      )}
    </div>
  );
}

function Featured({ games, mineIds, own, onPick, name }: { games: SteamGame[]; mineIds: Set<number>; own: boolean; onPick: () => void; name: string }) {
  const [first, ...rest] = games;
  const tile = (g: SteamGame, big: boolean) => (
    <a
      key={g.appid}
      href={`https://store.steampowered.com/app/${g.appid}`}
      target="_blank"
      rel="noreferrer noopener"
      className={cx('group relative block aspect-[2/3] overflow-hidden transition-transform hover:-translate-y-1', big ? 'rounded-[22px]' : 'rounded-2xl')}
    >
      <Cover game={g} big={big} />
      {big && <span className="absolute top-3.5 left-3.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold tracking-widest text-white uppercase">Favorito</span>}
      {!own && mineIds.has(g.appid) && (
        <span className="absolute top-2.5 right-2.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-on-accent">VOCÊ TEM</span>
      )}
      <span className={cx('absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-black/90 to-transparent text-white', big ? 'px-4 pt-16 pb-4' : 'px-3 pt-12 pb-3')}>
        <b className={cx('font-display leading-tight', big ? 'text-2xl' : 'text-[15px]')}>{g.name}</b>
        <span className={cx('text-white/75', big ? 'text-[13px]' : 'text-xs')}>
          {hours(g.playtimeMin)}
          {big && g.playtime2wMin > 0 && ` · ${hours(g.playtime2wMin)} nas últimas 2 semanas`}
        </span>
      </span>
    </a>
  );
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[28px] font-bold">Em destaque</h2>
        {own ? (
          <button onClick={onPick} className="text-sm font-bold text-accent hover:underline">
            Escolher jogos
          </button>
        ) : (
          <span className="text-[13px] text-fg-subtle">escolhidos por {name}</span>
        )}
      </div>
      <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-[1.55fr_repeat(4,minmax(0,1fr))]">
        {tile(first, true)}
        {rest.map((g) => tile(g, false))}
      </div>
    </section>
  );
}

function MostPlayed({ games, profileUrl, own }: { games: SteamGame[]; profileUrl?: string; own: boolean }) {
  const [all, setAll] = useState(false);
  const top = games.slice(0, all ? 40 : 5);
  const max = Math.max(1, games[0]?.playtimeMin ?? 1);
  return (
    <section className="flex min-w-0 flex-[3_1_440px] flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[22px] font-bold">Mais jogados</h2>
        <div className="flex gap-4 text-sm font-bold">
          {games.length > 5 && (
            <button onClick={() => setAll(!all)} className="text-accent hover:underline">
              {all ? 'Mostrar menos' : `Biblioteca completa (${games.length})`}
            </button>
          )}
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noreferrer noopener" className="text-fg-subtle hover:text-fg">
              Steam
            </a>
          )}
        </div>
      </div>
      <ol className="flex flex-col gap-3.5">
        {top.map((g) => (
          <li key={g.appid}>
            <a href={`https://store.steampowered.com/app/${g.appid}`} target="_blank" rel="noreferrer noopener" className="grid grid-cols-[72px_minmax(0,1fr)_72px] items-center gap-4">
              <img src={steamArt(g.appid, 'header')} alt="" loading="lazy" className="aspect-[460/215] w-full rounded-md bg-surface-3 object-cover" />
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate text-[15px] font-bold">{g.name}</span>
                <span className="h-1 rounded-full bg-white/8">
                  <span className="block h-1 rounded-full bg-accent" style={{ width: `${Math.max(2, (g.playtimeMin / max) * 100)}%` }} />
                </span>
              </span>
              <span className="text-right font-display font-semibold text-fg-muted tabular-nums">{hours(g.playtimeMin)}</span>
            </a>
          </li>
        ))}
      </ol>
      {own && <SteamDisconnect />}
    </section>
  );
}

function Common({ servers, common }: { servers: ServerSummary[]; common: SteamGame[] }) {
  const openServer = useApp((s) => s.openServer);
  if (!servers.length && !common.length) return null;
  return (
    <section className="flex min-w-0 flex-[2_1_280px] flex-col gap-4">
      <h2 className="font-display text-[22px] font-bold">Em comum</h2>
      <div className="flex flex-col gap-2.5">
        {servers.map((s) => (
          <button key={s.id} onClick={() => openServer(s.id)} className="flex items-center gap-3 text-left font-semibold hover:text-accent">
            {s.iconUrl ? (
              <img src={s.iconUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-4 font-display text-xs font-bold">{initials(s.name)}</span>
            )}
            {s.name}
          </button>
        ))}
      </div>
      {common.length > 0 && (
        <p className="text-sm leading-relaxed text-fg-subtle">
          {common.length} {common.length === 1 ? 'jogo que vocês dois têm' : 'jogos que vocês dois têm'} na Steam, como {common.slice(0, 2).map((g) => g.name).join(' e ')}.
        </p>
      )}
    </section>
  );
}

function SteamConnect() {
  const me = useApp((s) => s.me)!;
  if (!me.integrations?.steam) return null;
  async function connect() {
    try {
      const { url } = await api.post<{ url: string }>('/me/steam/link');
      // no app desktop abre no navegador; na web, em outra aba. A biblioteca aparece aqui sozinha quando terminar.
      window.open(url, '_blank', 'noopener');
      toast.info('Entre na Steam na janela que abriu. Quando terminar, sua biblioteca aparece aqui.');
    } catch (err) {
      toast.error(err);
    }
  }
  return (
    <section className="flex flex-wrap items-center gap-5 rounded-3xl border-2 border-dashed border-line-strong p-6">
      <Gamepad2 size={28} className="text-accent" />
      <p className="min-w-0 flex-1 text-[15px] text-fg-muted">Conecte sua Steam para escolher os jogos em destaque, mostrar suas horas e ver os jogos em comum com quem visita seu perfil.</p>
      <Button onClick={() => void connect()}>Conectar a Steam</Button>
    </section>
  );
}

function SteamDisconnect() {
  return (
    <button onClick={() => void api.del('/me/steam').catch(toast.error)} className="w-fit text-xs font-semibold text-fg-subtle hover:text-danger">
      Desconectar a Steam
    </button>
  );
}

// ------------------------------------------------------------------ escolher os jogos em destaque

type Sort = 'played' | 'az' | 'recent';

function FeaturedPicker({ games, current, onSaved, onClose }: { games: SteamGame[]; current: number[]; onSaved: (p: PageStyle) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<number[]>(current.filter((id) => games.some((g) => g.appid === id)));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('played');
  const [saving, setSaving] = useState(false);
  const byId = new Map(games.map((g) => [g.appid, g]));

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? games.filter((g) => g.name.toLowerCase().includes(q)) : games;
    const sorted = [...filtered];
    if (sort === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    else if (sort === 'recent') sorted.sort((a, b) => b.playtime2wMin - a.playtime2wMin || b.playtimeMin - a.playtimeMin);
    return sorted.slice(0, 80);
  }, [games, query, sort]);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_FEATURED ? p : [...p, id]));
  const move = (id: number, dir: -1 | 1) =>
    setPicked((p) => {
      const i = p.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    setSaving(true);
    try {
      onSaved(await api.put<PageStyle>('/me/profile-page', { featured: picked }));
      onClose();
    } catch (err) {
      toast.error(err);
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Jogos em destaque"
        className="flex max-h-[90vh] w-full max-w-3xl animate-pop-in flex-col overflow-hidden rounded-[28px] bg-surface-2 shadow-2xl ring-1 ring-line"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-1 px-7 pt-6">
          <h2 className="font-display text-2xl font-bold">Jogos em destaque</h2>
          <p className="text-sm text-fg-muted">Escolha até {MAX_FEATURED}. O primeiro é o favorito e aparece maior.</p>
        </div>

        <div className="grid grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] items-end gap-2.5 px-7 py-5">
          {Array.from({ length: MAX_FEATURED }, (_, i) => {
            const g = byId.get(picked[i]);
            if (!g) return <div key={`vazio-${i}`} className="aspect-[2/3] rounded-2xl border-2 border-dashed border-line-strong" />;
            return (
              <div key={g.appid} className="relative aspect-[2/3] overflow-hidden rounded-2xl">
                <Cover game={g} big={i === 0} />
                <span className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 font-display text-xs font-extrabold text-white">{i + 1}</span>
                <button
                  aria-label={`Tirar ${g.name}`}
                  onClick={() => toggle(g.appid)}
                  className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-danger"
                >
                  <X size={13} />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-linear-to-t from-black/85 to-transparent p-1.5 pt-6">
                  <IconButton label="Mover para a esquerda" className="h-7 w-7 bg-black/50 text-white" disabled={i === 0} onClick={() => move(g.appid, -1)}>
                    <ChevronLeft size={14} />
                  </IconButton>
                  <IconButton label="Mover para a direita" className="h-7 w-7 bg-black/50 text-white" disabled={i === picked.length - 1} onClick={() => move(g.appid, 1)}>
                    <ChevronRight size={14} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-7 pt-4">
          <label className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar na sua biblioteca da Steam"
              aria-label="Buscar na sua biblioteca da Steam"
              className="h-10 w-full rounded-full bg-surface-3 pr-4 pl-9 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60"
            />
          </label>
          <div className="flex gap-1 rounded-full bg-surface-0 p-1 text-[13px] font-bold">
            {(
              [
                ['played', 'Mais jogados'],
                ['az', 'A–Z'],
                ['recent', 'Recentes'],
              ] as const
            ).map(([id, text]) => (
              <button key={id} onClick={() => setSort(id)} className={cx('rounded-full px-3 py-1.5', sort === id ? 'bg-accent text-on-accent' : 'text-fg-muted hover:text-fg')}>
                {text}
              </button>
            ))}
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {list.map((g) => {
            const on = picked.includes(g.appid);
            const full = !on && picked.length >= MAX_FEATURED;
            return (
              <li key={g.appid}>
                <button
                  onClick={() => toggle(g.appid)}
                  disabled={full}
                  aria-pressed={on}
                  className={cx(
                    'grid w-full grid-cols-[22px_92px_minmax(0,1fr)_64px] items-center gap-3.5 rounded-2xl px-3 py-2 text-left transition-colors disabled:opacity-40',
                    on ? 'bg-accent/10' : 'hover:bg-surface-3',
                  )}
                >
                  <span className={cx('flex h-5 w-5 items-center justify-center rounded-md border-2', on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong')}>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  <img src={steamArt(g.appid, 'header')} alt="" loading="lazy" className="aspect-[460/215] w-full rounded-lg bg-surface-3 object-cover" />
                  <span className="truncate text-[15px] font-bold">{g.name}</span>
                  <span className="text-right font-display font-semibold text-fg-subtle tabular-nums">{hours(g.playtimeMin)}</span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="py-8 text-center text-sm text-fg-subtle">Nenhum jogo com esse nome.</li>}
        </ul>

        <div className="flex items-center gap-3 border-t border-line px-7 py-4">
          <span className="text-[13px] text-fg-subtle">
            {picked.length} de {MAX_FEATURED} escolhidos
          </span>
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ personalizar

function Editor({
  page,
  canPick,
  onChange,
  onPick,
  onClose,
}: {
  page: PageStyle;
  canPick: boolean;
  onChange: (p: PageStyle) => void;
  onPick: () => void;
  onClose: () => void;
}) {
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

  const heading = 'text-xs font-bold tracking-wider text-fg-subtle uppercase';
  return (
    <aside aria-label="Personalizar perfil" className="relative w-80 shrink-0 animate-slide-up space-y-7 overflow-y-auto border-l border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Personalizar</h2>
        <IconButton label="Fechar" className="h-8 w-8" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <section className="space-y-3">
        <h3 className={heading}>Capa</h3>
        <div className="flex gap-2">
          <Button variant="secondary" className="h-9 flex-1" loading={busy} onClick={() => void uploadBg()}>
            <ImagePlus size={15} /> {page.bgUrl ? 'Trocar imagem' : 'Escolher imagem'}
          </Button>
          {page.bgUrl && (
            <IconButton label="Tirar a imagem" danger className="h-9 w-9" onClick={() => void api.del<PageStyle>('/me/profile-bg').then(onChange, toast.error)}>
              <Trash2 size={15} />
            </IconButton>
          )}
        </div>
        <p className="text-xs text-fg-subtle">Imagem ou GIF, até 8 MB. Ela fica no topo e se dissolve na página.</p>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={page.favoriteAsBg} onChange={(e) => void save({ favoriteAsBg: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent)]" />
          Sem imagem, usar a arte do jogo favorito
        </label>
        <label className="block">
          <span className="mb-1 flex justify-between text-xs font-bold text-fg-muted">
            Escurecer a capa <span className="tabular-nums">{page.dim}%</span>
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
      </section>

      <section className="space-y-3">
        <h3 className={heading}>Jogos em destaque</h3>
        <Button variant="secondary" className="h-9 w-full" disabled={!canPick} onClick={onPick}>
          <Star size={15} /> Escolher jogos ({page.featured.length}/{MAX_FEATURED})
        </Button>
        {!canPick && <p className="text-xs text-fg-subtle">Conecte a Steam (com a lista de jogos pública) para escolher.</p>}
      </section>

      <section className="space-y-3">
        <h3 className={heading}>Cor de destaque</h3>
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

      <section className="space-y-2">
        <h3 className={heading}>Mostrar</h3>
        {SECTIONS.map(({ id, label }) => (
          <label key={id} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 text-sm font-semibold">
            <input
              type="checkbox"
              checked={page.showcases.includes(id)}
              onChange={() => void save({ showcases: page.showcases.includes(id) ? page.showcases.filter((s) => s !== id) : [...page.showcases, id] })}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            {label}
          </label>
        ))}
        <p className="pt-1 text-xs text-fg-subtle">Foto, moldura, bio e patches ficam em Configurações → Perfil.</p>
      </section>
    </aside>
  );
}
