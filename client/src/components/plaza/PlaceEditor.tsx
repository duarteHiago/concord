// Editor da Praça (para quem gerencia o servidor): chão, paredes e móveis do lugar onde a pessoa está.
// O desenho e os cliques no mapa ficam em PlazaView; aqui o painel com o catálogo, as cores e os botões.
import { MousePointer2, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FLOORS, FURNITURE, ITEM_COLORS, WALLS, footprint, furnitureDef, layoutFor, type Furniture, type FurnitureKind, type PlaceStyle, type Scene } from '../../../../shared/plaza.ts';
import { hud, primarySm, soft } from './hud';
import { cx } from '../ui';
import { LEDGE_TOP, at, decorReady, drawItem, drawWallThumb, iso } from './pixels';

export type EditorTool = FurnitureKind | 'select';

/** Dá para girar? Não: o que é igual de todos os lados e os enfeites (o lado da parede vem de onde ele foi posto). */
export const turns = (k: FurnitureKind) => !furnitureDef(k).still && !furnitureDef(k).place;
export const rotated = (it: Furniture): Furniture => (turns(it.k) ? { ...it, r: it.r ? 0 : 1 } : it);

/**
 * O lugar com o móvel `idx` girado, ou null se girado ele não cabe. A prateleira leva junto o que está em cima
 * (cada enfeite continua na mesma metade dela).
 */
export function turnItem(style: PlaceStyle, idx: number, fits: (s: PlaceStyle) => boolean): PlaceStyle | null {
  const it = style.items[idx];
  if (!it || !turns(it.k)) return null;
  const next = rotated(it);
  const half = (x: number, y: number) => (it.r ? y - it.y : x - it.x);
  const onTop = (o: Furniture) => it.k === 'ledge' && furnitureDef(o.k).place === 'shelf' && footprint(it).some((f) => f.x === o.x && f.y === o.y);
  const items = style.items.map((o, j) => {
    if (j === idx) return next;
    if (!onTop(o)) return o;
    const i = half(o.x, o.y);
    return next.r ? { ...o, x: next.x, y: next.y + i } : { ...o, x: next.x + i, y: next.y };
  });
  const out = { ...style, items };
  return fits(out) ? out : null;
}

/** A cor que aparece no botão: a primeira é a original do móvel, nos que tinham uma só. */
export const swatch = (k: FurnitureKind | null, i: number) => (i === 0 && k ? furnitureDef(k).base : undefined) ?? ITEM_COLORS[i];

/** Tira os enfeites que ficaram sem prateleira (ela saiu ou girou), para o lugar continuar salvável. */
export function pruneDecor(style: PlaceStyle, scene: Scene, tableCount: number): PlaceStyle {
  const kept = new Set(layoutFor(scene, tableCount, style).items);
  const items = style.items.filter((it) => furnitureDef(it.k).place !== 'shelf' || kept.has(it));
  return items.length === style.items.length ? style : { ...style, items };
}

/** Miniatura de um móvel, desenhada com o mesmo código do mapa. */
function ItemThumb({ k, scene, c }: { k: FurnitureKind; scene: Scene; c: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, setReady] = useState(false);
  useEffect(() => {
    let on = true;
    void decorReady.then(() => on && setReady(true));
    return () => {
      on = false;
    };
  }, []);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const it = { k, x: 0, y: 0, r: 0 as const, c };
    const place = furnitureDef(k).place;
    if (place === 'wall') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (k === 'poster') return drawWallThumb(ctx, canvas.width, canvas.height);
      // os outros: desenhados na parede do fundo, com o meio deles no meio da miniatura
      const mid = at(furnitureDef(k).w / 2, 0, 40);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.translate(-Math.round(mid.x), -Math.round(mid.y));
      drawItem(ctx, it, scene, 0);
      ctx.restore();
      return;
    }
    const pts = footprint(it).flatMap((t) => [iso(t.x, t.y), iso(t.x + 1, t.y + 1), iso(t.x + 1, t.y), iso(t.x, t.y + 1)]);
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const scale = Math.min(1, canvas.width / (maxX - minX + 8));
    ctx.translate(canvas.width / 2, canvas.height - 4);
    ctx.scale(scale, scale);
    ctx.translate(-(minX + maxX) / 2, -maxY + (place === 'shelf' ? LEDGE_TOP : 0));
    drawItem(ctx, it, scene, 0);
    ctx.restore();
  });
  return <canvas ref={ref} width={64} height={56} className="plaza-canvas h-[42px] w-[48px]" />;
}

export function PlaceEditor({
  scene,
  draft,
  setDraft,
  tool,
  setTool,
  rot,
  setRot,
  color,
  setColor,
  selected,
  setSelected,
  saving,
  onSave,
  onCancel,
  onReset,
  fits,
  onBlocked,
  children,
}: {
  /** o lugar assim ainda vale (tudo cabe)? */
  fits: (s: PlaceStyle) => boolean;
  /** avisa que não deu (girar sem espaço) */
  onBlocked: (msg: string) => void;
  /** seções a mais no fim do painel (os andares, lá dentro) */
  children?: React.ReactNode;
  scene: Scene;
  draft: PlaceStyle;
  setDraft: (s: PlaceStyle) => void;
  tool: EditorTool;
  setTool: (t: EditorTool) => void;
  rot: 0 | 1;
  setRot: (r: 0 | 1) => void;
  color: number;
  setColor: (c: number) => void;
  selected: number | null;
  setSelected: (i: number | null) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  // os móveis de sempre do quarto já estão lá (um de cada): não aparecem no catálogo
  const kinds = (Object.keys(FURNITURE) as FurnitureKind[]).filter((k) => (FURNITURE[k].scenes as Scene[]).includes(scene) && !furnitureDef(k).unique);
  const sel = selected !== null ? draft.items[selected] : undefined;
  const target: FurnitureKind | null = sel ? sel.k : tool !== 'select' ? tool : null;
  const colorTarget = sel ? (FURNITURE[sel.k] as { colors?: boolean }).colors : tool !== 'select' && (FURNITURE[tool] as { colors?: boolean }).colors;

  const section = (title: string, body: React.ReactNode) => (
    <div>
      <div className={cx(hud.label, 'mb-1.5')}>{title}</div>
      {body}
    </div>
  );

  return (
    <div className={cx(hud.panel, 'animate-pop-in absolute top-[72px] left-3 z-[64] flex max-h-[calc(100%-11rem)] w-[min(92vw,316px)] flex-col overflow-hidden')}>
      <div className="border-b border-line px-4 py-3.5">
        <div className={cx(hud.title, 'text-[16px]')}>{scene === 'lobby' ? 'Montando a praça' : scene === 'room' ? 'Montando o seu quarto' : 'Montando o prédio'}</div>
        <div className="mt-0.5 text-[12px] text-fg-muted">Escolha um móvel e clique no chão para pôr. Com a setinha, clique num móvel para mexer nele.</div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {section(
          'Móveis',
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => setTool('select')}
              title="Selecionar"
              aria-pressed={tool === 'select'}
              className={cx('flex h-[62px] flex-col items-center justify-center gap-1 rounded-2xl text-[10.5px] font-bold transition', tool === 'select' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg hover:bg-surface-4')}
            >
              <MousePointer2 size={18} /> Mexer
            </button>
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => {
                  setTool(k);
                  setSelected(null);
                }}
                title={FURNITURE[k].label}
                aria-pressed={tool === k}
                className={cx('flex h-[62px] flex-col items-center justify-end rounded-2xl pb-1 text-[10.5px] font-bold transition', tool === k ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg hover:bg-surface-4')}
              >
                <ItemThumb k={k} scene={scene} c={color} />
                <span className="leading-none">{FURNITURE[k].label}</span>
              </button>
            ))}
          </div>,
        )}

        {(sel || tool !== 'select') && (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <div className="text-[12px] font-semibold">{sel ? `Mexendo em: ${FURNITURE[sel.k].label}` : `Pondo: ${FURNITURE[tool as FurnitureKind].label}`}</div>
            {!sel && tool !== 'select' && furnitureDef(tool).place && (
              <div className="text-[11.5px] text-fg-muted">{furnitureDef(tool).place === 'shelf' ? 'Clique em cima de uma prateleira (cabe um enfeite em cada metade).' : 'Clique numa das paredes.'}</div>
            )}
            {colorTarget && (
              <div className="flex flex-wrap gap-1.5">
                {ITEM_COLORS.map((c, i) => (
                  <button
                    key={c}
                    title={i === 0 && target && furnitureDef(target).base ? 'Cor original' : undefined}
                    aria-label={`Cor ${i + 1}`}
                    onClick={() => {
                      setColor(i);
                      if (sel && selected !== null) setDraft({ ...draft, items: draft.items.map((it, j) => (j === selected ? { ...it, c: i } : it)) });
                    }}
                    className={cx('h-7 w-7 rounded-full border-2 transition hover:scale-110', (sel ? sel.c : color) === i ? 'border-fg' : 'border-line-strong')}
                    style={{ background: swatch(target, i) }}
                  />
                ))}
              </div>
            )}
            {sel && <div className="text-[11.5px] text-fg-muted">Arraste para mudar de lugar.</div>}
            <div className="flex gap-1.5">
              {target && turns(target) && (
                <button
                  onClick={() => {
                    if (sel && selected !== null) {
                      const next = turnItem(draft, selected, fits);
                      if (next) setDraft(next);
                      else onBlocked('Girado, ele não cabe aí.');
                    } else setRot(rot ? 0 : 1);
                  }}
                  className={soft()}
                >
                  <RotateCw size={14} /> Girar
                </button>
              )}
              {sel && !furnitureDef(sel.k).unique && (
                <button
                  onClick={() => {
                    setDraft({ ...draft, items: draft.items.filter((_, j) => j !== selected) });
                    setSelected(null);
                  }}
                  className={cx(soft(), 'text-danger')}
                >
                  <Trash2 size={14} /> Remover
                </button>
              )}
            </div>
          </div>
        )}

        {section(
          'Chão',
          <div className="flex flex-wrap gap-1.5">
            {FLOORS[scene].map((f, i) => (
              <button
                key={f.name}
                title={f.name}
                aria-label={`Chão ${f.name}`}
                onClick={() => setDraft({ ...draft, floor: i })}
                className={cx('h-9 w-9 rounded-xl border-2 transition hover:scale-105', draft.floor === i ? 'border-fg' : 'border-line-strong')}
                style={{ background: `repeating-conic-gradient(${f.a} 0 25%, ${f.b} 0 50%) 0 0 / 12px 12px` }}
              />
            ))}
          </div>,
        )}
        {scene !== 'lobby' &&
          section(
            'Paredes',
            <div className="flex flex-wrap gap-1.5">
              {WALLS.map((w, i) => (
                <button
                  key={w.name}
                  title={w.name}
                  aria-label={`Paredes ${w.name}`}
                  onClick={() => setDraft({ ...draft, wall: i })}
                  className={cx('h-9 w-9 rounded-xl border-2 transition hover:scale-105', draft.wall === i ? 'border-fg' : 'border-line-strong')}
                  style={{ background: `linear-gradient(135deg, ${w.left} 50%, ${w.back} 50%)` }}
                />
              ))}
            </div>,
          )}
        {children}
        <div className="text-[11.5px] text-fg-subtle">{draft.items.length} móveis neste lugar</div>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <button onClick={onReset} title="Voltar ao padrão" className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold text-fg-muted transition hover:bg-surface-4 hover:text-fg">
          <Undo2 size={13} /> Padrão
        </button>
        <span className="flex-1" />
        <button onClick={onCancel} className={soft('sm', 'raised')}>
          Cancelar
        </button>
        <button onClick={onSave} disabled={saving} className={primarySm()}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
