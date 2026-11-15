// Peças do HUD da Praça no mesmo desenho do resto do Concord (a barra da call, os menus): cores do tema (surface,
// accent, fg), pílulas redondas e a fonte de títulos. Assim a Praça acompanha o tema escolhido pela pessoa. O mundo
// em pixel art (o canvas) continua com a arte dele; isto é só o que fica por cima.
//
// Cada peça recebe UMA cor (o estado escolhe qual): juntar duas classes de cor (bg-surface-3 e bg-fg) não garante que
// a segunda vença, porque quem decide é a ordem do CSS gerado, não a da lista.

type Tone = 'default' | 'off' | 'on';
const TONE: Record<Tone, string> = {
  default: 'bg-surface-3 text-fg hover:bg-surface-4',
  /** desligado (o microfone mutado, como na call) */
  off: 'bg-fg text-surface-1',
  /** ligado com destaque (falando na praça, enviar) */
  on: 'bg-accent text-on-accent hover:bg-accent-hover',
};

/** botão redondo da barra (como os da call) */
export const round = (tone: Tone = 'default') => `grid h-11 w-11 shrink-0 place-items-center rounded-full transition-all hover:scale-105 active:scale-95 ${TONE[tone]}`;

/** botão redondo solto no mapa (zoom, centralizar, sair) */
export const float = (tone: Tone = 'default') =>
  `grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)] transition-all hover:scale-105 active:scale-95 ${tone === 'default' ? 'bg-surface-2 text-fg hover:bg-surface-3' : TONE[tone]}`;

/** plaquinha presa no mapa (nomes, mesas, portas); `mine` = a sua, na cor de destaque */
export const chip = (mine = false) =>
  `flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] font-display text-[11px] leading-none font-bold shadow-[0_3px_10px_-3px_rgba(0,0,0,0.55)] ${mine ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg'}`;

/** linha de uma lista num menu (o elevador) */
export const item = (on = false) =>
  `flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-fg transition disabled:cursor-default ${on ? 'bg-surface-2 shadow-sm' : 'hover:bg-surface-4'}`;

type Size = 'sm' | 'md';
const SIZE: Record<Size, string> = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-9 px-4 text-[13.5px]' };

/** ação principal pequena (dentro de menus) */
export const primarySm = (size: Size = 'sm') =>
  `flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent font-display font-bold whitespace-nowrap text-on-accent transition hover:bg-accent-hover disabled:opacity-50 ${SIZE[size]}`;

/** ação secundária pequena; `raised` = dentro de um painel (o fundo do painel já é cinza: usa o branco) */
export const soft = (size: Size = 'sm', look: 'default' | 'raised' | 'danger' = 'default') =>
  `flex shrink-0 items-center justify-center gap-1.5 rounded-full font-display font-bold whitespace-nowrap transition disabled:opacity-40 ${SIZE[size]} ${
    look === 'default' ? 'bg-surface-3 text-fg hover:bg-surface-4' : look === 'raised' ? 'bg-surface-2 text-fg hover:bg-surface-4' : 'bg-surface-2 text-danger hover:bg-surface-4'
  }`;

export const hud = {
  /** janelinhas e menus flutuantes */
  panel: 'rounded-[22px] border border-line bg-popover text-fg shadow-[0_20px_44px_-16px_rgba(0,0,0,0.6)]',
  /** barra em pílula (como a da call) */
  dock: 'flex items-center gap-2 rounded-full bg-surface-2 p-2 text-fg shadow-[0_14px_36px_-14px_rgba(0,0,0,0.65)]',
  /** ação principal da barra (como "Transmitir tela") */
  primary:
    'flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-5 font-display text-[14px] font-bold whitespace-nowrap text-on-accent transition-all hover:scale-[1.03] hover:bg-accent-hover disabled:opacity-50',
  /** sair/levantar (como "Sair da sala") */
  danger: 'flex h-11 shrink-0 items-center gap-2 rounded-full bg-danger px-5 font-display text-[14px] font-bold whitespace-nowrap text-white transition-all hover:scale-[1.03] hover:brightness-110',
  close: 'grid h-7 w-7 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-surface-4 hover:text-fg',
  title: 'font-display font-bold text-fg',
  label: 'text-[11px] font-bold tracking-wider text-fg-subtle uppercase',
  input: 'min-w-0 flex-1 rounded-full bg-surface-3 px-4 py-2.5 text-sm text-fg outline-none placeholder:text-fg-subtle',
};
