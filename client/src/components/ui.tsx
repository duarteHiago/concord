import { BadgeCheck, Eye, EyeOff, X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { useToasts } from '../store/toast';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function Avatar({
  name,
  color,
  src,
  size = 40,
  status,
  speaking,
  frame,
  className,
  freeze,
}: {
  name: string;
  color: string;
  src?: string | null;
  size?: number;
  status?: 'online' | 'dnd' | 'offline' | null;
  speaking?: boolean;
  /** moldura animada escolhida no perfil */
  frame?: string | null;
  className?: string;
  /** desenha a foto num canvas (1 frame só): usado pra tirar o movimento de avatares em GIF, ex. nas bolhas de quem assiste a uma transmissão */
  freeze?: boolean;
}) {
  return (
    // decorativo: o nome da pessoa sempre aparece ao lado (o leitor de tela não precisa ler a inicial)
    <div aria-hidden="true" className={cx('avatar relative shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        freeze ? (
          <FrozenImage src={src} size={size} speaking={speaking} />
        ) : (
          <img
            src={src}
            alt=""
            draggable={false}
            className={cx('h-full w-full rounded-full object-cover transition-shadow', speaking && 'speaking-ring')}
          />
        )
      ) : (
        <div
          className={cx(
            'flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white transition-shadow',
            speaking && 'speaking-ring',
          )}
          style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)`, fontSize: size * 0.38 }}
        >
          {initials(name)}
        </div>
      )}
      {frame && <AvatarFrame frame={frame} size={size} />}
      {status && (
        <span
          title={status === 'dnd' ? 'Não perturbe' : status === 'online' ? 'Online' : 'Offline'}
          className={cx(
            'absolute -right-0.5 -bottom-0.5 z-[2] flex items-center justify-center rounded-full border-[3px] border-surface-2',
            status === 'online' ? 'bg-ok' : status === 'dnd' ? 'bg-danger' : 'bg-fg-subtle',
          )}
          style={{ width: Math.max(12, size * 0.34), height: Math.max(12, size * 0.34) }}
        >
          {status === 'dnd' && <span className="h-[2px] w-1/2 rounded-full bg-surface-2" />}
        </span>
      )}
    </div>
  );
}

/** Desenha a imagem num <canvas>, só uma vez: se for GIF animado, fica parado no primeiro quadro. */
function FrozenImage({ src, size, speaking }: { src: string; size: number; speaking?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      // corta no quadrado central, igual ao object-cover do <img>
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, size]);
  return <canvas ref={ref} className={cx('h-full w-full rounded-full object-cover transition-shadow', speaking && 'speaking-ring')} style={{ width: size, height: size }} />;
}

/** Partículas que giram em volta de algumas molduras. */
const FRAME_PARTICLES: Record<string, string[]> = {
  orbit: ['', ''],
  hearts: ['💖', '💗', '💕'],
  sakura: ['🌸', '🌸', '🌸'],
  galaxy: ['✦', '✧', '✦', '✧'],
  fire: ['🔥', '🔥'],
};

export function AvatarFrame({ frame, size }: { frame: string; size: number }) {
  const particles = FRAME_PARTICLES[frame] ?? [];
  const fw = Math.max(2, Math.round(size * 0.065));
  return (
    <span className={cx('avatar-frame', `frame-${frame}`)} style={{ '--fw': `${fw}px`, '--ps': `${Math.max(7, size * 0.2)}px` } as React.CSSProperties}>
      {particles.length > 0 && (
        <span className="frame-particles">
          {particles.map((p, i) => (
            <i key={i} style={{ transform: `rotate(${(360 / particles.length) * i}deg)` }}>
              <b>{p}</b>
            </i>
          ))}
        </span>
      )}
    </span>
  );
}

/** Proporções e tamanhos ideais de cada imagem do app. */
export const IMAGE_SPECS = {
  avatar: { w: 1, h: 1, size: '512 × 512 px', note: 'Quadrada. GIF animado vale.' },
  serverIcon: { w: 1, h: 1, size: '512 × 512 px', note: 'Quadrada. GIF animado vale.' },
  banner: { w: 3, h: 1, size: '1200 × 400 px', note: 'Faixa larga (3:1). GIF animado vale.' },
  cardBg: { w: 2, h: 3, size: '800 × 1200 px', note: 'Em pé (2:3). GIF animado vale.' },
  background: { w: 16, h: 9, size: '1920 × 1080 px', note: 'Tela cheia (16:9). Em telas diferentes as bordas podem ser cortadas.' },
  patchLogo: { w: 1, h: 1, size: '512 × 512 px', note: 'Quadrada, PNG com fundo transparente. Depois de enviar dá para ajustar tamanho e posição.' },
  sticker: { w: 1, h: 1, size: '512 × 512 px', note: 'Quadrada, PNG ou GIF com fundo transparente.' },
} as const;
export type ImageSpec = keyof typeof IMAGE_SPECS;

/** Mostra a proporção e o tamanho ideais da imagem antes de enviar. */
export function ImageHint({ spec, label, className }: { spec: ImageSpec; label?: string; className?: string }) {
  const s = IMAGE_SPECS[spec];
  const box = 22;
  const w = s.w >= s.h ? box : (box * s.w) / s.h;
  const h = s.h >= s.w ? box : (box * s.h) / s.w;
  return (
    <div className={cx('flex items-center gap-2.5 text-xs text-fg-subtle', className)}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="rounded-[3px] border-2 border-dashed border-accent/70 bg-accent/10" style={{ width: w, height: h }} />
      </span>
      <span>
        <b className="font-semibold text-fg-muted">
          {label && `${label}: `}
          {s.w}:{s.h} · {s.size}
        </b>{' '}
        — {s.note}
      </span>
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  variant = 'primary',
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 font-display text-sm font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-hover',
        variant === 'secondary' && 'bg-surface-3 text-fg hover:bg-surface-4',
        variant === 'danger' && 'bg-danger text-white hover:bg-red-600',
        variant === 'ghost' && 'text-fg-muted hover:bg-white/5 hover:text-fg',
        className,
      )}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      {children}
    </button>
  );
}

export function IconButton({
  className,
  active,
  danger,
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; danger?: boolean; label: string }) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger/15' : active ? 'bg-white/10 text-fg' : 'text-fg-muted hover:bg-white/8 hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Input({ label, hint, className, type, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-bold text-fg-muted">{label}</span>}
      <span className="relative block">
        <input
          {...props}
          type={isPassword && revealed ? 'text' : type}
          className={cx(
            'h-11 w-full rounded-2xl border border-transparent bg-surface-3 px-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent',
            // Edge draws its own reveal button; ours replaces it
            isPassword && 'pr-11 [&::-ms-reveal]:hidden',
            className,
          )}
        />
        {isPassword && (
          <button
            type="button"
            // keep focus (and the caret) in the field while toggling
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={revealed}
            title={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-2xl text-fg-subtle transition-colors hover:text-fg"
          >
            {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </span>
      {hint && <span className="mt-1 block text-xs text-fg-subtle">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-surface-4',
      )}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 460,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="flex max-h-[90vh] w-full animate-pop-in flex-col overflow-hidden rounded-[28px] bg-surface-2 shadow-2xl ring-1 ring-line"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="relative px-6 pt-6 pb-2">
            {title && <h2 className="pr-8 text-xl font-bold">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
            <IconButton label="Fechar" className="absolute top-5 right-5 h-8 w-8" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </div>
        )}
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pt-2 pb-6">{footer}</div>}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            'pointer-events-auto animate-slide-up rounded-full border px-5 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur',
            t.kind === 'error' && 'border-danger/40 bg-red-950/90 text-red-100',
            t.kind === 'success' && 'border-ok/40 bg-emerald-950/90 text-emerald-100',
            t.kind === 'info' && 'border-line-strong bg-surface-3/95 text-fg',
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/15 border-t-accent"
      style={{ width: size, height: size }}
    />
  );
}

export function RoleDot({ color }: { color: string | null }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: color ?? '#99aab5' }} />;
}

/** Selo de verificado: concedido pela autoridade da instalação (ver server/src/access.ts), não é autodeclarado. */
export function VerifiedBadge({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <span title="Verificado" className={cx('inline-flex shrink-0', className)}>
      <BadgeCheck size={size} className="fill-accent text-on-accent" />
    </span>
  );
}

/** Pílula "ao vivo" do design Noturno. */
export function LivePill({ children = 'ao vivo', className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cx('rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-on-accent', className)}>{children}</span>
  );
}

/** Pilha de avatares sobrepostos (cartões das salas). */
export function AvatarStack({
  people,
  size = 30,
  max = 5,
}: {
  people: { id: string; name: string; color: string; src?: string | null; frame?: string | null; speaking?: boolean }[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div key={p.id} className="rounded-full ring-[3px] ring-surface-3" style={{ marginLeft: i ? -size * 0.28 : 0, zIndex: shown.length - i }}>
          <Avatar name={p.name} color={p.color} src={p.src} frame={p.frame} size={size} speaking={p.speaking} />
        </div>
      ))}
      {extra > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-surface-4 text-[11px] font-bold text-fg-muted ring-[3px] ring-surface-3"
          style={{ width: size, height: size, marginLeft: -size * 0.28 }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
