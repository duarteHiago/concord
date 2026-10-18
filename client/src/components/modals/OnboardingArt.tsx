import type { ReactNode } from 'react';
import { Bot, Copy, Crown, Dices, Hash, Headphones, Heart, Link2, Mic, MonitorUp, Music2, Palette, Plus, Search, ShieldCheck } from 'lucide-react';
import { cx } from '../ui';

/** Pequenas "fotos" do app, feitas com os mesmos tokens de cor do tema (por isso acompanham o tema escolhido pela pessoa). */

function Frame({ children }: { children: ReactNode }) {
  return <div className="relative h-[150px] w-full overflow-hidden rounded-2xl border border-line bg-surface-0 p-3.5">{children}</div>;
}

/** Rótulo flutuante que aponta para o elemento sendo explicado. */
function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('absolute rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-on-accent shadow-lg', className)}>
      {children}
    </span>
  );
}

/** Anel que destaca o botão/elemento em foco no mockup. */
function Spot({ children, className, rounded = 'rounded-full' }: { children: ReactNode; className?: string; rounded?: string }) {
  return <div className={cx('flex items-center justify-center ring-2 ring-accent ring-offset-2 ring-offset-surface-0', rounded, className)}>{children}</div>;
}

function Bar({ w, className }: { w: number; className?: string }) {
  return <div className={cx('h-1.5 rounded-full bg-surface-4', className)} style={{ width: w }} />;
}

// ------------------------------------------------------------------ 1. Visão geral

export function OverviewArt() {
  return (
    <Frame>
      <div className="flex h-full gap-2">
        <div className="flex w-7 shrink-0 flex-col items-center gap-1.5 rounded-xl bg-surface-1 py-2">
          <div className="h-5 w-5 rounded-full bg-accent" />
          <div className="h-5 w-5 rounded-full bg-surface-3" />
          <div className="h-5 w-5 rounded-full border border-dashed border-line-strong" />
        </div>
        <div className="flex w-16 shrink-0 flex-col gap-1 rounded-xl bg-surface-2 p-2">
          <Bar w={34} className="bg-surface-4" />
          <div className="flex items-center gap-1 rounded-md bg-surface-4 px-1 py-0.5">
            <Hash size={8} className="text-fg-muted" />
            <Bar w={24} />
          </div>
          <div className="flex items-center gap-1 px-1">
            <Hash size={8} className="text-fg-subtle" />
            <Bar w={20} className="bg-surface-3" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 rounded-xl bg-surface-2 p-2">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 shrink-0 rounded-full bg-accent-2" />
            <Bar w={60} />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 shrink-0 rounded-full bg-accent" />
            <Bar w={44} className="bg-surface-3" />
          </div>
          <div className="mt-auto h-4 rounded-full bg-surface-3" />
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 2. Servidores e convites

export function ServersArt() {
  return (
    <Frame>
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface-3 text-[11px] font-bold text-fg-muted">AM</div>
          <Spot rounded="rounded-2xl" className="h-9 w-9">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-[11px] font-bold text-on-accent">GL</div>
          </Spot>
          <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl border-2 border-dashed border-line-strong text-fg-muted">
            <Plus size={16} />
            <Tag className="-top-2 -right-10">Criar</Tag>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-2">
          <Link2 size={13} className="shrink-0 text-accent" />
          <span className="truncate text-[10px] font-semibold text-fg-muted">concord.app/convite/x7f2a</span>
          <Copy size={12} className="ml-auto shrink-0 text-fg-subtle" />
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 3. Canais de texto

export function ChannelsArt() {
  return (
    <Frame>
      <div className="flex h-full gap-2.5">
        <div className="flex w-16 shrink-0 flex-col gap-1 rounded-xl bg-surface-1 p-2">
          <div className="flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-1 text-fg">
            <Hash size={9} />
            <span className="text-[9px] font-bold">geral</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 text-fg-subtle">
            <Hash size={9} />
            <span className="text-[9px] font-semibold">memes</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-start gap-1.5">
            <div className="h-5 w-5 shrink-0 rounded-full bg-accent-2" />
            <div className="rounded-xl rounded-tl-none bg-surface-2 px-2 py-1">
              <Bar w={48} className="bg-surface-4" />
            </div>
          </div>
          <div className="flex items-start gap-1.5">
            <div className="h-5 w-5 shrink-0 rounded-full bg-accent" />
            <div className="rounded-xl rounded-tl-none bg-surface-2 px-2 py-1">
              <Bar w={34} className="bg-surface-4" />
            </div>
          </div>
          <div className="relative mt-auto flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5">
            <span className="font-mono text-[11px] font-bold text-accent">/</span>
            <span className="text-[9px] text-fg-subtle">dado 2d6</span>
            <Tag className="-top-7 right-0">Comandos</Tag>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 4. Salas de voz

export function VoiceArt() {
  return (
    <Frame>
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-center justify-center gap-4 pt-2">
          <div className="flex flex-col items-center gap-1">
            <div className="h-9 w-9 rounded-full bg-surface-3" />
            <Bar w={20} className="bg-surface-3" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="speaking-ring h-9 w-9 rounded-full bg-accent-2" />
            <Bar w={20} className="bg-surface-4" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-9 w-9 rounded-full bg-surface-3" />
            <Bar w={20} className="bg-surface-3" />
          </div>
        </div>
        <div className="relative flex items-center justify-center gap-2">
          <Spot className="h-8 w-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-fg">
              <Mic size={14} />
            </div>
          </Spot>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-fg">
            <Headphones size={14} />
          </div>
          <Tag className="-top-2 right-2">Silenciar</Tag>
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 5. Transmissão de tela

export function ScreenShareArt() {
  return (
    <Frame>
      <div className="flex h-full gap-2">
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-2">
          <span className="absolute top-1.5 left-2 text-[9px] font-bold text-fg-muted">Você</span>
          <Spot className="h-9 w-9">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent">
              <MonitorUp size={16} />
            </div>
          </Spot>
          <Tag className="bottom-2 left-1/2 -translate-x-1/2">Transmitir tela</Tag>
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-2">
          <span className="absolute top-1.5 left-2 text-[9px] font-bold text-fg-muted">Bia</span>
          <div className="h-9 w-14 rounded-md bg-surface-4" />
          <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-on-accent shadow-lg">Assistir</span>
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 6. Mesa de sons, reações e minigames

export function ExtrasArt() {
  return (
    <Frame>
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-center gap-1.5">
          {['vinheta', 'ups', 'buzina'].map((s) => (
            <div key={s} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[9px] font-bold text-fg-muted">
              <Music2 size={10} className="text-accent-2" />
              {s}
            </div>
          ))}
        </div>
        <div className="flex items-end justify-between">
          <div className="relative">
            <Spot className="h-8 w-8">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-live">
                <Heart size={14} />
              </div>
            </Spot>
            <span className="absolute -top-3 -right-1 text-[11px]" style={{ color: 'var(--color-live)' }}>
              ♥
            </span>
            <span className="absolute -top-6 left-3 text-[10px]" style={{ color: 'var(--color-accent-2)' }}>
              ♥
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5 text-[9px] font-bold text-fg-muted">
            <Dices size={12} className="text-accent" /> /dado 2d6
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 7. Cargos, permissões e moderação

export function RolesArt() {
  return (
    <Frame>
      <div className="relative flex h-full flex-col justify-center gap-1.5">
        {[
          { color: 'var(--color-warn)', name: 'admin', icon: true, on: true },
          { color: 'var(--color-accent-2)', name: 'membro', icon: false, on: true },
          { color: 'var(--color-fg-subtle)', name: 'visitante', icon: false, on: false },
        ].map((r) => (
          <div key={r.name} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            {r.icon && <Crown size={10} className="shrink-0 text-warn" />}
            <span className="text-[9px] font-bold text-fg-muted">{r.name}</span>
            <span className={cx('ml-auto h-3.5 w-7 shrink-0 rounded-full', r.on ? 'bg-accent' : 'bg-surface-4')}>
              <span className={cx('block h-3 w-3 translate-y-[1px] rounded-full bg-white transition-all', r.on ? 'translate-x-[15px]' : 'translate-x-[1px]')} />
            </span>
          </div>
        ))}
        <Tag className="top-1 right-2">
          <ShieldCheck size={10} className="mr-0.5 inline" /> Por canal
        </Tag>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 8. Personalização

export function AppearanceArt() {
  return (
    <Frame>
      <div className="flex h-full flex-col justify-center gap-3">
        <div className="grid grid-cols-4 gap-2">
          {['#1b1625', '#101820', '#f4ede2', '#120d1d'].map((c, i) => (
            <div key={c} className={cx('h-9 rounded-lg', i === 0 && 'ring-2 ring-accent ring-offset-2 ring-offset-surface-0')} style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Palette size={13} className="text-accent" />
          {['#ff8a6b', '#c4a5ff', '#22c55e', '#00b0f4'].map((c) => (
            <span key={c} className="h-3.5 w-3.5 rounded-full" style={{ background: c }} />
          ))}
        </div>
      </div>
    </Frame>
  );
}

// ------------------------------------------------------------------ 9. Atalhos, bots e mais

export function ShortcutsArt() {
  return (
    <Frame>
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-2">
          <Search size={12} className="text-fg-subtle" />
          <span className="flex-1 text-[9px] text-fg-subtle">Buscar servidores e amigos…</span>
          <Spot rounded="rounded-md" className="h-5 px-0">
            <span className="rounded-md bg-surface-4 px-1.5 py-0.5 text-[9px] font-bold text-fg">Ctrl K</span>
          </Spot>
        </div>
        <Bar w={110} className="bg-surface-2" />
        <Bar w={80} className="bg-surface-2" />
        <div className="mt-auto flex items-center gap-1 self-start rounded-full bg-surface-2 px-2 py-1 text-[9px] font-bold text-fg-muted">
          <Bot size={11} className="text-accent-2" /> meu-bot
        </div>
      </div>
    </Frame>
  );
}
