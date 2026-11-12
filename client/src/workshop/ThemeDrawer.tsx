// Aba "Tema" da Oficina: as cores, o fundo, o formato e a fonte da área do servidor.
import { Check, ImagePlus, Trash2, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  FONT_INFO,
  SHAPE_INFO,
  THEME_FONTS,
  THEME_SHAPES,
  contrast,
  defaultTheme,
  themeContrastIssues,
  themeTokens,
  type ServerTheme,
} from '../../../shared/workshop.ts';
import { pickImage, prepareImage, uploadImage } from '../lib/upload';
import { toast } from '../store/toast';
import { Button, Toggle, cx } from '../components/ui';
import { PACK_LIST } from './packs';

const DARK_SURFACES = ['#1a1f2e', '#13213f', '#151b22', '#1e0b3d', '#18291c', '#2a2038', '#2b1a1a', '#202124'];
const LIGHT_SURFACES = ['#ffffff', '#f4f1ea', '#eef3ff', '#f1f7f2', '#fff4f0', '#f5f0ff', '#f2f2f2', '#fdf8e6'];
const ACCENTS = ['#7c9cff', '#e8b94a', '#ff7a1a', '#ff3df2', '#34d399', '#f2a7c3', '#22d3ee', '#1f4fd1', '#b4235a', '#0f766e', '#c2410c', '#6d28d9'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="px-1 text-[11px] font-extrabold tracking-wider text-fg-subtle uppercase">{title}</div>
      {children}
    </div>
  );
}

function ColorRow({ value, options, onChange, label }: { value: string; options: string[]; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          onClick={() => onChange(c)}
          className={cx('h-7 w-7 rounded-full ring-1 ring-line transition-transform hover:scale-110', value === c && 'ring-2 ring-accent ring-offset-2 ring-offset-surface-2')}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-line" title="Outra cor">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${label}: outra cor`} />
        <span className="flex h-full w-full items-center justify-center text-xs font-black" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
      </label>
      <span className="ml-1 font-mono text-[11px] text-fg-muted">{value}</span>
    </div>
  );
}

export function ThemeDrawer({ theme, serverId, onChange }: { theme: ServerTheme | undefined; serverId: string; onChange: (t: ServerTheme | undefined) => void }) {
  const [uploading, setUploading] = useState(false);
  if (!theme)
    return (
      <div className="space-y-3">
        <p className="px-1 text-xs text-fg-muted">
          Sem tema, cada pessoa vê o servidor com o tema dela. Com tema, a área do servidor inteira (barra lateral, conversa, blocos e widgets) ganha as cores
          daqui. Configurações e janelas do sistema continuam no tema de cada um.
        </p>
        <Button className="w-full" onClick={() => onChange(defaultTheme())}>
          Criar um tema
        </Button>
        <div className="px-1 pt-1 text-[11px] font-extrabold tracking-wider text-fg-subtle uppercase">ou comece de um pacote</div>
        <PackStarts onPick={(t) => onChange({ ...t, background: { url: '', dim: 45 } })} />
      </div>
    );

  const set = (patch: Partial<ServerTheme>) => onChange({ ...theme, ...patch });
  const issues = themeContrastIssues(theme);
  const k = themeTokens(theme);
  const ratio = contrast(k.fg, k['surface-2']);

  const upload = async () => {
    const file = await pickImage();
    if (!file) return;
    setUploading(true);
    try {
      const blob = await prepareImage(file, 1920, false);
      const r = await uploadImage<{ url: string }>(`/servers/${serverId}/workshop/image`, blob);
      set({ background: { ...theme.background, url: r.url } });
    } catch (err) {
      toast.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl bg-surface-1 p-3 ring-1 ring-line">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Tema do servidor</div>
          <div className="text-xs text-fg-muted">Desligado, cada pessoa vê o próprio tema.</div>
        </div>
        <Toggle checked onChange={() => onChange(undefined)} />
      </div>

      {/* contraste: o servidor recusa salvar um tema ilegível */}
      {issues.length ? (
        <div className="space-y-1 rounded-2xl bg-danger/12 p-3 text-xs text-danger">
          {issues.map((i) => (
            <div key={i} className="flex gap-1.5">
              <TriangleAlert size={14} className="mt-px shrink-0" />
              {i}
            </div>
          ))}
          <div className="pt-1 text-fg-muted">Enquanto o contraste não passar, o rascunho não salva.</div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-2xl bg-ok/12 px-3 py-2 text-xs font-semibold text-fg">
          <Check size={14} className="text-ok" />
          Contraste ok · texto {ratio.toFixed(1)}:1
        </div>
      )}

      <Section title="Começar de um pacote">
        <PackStarts onPick={(t) => onChange({ ...t, background: theme.background })} />
      </Section>

      <Section title="Base">
        <div className="flex gap-1">
          {(
            [
              ['dark', 'Escura'],
              ['light', 'Clara'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => id !== theme.base && set({ base: id, surface: id === 'dark' ? DARK_SURFACES[0] : LIGHT_SURFACES[1], accent: id === 'dark' ? '#7c9cff' : '#1f4fd1', accent2: id === 'dark' ? '#4ef0d0' : '#b4235a' })}
              className={cx('flex-1 rounded-full py-1.5 text-xs font-bold', theme.base === id ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Cor dos painéis">
        <ColorRow label="Painéis" value={theme.surface} options={theme.base === 'dark' ? DARK_SURFACES : LIGHT_SURFACES} onChange={(surface) => set({ surface })} />
      </Section>
      <Section title="Destaque">
        <ColorRow label="Destaque" value={theme.accent} options={ACCENTS} onChange={(accent) => set({ accent })} />
      </Section>
      <Section title="Destaque 2">
        <ColorRow label="Destaque 2" value={theme.accent2} options={ACCENTS} onChange={(accent2) => set({ accent2 })} />
      </Section>

      <Section title="Imagem de fundo">
        {theme.background.url ? (
          <div className="overflow-hidden rounded-2xl ring-1 ring-line">
            <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url("${theme.background.url}")` }} />
            <div className="flex gap-1.5 p-2">
              <Button variant="secondary" className="h-8 flex-1 px-3 text-xs" onClick={() => void upload()} loading={uploading}>
                <ImagePlus size={14} />
                Trocar
              </Button>
              <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => set({ background: { ...theme.background, url: '' } })}>
                <Trash2 size={14} />
                Tirar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => void upload()} loading={uploading}>
            <ImagePlus size={16} />
            Enviar imagem (GIF também)
          </Button>
        )}
        {theme.background.url && (
          <label className="flex items-center gap-3 px-1 text-xs text-fg-muted">
            Escurecer
            <input
              type="range"
              min={0}
              max={85}
              step={5}
              value={theme.background.dim}
              onChange={(e) => set({ background: { ...theme.background, dim: Number(e.target.value) } })}
              className="flex-1 accent-[var(--color-accent)]"
            />
            <span className="w-8 text-right tabular-nums">{theme.background.dim}%</span>
          </label>
        )}
      </Section>

      <Section title="Formato dos painéis">
        <div className="flex gap-1">
          {THEME_SHAPES.map((sh) => (
            <button
              key={sh}
              type="button"
              onClick={() => set({ shape: sh })}
              className={cx('flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-bold', theme.shape === sh ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg')}
            >
              <span
                className="h-5 w-8 border-2 border-current"
                style={{
                  borderRadius: sh === 'pill' ? 999 : sh === 'cut' ? 1 : 6,
                  clipPath: sh === 'cut' ? 'polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)' : undefined,
                }}
              />
              {SHAPE_INFO[sh]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Fonte">
        <div className="grid grid-cols-2 gap-1.5">
          {THEME_FONTS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set({ font: f })}
              className={cx('rounded-2xl px-3 py-2 text-left', theme.font === f ? 'bg-accent text-on-accent' : 'bg-surface-3 hover:bg-surface-4')}
            >
              <span className="block text-base leading-tight font-bold" style={{ fontFamily: FONT_INFO[f].display }}>
                Aa Bb
              </span>
              <span className="text-[10px] font-semibold opacity-75">{FONT_INFO[f].label}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function PackStarts({ onPick }: { onPick: (t: Omit<ServerTheme, 'background'>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PACK_LIST.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p.theme)}
          className="flex items-center gap-2 rounded-2xl p-2 text-left text-[11px] font-bold ring-1 ring-line hover:ring-accent"
          style={{ background: p.theme.surface, color: themeTokens({ ...p.theme, background: { url: '', dim: 0 } }).fg }}
        >
          <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${p.theme.accent} 50%, ${p.theme.accent2} 50%)` }} />
          <span className="truncate">{p.name}</span>
        </button>
      ))}
    </div>
  );
}
