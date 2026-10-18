import { X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
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
  className,
}: {
  name: string;
  color: string;
  src?: string | null;
  size?: number;
  status?: 'online' | 'offline' | null;
  speaking?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('avatar relative shrink-0', className)} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className={cx('h-full w-full rounded-full object-cover transition-shadow', speaking && 'speaking-ring')}
        />
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
      {status && (
        <span
          className={cx(
            'absolute -right-0.5 -bottom-0.5 rounded-full border-[3px] border-surface-1',
            status === 'online' ? 'bg-ok' : 'bg-fg-subtle',
          )}
          style={{ width: Math.max(12, size * 0.34), height: Math.max(12, size * 0.34) }}
        />
      )}
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

export function Input({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-bold text-fg-muted">{label}</span>}
      <input
        {...props}
        className={cx(
          'h-11 w-full rounded-2xl border border-transparent bg-surface-3 px-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent',
          className,
        )}
      />
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
  people: { id: string; name: string; color: string; src?: string | null; speaking?: boolean }[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div key={p.id} className="rounded-full ring-[3px] ring-surface-3" style={{ marginLeft: i ? -size * 0.28 : 0, zIndex: shown.length - i }}>
          <Avatar name={p.name} color={p.color} src={p.src} size={size} speaking={p.speaking} />
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
