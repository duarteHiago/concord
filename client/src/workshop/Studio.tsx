// A Oficina: editor do servidor. Gaveta de pacotes, peças e widgets à esquerda; vitrine e grade no meio
// (arrastar, redimensionar, encaixe automático); ajustes do widget à direita. O rascunho salva sozinho;
// publicar mostra para os membros.
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  Megaphone,
  Package,
  Play,
  Plus,
  Puzzle,
  Redo2,
  Rocket,
  Sparkles,
  Trash2,
  Undo2,
  Volume2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  GRID_COLS,
  GRID_MAX_ROWS,
  MAX_WIDGETS,
  PIECE_INFO,
  TIMEZONES,
  WIDGET_INFO,
  WIDGET_TYPES,
  WORKSHOP_PIECES,
  defaultProps,
  emptyWorkshop,
  installPack,
  overlaps,
  parseWorkshop,
  type WidgetPlacement,
  type WidgetType,
  type WorkshopConfig,
  type WorkshopPackId,
  type WorkshopPiece,
} from '../../../shared/workshop.ts';
import { api } from '../lib/api';
import { useMobile } from '../lib/mobile';
import { pickImage, prepareImage, uploadImage } from '../lib/upload';
import type { ServerDetail } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Button, cx, initials } from '../components/ui';
import { Backdrop, BannerArt, Emblem, RailEffect, packVars } from './Art';
import { GAP_PX, MuralGrid, ROW_PX, WidgetCard } from './Mural';
import { PACKS, PACK_LIST, type Pack, type SoundSlot } from './packs';
import { previewSound, showIntro, useOverlays } from './runtime';
import { useWorkshop } from './store';
import { WidgetBody, type WidgetContext } from './widgets';

interface Loaded {
  published: WorkshopConfig | null;
  publishedAt: number | null;
  draft?: WorkshopConfig | null;
  canPublish?: boolean;
}

type Box = { x: number; y: number; w: number; h: number };

// ------------------------------------------------------------------ grade: encaixe e empurrão

/** Põe `moved` no lugar e empurra para baixo quem ficou embaixo dele. null se estourar a grade. */
function resolve(widgets: WidgetPlacement[], moved: WidgetPlacement): WidgetPlacement[] | null {
  const others = widgets.filter((w) => w.id !== moved.id).sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: WidgetPlacement[] = [moved];
  for (const o of others) {
    const cur = { ...o };
    for (let guard = 0; guard < 100; guard++) {
      const hit = placed.filter((p) => overlaps(p, cur));
      if (!hit.length) break;
      cur.y = Math.max(...hit.map((p) => p.y + p.h));
    }
    if (cur.y + cur.h > GRID_MAX_ROWS) return null;
    placed.push(cur);
  }
  return widgets.map((w) => placed.find((p) => p.id === w.id)!);
}

/** Primeiro lugar livre (de cima para baixo, da esquerda para a direita). */
function freeSpot(widgets: Box[], w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= GRID_MAX_ROWS; y++)
    for (let x = 0; x + w <= GRID_COLS; x++) if (!widgets.some((o) => overlaps(o, { x, y, w, h }))) return { x, y };
  return null;
}

const newId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ------------------------------------------------------------------ editor

export function Studio({ serverId }: { serverId: string }) {
  const close = useWorkshop((s) => s.closeStudio);
  const detail = useApp((s) => s.details[serverId]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [config, setConfigState] = useState<WorkshopConfig>(emptyWorkshop);
  const [past, setPast] = useState<WorkshopConfig[]>([]);
  const [future, setFuture] = useState<WorkshopConfig[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'packs' | 'pieces' | 'widgets'>('packs');
  const [asMember, setAsMember] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [publishing, setPublishing] = useState(false);
  const firstLoad = useRef(true);
  const mobile = useMobile();

  useEffect(() => {
    let alive = true;
    api.get<Loaded>(`/servers/${serverId}/workshop`).then(
      (r) => {
        if (!alive) return;
        setLoaded(r);
        setConfigState(r.draft ?? r.published ?? emptyWorkshop());
      },
      (err) => {
        toast.error(err);
        close();
      },
    );
    return () => {
      alive = false;
    };
  }, [serverId, close]);

  // a prévia faz os efeitos do app (intro, sons, ícone) usarem o rascunho enquanto a Oficina está aberta
  useEffect(() => {
    useWorkshop.getState().setPreview({ serverId, config });
  }, [serverId, config]);
  useEffect(() => () => useWorkshop.getState().setPreview(null), []);

  const check = useMemo(() => parseWorkshop(config), [config]);

  // rascunho: salva sozinho, um pouco depois da última mudança
  useEffect(() => {
    if (!loaded) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (!check.ok) return;
    setSaving('saving');
    const t = setTimeout(() => {
      api.put(`/servers/${serverId}/workshop/draft`, config).then(
        () => setSaving('saved'),
        (err) => {
          setSaving('error');
          toast.error(err);
        },
      );
    }, 700);
    return () => clearTimeout(t);
  }, [config, check.ok, loaded, serverId]);

  const update = useCallback((fn: (c: WorkshopConfig) => WorkshopConfig) => {
    setConfigState((cur) => {
      const next = fn(cur);
      if (next === cur) return cur;
      setPast((p) => [...p.slice(-49), cur]);
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setConfigState((cur) => {
        setFuture((f) => [cur, ...f]);
        return prev;
      });
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setConfigState((cur) => {
        setPast((p) => [...p, cur]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  const setWidgets = useCallback((fn: (ws: WidgetPlacement[]) => WidgetPlacement[]) => update((c) => ({ ...c, mural: { ...c.mural, widgets: fn(c.mural.widgets) } })), [update]);

  const addWidget = useCallback(
    (type: WidgetType, at?: { x: number; y: number }) => {
      if (config.mural.widgets.length >= MAX_WIDGETS) return toast.error(`O Mural aceita até ${MAX_WIDGETS} widgets.`);
      const [w, h] = WIDGET_INFO[type].size;
      const spot = at ?? freeSpot(config.mural.widgets, w, h);
      if (!spot) return toast.error('Não tem mais espaço na grade.');
      const item = { id: newId(), type, x: Math.min(spot.x, GRID_COLS - w), y: spot.y, w, h, props: defaultProps(type) } as WidgetPlacement;
      const next = resolve([...config.mural.widgets, item], item);
      if (!next) return toast.error('Não coube aí.');
      setWidgets(() => next);
      setSelected(item.id);
    },
    [config.mural.widgets, setWidgets],
  );

  // atalhos: desfazer, refazer, apagar, mover com as setas
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.closest('input, textarea, select') || e.target.isContentEditable);
      if (e.key === 'Escape') {
        if (asMember) setAsMember(false);
        else if (selected) setSelected(null);
        else close();
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (!selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setWidgets((ws) => ws.filter((w) => w.id !== selected));
        setSelected(null);
        return;
      }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      setWidgets((ws) => {
        const w = ws.find((x) => x.id === selected);
        if (!w) return ws;
        const moved = { ...w, x: Math.max(0, Math.min(GRID_COLS - w.w, w.x + d[0])), y: Math.max(0, w.y + d[1]) };
        return resolve(ws, moved) ?? ws;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, asMember, close, undo, redo, setWidgets]);

  const publish = async () => {
    if (!check.ok) return toast.error(check.error);
    setPublishing(true);
    try {
      const r = await api.post<{ published: WorkshopConfig }>(`/servers/${serverId}/workshop/publish`, config);
      useWorkshop.getState().setConfig(serverId, r.published);
      setLoaded((l) => (l ? { ...l, published: r.published, publishedAt: Date.now() } : l));
      setSaving('saved');
      toast.success('Publicado! A galera do servidor já vê a Oficina nova.');
    } catch (err) {
      toast.error(err);
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    try {
      await api.del(`/servers/${serverId}/workshop/published`);
      useWorkshop.getState().setConfig(serverId, null);
      setLoaded((l) => (l ? { ...l, published: null, publishedAt: null } : l));
      toast.info('Tirado do ar. O rascunho continua guardado.');
    } catch (err) {
      toast.error(err);
    }
  };

  if (!detail) return null;
  if (mobile)
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-surface-1 p-8 text-center">
        <Puzzle size={36} className="text-accent" />
        <div className="font-display text-xl font-extrabold">A Oficina é feita para tela grande</div>
        <p className="text-sm text-fg-muted">Abra no computador para montar o Mural e escolher os pacotes. O que você publicar aparece aqui no celular também.</p>
        <Button onClick={close}>Voltar</Button>
      </div>
    );
  const sel = config.mural.widgets.find((w) => w.id === selected) ?? null;
  const backdrop = config.pieces.backdrop ? PACKS[config.pieces.backdrop] : null;
  const changedSincePublish = !loaded?.published || JSON.stringify(loaded.published) !== JSON.stringify(config);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-surface-1 text-fg" role="dialog" aria-label="Oficina do servidor">
      {/* barra de cima */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <button type="button" onClick={close} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-fg-muted hover:bg-surface-3 hover:text-fg">
          <ArrowLeft size={16} />
          Voltar
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-display text-lg leading-tight font-extrabold">
            <Puzzle size={18} className="text-accent" />
            Oficina
            <span className="truncate text-fg-muted">· {detail.server.name}</span>
          </div>
        </div>
        <span className="ml-2 rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-black tracking-wider text-fg uppercase">só no teste</span>
        <div className="ml-auto flex items-center gap-1.5">
          <SaveStatus saving={saving} error={check.ok ? null : check.error} />
          <ToolButton label="Desfazer (Ctrl+Z)" onClick={undo} disabled={!past.length}>
            <Undo2 size={17} />
          </ToolButton>
          <ToolButton label="Refazer (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length}>
            <Redo2 size={17} />
          </ToolButton>
          <Button variant="secondary" className="h-9 px-4" onClick={() => setAsMember(!asMember)}>
            {asMember ? <EyeOff size={16} /> : <Eye size={16} />}
            {asMember ? 'Voltar a editar' : 'Ver como membro'}
          </Button>
          {loaded?.published && (
            <Button variant="ghost" className="h-9 px-4" onClick={() => void unpublish()}>
              Tirar do ar
            </Button>
          )}
          <Button className="h-9 px-4" onClick={() => void publish()} loading={publishing} disabled={!check.ok || !loaded?.canPublish || !changedSincePublish}>
            <Rocket size={16} />
            {loaded?.published && !changedSincePublish ? 'Publicado' : 'Publicar'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {!asMember && (
          <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface-2">
            <div className="flex gap-1 p-2">
              {(
                [
                  ['packs', 'Pacotes', <Package size={15} key="p" />],
                  ['pieces', 'Peças', <Sparkles size={15} key="s" />],
                  ['widgets', 'Widgets', <LayoutGrid size={15} key="w" />],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-bold', tab === id ? 'bg-accent text-on-accent' : 'text-fg-muted hover:bg-surface-3 hover:text-fg')}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              {tab === 'packs' && <PacksDrawer config={config} onInstall={(id) => update((c) => installPack(c, id))} serverName={detail.server.name} serverId={serverId} />}
              {tab === 'pieces' && (
                <PiecesDrawer config={config} onChange={(piece, pack) => update((c) => ({ ...c, pieces: { ...c.pieces, [piece]: pack ?? undefined } }))} serverId={serverId} serverName={detail.server.name} />
              )}
              {tab === 'widgets' && <WidgetsDrawer count={config.mural.widgets.length} onAdd={(t) => addWidget(t)} />}
            </div>
          </aside>
        )}

        <section className="relative min-w-0 flex-1 overflow-y-auto" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="mx-auto max-w-5xl p-6">
            <Showcase config={config} detail={detail} />
            <div className="mt-6 mb-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-extrabold tracking-wider text-fg-subtle uppercase">Mural</div>
                {asMember ? (
                  <div className="font-display text-xl font-extrabold">{config.mural.title}</div>
                ) : (
                  <input
                    value={config.mural.title}
                    maxLength={40}
                    onChange={(e) => update((c) => ({ ...c, mural: { ...c.mural, title: e.target.value } }))}
                    className="-ml-1 rounded-lg bg-transparent px-1 font-display text-xl font-extrabold outline-none hover:bg-surface-3 focus:bg-surface-3"
                    aria-label="Título do Mural"
                  />
                )}
              </div>
              {!asMember && (
                <div className="text-xs text-fg-muted">
                  {config.mural.widgets.length}/{MAX_WIDGETS} widgets · arraste pela alça, puxe o canto para redimensionar
                </div>
              )}
            </div>
            <div className={cx('relative overflow-hidden rounded-3xl', backdrop ? 'ws-vars p-4' : asMember ? '' : 'p-0')} style={backdrop ? packVars(backdrop) : undefined}>
              {backdrop && <Backdrop pack={backdrop} />}
              <div className="relative">
                {asMember ? (
                  config.mural.widgets.length ? (
                    <MuralGrid config={config} ctx={{ serverId, pack: backdrop }} />
                  ) : (
                    <div className="py-16 text-center text-sm text-fg-muted">Mural vazio.</div>
                  )
                ) : (
                  <GridEditor
                    widgets={config.mural.widgets}
                    ctx={{ serverId, pack: backdrop, editing: true }}
                    selected={selected}
                    onSelect={setSelected}
                    onChange={(ws) => setWidgets(() => ws)}
                    onDropNew={(type, at) => addWidget(type, at)}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {!asMember && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface-2 p-4">
            {sel ? (
              <Inspector
                key={sel.id}
                w={sel}
                detail={detail}
                serverId={serverId}
                onChange={(props) => setWidgets((ws) => ws.map((w) => (w.id === sel.id ? ({ ...w, props } as WidgetPlacement) : w)))}
                onDelete={() => {
                  setWidgets((ws) => ws.filter((w) => w.id !== sel.id));
                  setSelected(null);
                }}
                onDuplicate={() => {
                  const spot = freeSpot(config.mural.widgets, sel.w, sel.h);
                  if (!spot || config.mural.widgets.length >= MAX_WIDGETS) return toast.error('Não tem espaço para duplicar.');
                  const copy = { ...structuredClone(sel), id: newId(), ...spot } as WidgetPlacement;
                  setWidgets((ws) => [...ws, copy]);
                  setSelected(copy.id);
                }}
              />
            ) : (
              <Help />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="rounded-full p-2 text-fg-muted hover:bg-surface-3 hover:text-fg disabled:opacity-30">
      {children}
    </button>
  );
}

function SaveStatus({ saving, error }: { saving: 'idle' | 'saving' | 'saved' | 'error'; error: string | null }) {
  if (error)
    return (
      <span className="max-w-72 truncate rounded-full bg-danger/15 px-3 py-1 text-xs font-semibold text-danger" title={error}>
        {friendlyError(error)}
      </span>
    );
  const text = { idle: 'Rascunho', saving: 'Salvando…', saved: 'Rascunho salvo', error: 'Não salvou' }[saving];
  return <span className="px-2 text-xs font-semibold text-fg-muted">{text}</span>;
}

function friendlyError(error: string) {
  if (/muito curto/.test(error)) return 'Falta preencher um campo';
  if (/link/.test(error)) return 'Tem um link inválido (use https://)';
  return error;
}

function Help() {
  return (
    <div className="space-y-4 text-sm text-fg-muted">
      <div>
        <div className="mb-1 font-display text-base font-extrabold text-fg">Como funciona</div>
        <p>Monte à vontade: o rascunho salva sozinho e ninguém vê até você publicar.</p>
      </div>
      <ul className="space-y-2">
        <li>
          <b className="text-fg">Pacotes</b>: instale um tema inteiro com um clique.
        </li>
        <li>
          <b className="text-fg">Peças</b>: misture, por exemplo o som de um pacote e a intro de outro.
        </li>
        <li>
          <b className="text-fg">Widgets</b>: arraste para a grade ou clique para adicionar. Clique num widget para ajustar.
        </li>
      </ul>
      <div className="rounded-2xl bg-surface-3 p-3 text-xs">
        <b className="text-fg">Atalhos:</b> setas movem o widget escolhido, Delete apaga, Ctrl+Z desfaz, Esc fecha.
      </div>
      <p className="text-xs">Cada membro pode desligar os efeitos e sons dos servidores em Configurações › Aparência.</p>
    </div>
  );
}

// ------------------------------------------------------------------ vitrine: como fica o ícone, a faixa e os avisos

function Showcase({ config, detail }: { config: WorkshopConfig; detail: ServerDetail }) {
  const p = (piece: WorkshopPiece): Pack | null => (config.pieces[piece] ? PACKS[config.pieces[piece]!] : null);
  const icon = p('icon');
  const banner = p('banner');
  const s = detail.server;
  const test = (label: string, icon: ReactNode, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1.5 text-xs font-bold hover:bg-surface-4 disabled:opacity-35"
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="rounded-3xl bg-surface-2 p-4 ring-1 ring-line">
      <div className="mb-3 text-[11px] font-extrabold tracking-wider text-fg-subtle uppercase">Vitrine</div>
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative h-12 w-12">
            {icon && <RailEffect pack={icon} />}
            <div className="relative z-0 flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] bg-surface-3 font-display font-bold text-fg-muted">
              {s.iconUrl ? <img src={s.iconUrl} alt="" className="h-full w-full object-cover" /> : initials(s.name)}
            </div>
          </div>
          <span className="text-[10px] font-semibold text-fg-subtle">ícone</span>
        </div>
        <div className="relative h-[86px] w-72 overflow-hidden rounded-3xl bg-surface-3">
          {banner && <BannerArt pack={banner} />}
          <div className="relative px-5 pt-4" style={banner ? { color: banner.colors.ink } : undefined}>
            <div className="truncate font-display text-[22px] leading-tight font-bold">{s.name}</div>
            <div className={cx('text-[13px]', banner ? 'opacity-75' : 'text-fg-muted')}>{detail.online.length} pessoas online</div>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {test('Intro', <Play size={13} />, () => p('intro') && showIntro(s.id, p('intro')!, s.name), !p('intro'))}
          {test('Som ao entrar', <Volume2 size={13} />, () => p('enter') && previewSound(p('enter')!, 'enter'), !p('enter'))}
          {test('Passar o mouse', <Volume2 size={13} />, () => p('hover') && previewSound(p('hover')!, 'hover'), !p('hover'))}
          {test(
            'Anunciador',
            <Megaphone size={13} />,
            () => {
              const a = p('announcer');
              if (!a) return;
              useOverlays.setState({ announce: { pack: a, text: a.announcer[5], key: Date.now() } });
              previewSound(a, 'announce');
            },
            !p('announcer'),
          )}
          {test(
            'Menção',
            <Bell size={13} />,
            () => {
              const n = p('notify');
              if (!n) return;
              previewSound(n, 'notify');
              const me = useApp.getState().me!;
              const card = {
                id: Date.now(),
                pack: n,
                serverId: s.id,
                channelId: detail.channels.find((c) => c.type === 'text')?.id ?? '',
                author: me.displayName,
                avatarUrl: me.avatarUrl,
                avatarColor: me.avatarColor,
                where: '#geral',
                text: `@${me.username} bora? Falta um pra fechar o time!`,
              };
              useOverlays.setState((o) => ({ mentions: [...o.mentions, card] }));
              setTimeout(() => useOverlays.setState((o) => ({ mentions: o.mentions.filter((c) => c.id !== card.id) })), 5000);
            },
            !p('notify'),
          )}
          {test('Entrar na sala', <Volume2 size={13} />, () => p('voice') && previewSound(p('voice')!, 'voiceJoin'), !p('voice'))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ gaveta: pacotes

function PacksDrawer({ config, onInstall, serverName, serverId }: { config: WorkshopConfig; onInstall: (id: WorkshopPackId) => void; serverName: string; serverId: string }) {
  const counts = (id: WorkshopPackId) => WORKSHOP_PIECES.filter((p) => config.pieces[p] === id).length;
  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-fg-muted">Um pacote traz ícone animado, sons, intro, notificação, anunciador, faixa e fundo do Mural. Tudo original do Concord.</p>
      {PACK_LIST.map((pack) => {
        const n = counts(pack.id);
        return (
          <div key={pack.id} className="overflow-hidden rounded-3xl ring-1 ring-line">
            <div className="ws-vars relative flex h-24 items-center gap-3 px-4" style={{ ...packVars(pack), background: `linear-gradient(135deg, ${pack.colors.bg}, ${pack.colors.bg2})`, color: pack.colors.ink }}>
              <Emblem pack={pack} size={64} />
              <div className="min-w-0">
                <div className="truncate font-display text-base leading-tight font-extrabold" style={{ fontFamily: pack.font }}>
                  {pack.name}
                </div>
                <div className="truncate text-xs opacity-75">{pack.genre}</div>
                <div className="mt-1.5 flex gap-1">
                  {[pack.colors.a, pack.colors.b, pack.colors.bg2].map((c) => (
                    <span key={c} className="h-3 w-3 rounded-full ring-1 ring-white/30" style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-surface-1 p-3">
              <p className="mb-2.5 text-xs text-fg-muted">{pack.tagline}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onInstall(pack.id)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:bg-accent-hover">
                  <Plus size={13} />
                  {n === WORKSHOP_PIECES.length ? 'Instalado' : n ? `Instalar tudo (${n}/${WORKSHOP_PIECES.length})` : 'Instalar tudo'}
                </button>
                <button type="button" onClick={() => previewSound(pack, 'enter')} className="flex items-center gap-1 rounded-full bg-surface-3 px-3 py-1.5 text-xs font-bold hover:bg-surface-4">
                  <Volume2 size={13} />
                  Ouvir
                </button>
                <button type="button" onClick={() => showIntro(serverId, pack, serverName)} className="flex items-center gap-1 rounded-full bg-surface-3 px-3 py-1.5 text-xs font-bold hover:bg-surface-4">
                  <Play size={13} />
                  Intro
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ gaveta: peças (misturar pacotes)

const PIECE_SOUND: Partial<Record<WorkshopPiece, SoundSlot>> = { hover: 'hover', enter: 'enter', notify: 'notify', voice: 'voiceJoin', announcer: 'announce' };

function PiecesDrawer({ config, onChange, serverId, serverName }: { config: WorkshopConfig; onChange: (p: WorkshopPiece, pack: WorkshopPackId | null) => void; serverId: string; serverName: string }) {
  return (
    <div className="space-y-2.5">
      <p className="px-1 text-xs text-fg-muted">Escolha de qual pacote vem cada peça, ou desligue.</p>
      {WORKSHOP_PIECES.map((piece) => {
        const current = config.pieces[piece] ?? null;
        const slot = PIECE_SOUND[piece];
        return (
          <div key={piece} className="rounded-2xl bg-surface-1 p-3 ring-1 ring-line">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">{PIECE_INFO[piece].label}</div>
                <div className="text-xs text-fg-muted">{PIECE_INFO[piece].hint}</div>
              </div>
              {current && (slot || piece === 'intro') && (
                <button
                  type="button"
                  aria-label="Testar"
                  title="Testar"
                  onClick={() => (piece === 'intro' ? showIntro(serverId, PACKS[current], serverName) : previewSound(PACKS[current], slot!))}
                  className="rounded-full bg-surface-3 p-1.5 hover:bg-surface-4"
                >
                  <Play size={13} />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={PIECE_INFO[piece].label}>
              <button
                type="button"
                role="radio"
                aria-checked={!current}
                onClick={() => onChange(piece, null)}
                className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', !current ? 'bg-fg text-surface-1' : 'bg-surface-3 text-fg-muted hover:text-fg')}
              >
                Desligado
              </button>
              {PACK_LIST.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  role="radio"
                  aria-checked={current === pack.id}
                  title={pack.name}
                  onClick={() => onChange(piece, pack.id)}
                  className={cx('flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold', current === pack.id ? 'ring-2 ring-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
                  style={current === pack.id ? { background: pack.colors.bg, color: pack.colors.ink } : undefined}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${pack.colors.a}, ${pack.colors.b})` }} />
                  {pack.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ gaveta: widgets

export const WIDGET_DRAG = 'application/x-concord-widget';

function WidgetsDrawer({ count, onAdd }: { count: number; onAdd: (t: WidgetType) => void }) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-fg-muted">
        Arraste para a grade ou clique para adicionar. {count}/{MAX_WIDGETS}.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {WIDGET_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(WIDGET_DRAG, t);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAdd(t)}
            disabled={count >= MAX_WIDGETS}
            className="flex cursor-grab flex-col items-start rounded-2xl bg-surface-1 p-3 text-left ring-1 ring-line hover:ring-accent active:cursor-grabbing disabled:opacity-40"
          >
            <WidgetMini type={t} />
            <span className="mt-2 text-xs leading-tight font-bold">{WIDGET_INFO[t].label}</span>
            <span className="mt-0.5 text-[10px] leading-snug text-fg-muted">{WIDGET_INFO[t].hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Miniatura do tamanho padrão do widget na grade. */
function WidgetMini({ type }: { type: WidgetType }) {
  const [w, h] = WIDGET_INFO[type].size;
  return (
    <span className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 6px)` }} aria-hidden="true">
      {Array.from({ length: GRID_COLS * Math.max(h, 2) }, (_, i) => {
        const x = i % GRID_COLS;
        const y = Math.floor(i / GRID_COLS);
        return <span key={i} className={cx('h-[6px] w-[6px] rounded-[1.5px]', x < w && y < h ? 'bg-accent' : 'bg-surface-4')} />;
      })}
    </span>
  );
}

// ------------------------------------------------------------------ grade com arrastar e redimensionar

type Drag = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: WidgetPlacement; preview: WidgetPlacement[] | null; dx: number; dy: number };

function GridEditor({
  widgets,
  ctx,
  selected,
  onSelect,
  onChange,
  onDropNew,
}: {
  widgets: WidgetPlacement[];
  ctx: WidgetContext;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (ws: WidgetPlacement[]) => void;
  onDropNew: (type: WidgetType, at: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropAt, setDropAt] = useState<Box | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const colW = (width - GAP_PX * (GRID_COLS - 1)) / GRID_COLS;
  const stepX = colW + GAP_PX;
  const stepY = ROW_PX + GAP_PX;
  const shown = drag?.preview ?? widgets;
  const rows = Math.min(GRID_MAX_ROWS, Math.max(6, ...shown.map((w) => w.y + w.h + 2)));
  const px = (b: Box) => ({ left: b.x * stepX, top: b.y * stepY, width: b.w * colW + (b.w - 1) * GAP_PX, height: b.h * ROW_PX + (b.h - 1) * GAP_PX });

  const start = (e: React.PointerEvent, w: WidgetPlacement, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(w.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: w.id, mode, startX: e.clientX, startY: e.clientY, orig: w, preview: null, dx: 0, dy: 0 });
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const o = drag.orig;
    const info = WIDGET_INFO[o.type];
    let next: WidgetPlacement;
    if (drag.mode === 'move') {
      const x = Math.max(0, Math.min(GRID_COLS - o.w, Math.round((o.x * stepX + dx) / stepX)));
      const y = Math.max(0, Math.min(GRID_MAX_ROWS - o.h, Math.round((o.y * stepY + dy) / stepY)));
      next = { ...o, x, y };
    } else {
      const w = Math.max(info.min[0], Math.min(info.max[0], GRID_COLS - o.x, Math.round((px(o).width + dx + GAP_PX) / stepX)));
      const h = Math.max(info.min[1], Math.min(info.max[1], GRID_MAX_ROWS - o.y, Math.round((px(o).height + dy + GAP_PX) / stepY)));
      next = { ...o, w, h };
    }
    const preview = resolve(widgets, next);
    setDrag({ ...drag, dx, dy, preview: preview ?? drag.preview });
  };

  const end = () => {
    if (drag?.preview) onChange(drag.preview);
    setDrag(null);
  };

  const cellAt = (e: React.DragEvent, type: WidgetType): Box => {
    const r = ref.current!.getBoundingClientRect();
    const [w, h] = WIDGET_INFO[type].size;
    const x = Math.max(0, Math.min(GRID_COLS - w, Math.floor((e.clientX - r.left) / stepX)));
    const y = Math.max(0, Math.floor((e.clientY - r.top) / stepY));
    return { x, y, w, h };
  };

  return (
    <div
      ref={ref}
      className="ws-grid-canvas relative select-none"
      style={{ height: rows * stepY - GAP_PX, backgroundSize: `${stepX}px ${stepY}px`, backgroundPosition: `${colW + GAP_PX / 2}px ${ROW_PX + GAP_PX / 2}px` }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(WIDGET_DRAG)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        // o tipo só aparece no drop; a prévia usa o tamanho médio
        const r = ref.current!.getBoundingClientRect();
        setDropAt({ x: Math.max(0, Math.min(GRID_COLS - 2, Math.floor((e.clientX - r.left) / stepX))), y: Math.max(0, Math.floor((e.clientY - r.top) / stepY)), w: 2, h: 2 });
      }}
      onDragLeave={() => setDropAt(null)}
      onDrop={(e) => {
        const type = e.dataTransfer.getData(WIDGET_DRAG) as WidgetType;
        setDropAt(null);
        if (!WIDGET_TYPES.includes(type)) return;
        e.preventDefault();
        const at = cellAt(e, type);
        onDropNew(type, { x: at.x, y: at.y });
      }}
    >
      {!widgets.length && !dropAt && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-fg-muted">
          <LayoutGrid size={28} className="text-fg-subtle" />
          Arraste widgets da gaveta para cá.
        </div>
      )}
      {dropAt && <div className="pointer-events-none absolute rounded-3xl border-2 border-dashed border-accent bg-accent/10" style={px(dropAt)} />}
      {drag?.preview &&
        (() => {
          const target = drag.preview.find((w) => w.id === drag.id)!;
          return <div className="pointer-events-none absolute rounded-3xl border-2 border-dashed border-accent bg-accent/10 transition-all duration-100" style={px(target)} />;
        })()}
      {shown.map((w) => {
        const isDrag = drag?.id === w.id;
        // quem está sendo arrastado segue o mouse; os outros já vão para o lugar novo
        const base = isDrag ? drag.orig : w;
        const box = px(base);
        const style =
          isDrag && drag.mode === 'move'
            ? { ...box, transform: `translate(${drag.dx}px, ${drag.dy}px)`, zIndex: 20 }
            : isDrag
              ? { ...box, width: Math.max(colW, box.width + drag.dx), height: Math.max(ROW_PX, box.height + drag.dy), zIndex: 20 }
              : box;
        return (
          <div
            key={w.id}
            className={cx(
              'group absolute rounded-3xl',
              !isDrag && 'transition-[left,top,width,height] duration-150',
              // o contorno fica fora do card: no formato recortado o clip-path esconderia
              selected === w.id && 'outline-2 outline-offset-4 outline-accent',
            )}
            style={style}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(w.id);
            }}
          >
            <WidgetCard ctx={ctx} className={cx('h-full', isDrag && 'opacity-90 shadow-2xl')}>
              <div className="pointer-events-none h-full">
                <WidgetBody w={w} ctx={ctx} />
              </div>
            </WidgetCard>
            <button
              type="button"
              aria-label={`Mover ${WIDGET_INFO[w.type].label}`}
              title="Arraste para mover"
              onPointerDown={(e) => start(e, w, 'move')}
              className={cx(
                'absolute top-2 right-2 flex cursor-grab items-center gap-1 rounded-full bg-surface-1/90 px-2 py-1 text-[10px] font-bold text-fg shadow ring-1 ring-line active:cursor-grabbing',
                selected === w.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              <GripVertical size={12} />
              {WIDGET_INFO[w.type].label}
            </button>
            <span
              role="presentation"
              title="Puxe para redimensionar"
              onPointerDown={(e) => start(e, w, 'resize')}
              className={cx(
                'absolute right-1 bottom-1 h-4 w-4 cursor-se-resize rounded-br-2xl border-r-[3px] border-b-[3px] border-accent',
                selected === w.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ ajustes do widget escolhido

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-fg-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full rounded-xl border border-transparent bg-surface-3 px-3 text-sm text-fg outline-none focus:border-accent';
const areaCls = 'w-full rounded-xl border border-transparent bg-surface-3 px-3 py-2 text-sm text-fg outline-none focus:border-accent';

function TextIn({ value, onChange, max, placeholder }: { value: string; onChange: (v: string) => void; max: number; placeholder?: string }) {
  return <input className={inputCls} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cx('rounded-full px-3 py-1 text-xs font-bold', value === id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ListEditor<T>({
  items,
  max,
  onChange,
  make,
  render,
  addLabel,
}: {
  items: T[];
  max: number;
  onChange: (items: T[]) => void;
  make: () => T;
  render: (item: T, set: (v: T) => void) => ReactNode;
  addLabel: string;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="min-w-0 flex-1">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
          <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-fg-muted hover:text-fg disabled:opacity-25">
            <ArrowUp size={13} />
          </button>
          <button type="button" aria-label="Descer" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1 text-fg-muted hover:text-fg disabled:opacity-25">
            <ArrowDown size={13} />
          </button>
          <button type="button" aria-label="Remover" onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-1 text-fg-muted hover:text-danger">
            <X size={14} />
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, make()])} className="flex items-center gap-1 rounded-full bg-surface-3 px-3 py-1.5 text-xs font-bold hover:bg-surface-4">
          <Plus size={13} />
          {addLabel}
        </button>
      )}
    </div>
  );
}

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Inspector({
  w,
  detail,
  serverId,
  onChange,
  onDelete,
  onDuplicate,
}: {
  w: WidgetPlacement;
  detail: ServerDetail;
  serverId: string;
  onChange: (props: WidgetPlacement['props']) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const title = 'title' in w.props && (
    <Field label="Título">
      <TextIn value={w.props.title} max={40} onChange={(title) => onChange({ ...w.props, title } as never)} />
    </Field>
  );

  let body: ReactNode = null;
  switch (w.type) {
    case 'text': {
      const p = w.props;
      body = (
        <>
          <Field label="Recado">
            <textarea className={areaCls} rows={6} maxLength={600} value={p.body} onChange={(e) => onChange({ ...p, body: e.target.value })} />
          </Field>
          <Field label="Destaque">
            <Chips value={p.tone} options={[['plain', 'Normal'], ['accent', 'Cor do tema'], ['warn', 'Alerta']]} onChange={(tone) => onChange({ ...p, tone })} />
          </Field>
        </>
      );
      break;
    }
    case 'rules': {
      const p = w.props;
      body = (
        <Field label="Regras">
          <ListEditor items={p.items} max={12} make={() => 'Nova regra'} onChange={(items) => onChange({ ...p, items })} addLabel="Regra" render={(it, set) => <TextIn value={it} max={140} onChange={set} />} />
        </Field>
      );
      break;
    }
    case 'countdown': {
      const p = w.props;
      body = (
        <>
          <Field label="Quando">
            <input
              type="datetime-local"
              className={inputCls}
              value={toLocalInput(p.at)}
              onChange={(e) => {
                const at = new Date(e.target.value).getTime();
                if (Number.isFinite(at)) onChange({ ...p, at });
              }}
            />
          </Field>
          <Field label="Texto quando chegar a hora">
            <TextIn value={p.doneText} max={40} onChange={(doneText) => onChange({ ...p, doneText })} placeholder="Começou!" />
          </Field>
        </>
      );
      break;
    }
    case 'scoreboard': {
      const p = w.props;
      body = (
        <>
          <Field label="Ordem">
            <Chips value={p.order} options={[['desc', 'Maior primeiro'], ['asc', 'Menor primeiro']]} onChange={(order) => onChange({ ...p, order })} />
          </Field>
          <Field label="Linhas">
            <ListEditor
              items={p.rows}
              max={10}
              make={() => ({ name: 'Nome', score: 0 })}
              onChange={(rows) => onChange({ ...p, rows })}
              addLabel="Pessoa"
              render={(r, set) => (
                <div className="flex gap-1">
                  <input className={cx(inputCls, 'min-w-0 flex-1')} value={r.name} maxLength={32} onChange={(e) => set({ ...r, name: e.target.value })} />
                  <input
                    className={cx(inputCls, 'w-20 shrink-0 tabular-nums')}
                    type="number"
                    value={r.score}
                    onChange={(e) => set({ ...r, score: Math.max(-999999, Math.min(999999, Math.round(Number(e.target.value) || 0))) })}
                  />
                </div>
              )}
            />
          </Field>
        </>
      );
      break;
    }
    case 'pomodoro': {
      const p = w.props;
      const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));
      body = (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Foco (min)">
            <input className={inputCls} type="number" min={5} max={90} value={p.focus} onChange={(e) => onChange({ ...p, focus: num(e.target.value, 5, 90) })} />
          </Field>
          <Field label="Pausa (min)">
            <input className={inputCls} type="number" min={1} max={30} value={p.pause} onChange={(e) => onChange({ ...p, pause: num(e.target.value, 1, 30) })} />
          </Field>
          <p className="col-span-2 text-[11px] text-fg-subtle">Depois de publicado, qualquer membro começa e para o pomodoro, e todo mundo vê o mesmo relógio.</p>
        </div>
      );
      break;
    }
    case 'channels': {
      const p = w.props;
      const list = detail.channels;
      body = (
        <Field label={`Canais (${p.channelIds.length}/8)`}>
          <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl bg-surface-3 p-1.5">
            {list.map((c) => {
              const on = p.channelIds.includes(c.id);
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-4">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && p.channelIds.length >= 8}
                    onChange={() => onChange({ ...p, channelIds: on ? p.channelIds.filter((id) => id !== c.id) : [...p.channelIds, c.id] })}
                  />
                  <span className="text-fg-muted">{c.type === 'voice' ? '🔊' : '#'}</span>
                  <span className="truncate">{c.name}</span>
                </label>
              );
            })}
          </div>
        </Field>
      );
      break;
    }
    case 'clock': {
      const p = w.props;
      body = (
        <Field label="Fuso">
          <select className={inputCls} value={p.tz} onChange={(e) => onChange({ ...p, tz: e.target.value as (typeof TIMEZONES)[number] })}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
      );
      break;
    }
    case 'image': {
      const p = w.props;
      const upload = async () => {
        const file = await pickImage();
        if (!file) return;
        setUploading(true);
        try {
          const blob = await prepareImage(file, 1600, false);
          const r = await uploadImage<{ url: string }>(`/servers/${serverId}/workshop/image`, blob);
          onChange({ ...p, url: r.url });
        } catch (err) {
          toast.error(err);
        } finally {
          setUploading(false);
        }
      };
      body = (
        <>
          <Button variant="secondary" className="w-full" onClick={() => void upload()} loading={uploading}>
            <ImagePlus size={16} />
            {p.url ? 'Trocar imagem' : 'Enviar imagem'}
          </Button>
          <Field label="Legenda">
            <TextIn value={p.caption} max={80} onChange={(caption) => onChange({ ...p, caption })} />
          </Field>
          <Field label="Encaixe">
            <Chips value={p.fit} options={[['cover', 'Preencher'], ['contain', 'Inteira']]} onChange={(fit) => onChange({ ...p, fit })} />
          </Field>
        </>
      );
      break;
    }
    case 'links': {
      const p = w.props;
      body = (
        <Field label="Links" hint="Só https://. O domínio sempre aparece ao lado do nome.">
          <ListEditor
            items={p.items}
            max={6}
            make={() => ({ label: 'Site', url: 'https://' })}
            onChange={(items) => onChange({ ...p, items })}
            addLabel="Link"
            render={(l, set) => (
              <div className="space-y-1 rounded-xl bg-surface-3/50 p-1">
                <input className={inputCls} value={l.label} maxLength={40} placeholder="Nome" onChange={(e) => set({ ...l, label: e.target.value })} />
                <input className={inputCls} value={l.url} maxLength={300} placeholder="https://" onChange={(e) => set({ ...l, url: e.target.value.trim() })} />
              </div>
            )}
          />
        </Field>
      );
      break;
    }
    default:
      body = <p className="text-xs text-fg-muted">Este widget se atualiza sozinho com os dados do servidor.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-extrabold tracking-wider text-fg-subtle uppercase">Widget</div>
          <div className="font-display text-base font-extrabold">{WIDGET_INFO[w.type].label}</div>
        </div>
        <ToolButton label="Duplicar" onClick={onDuplicate}>
          <Copy size={16} />
        </ToolButton>
        <ToolButton label="Apagar (Delete)" onClick={onDelete}>
          <Trash2 size={16} />
        </ToolButton>
      </div>
      <div className="text-xs text-fg-muted">
        {w.w}×{w.h} na grade · mín. {WIDGET_INFO[w.type].min.join('×')}, máx. {WIDGET_INFO[w.type].max.join('×')}
      </div>
      {title}
      {body}
    </div>
  );
}
