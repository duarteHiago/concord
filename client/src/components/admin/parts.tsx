// Peças do portal da equipe: carregar dados da API, cabeçalho de página, números, gráfico de barras por dia e paginação.
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, api } from '../../lib/api';
import { Spinner, cx } from '../ui';

// ------------------------------------------------------------------ pecinhas compartilhadas

export function useAdminData<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({ path: null, data: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api.get<T>(path).then(
      (data) => alive && setState({ path, data, error: null }),
      (err) => alive && setState({ path, data: null, error: err instanceof ApiError ? err.message : String(err) }),
    );
    return () => {
      alive = false;
    };
  }, [path, version]);
  const fresh = state.path === path;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, reload: () => setVersion((v) => v + 1) };
}

export function Loading<T>({ data, error, children }: { data: T | null; error: string | null; children: (data: T) => ReactNode }) {
  if (error) return <p className="rounded-2xl bg-danger/10 p-4 text-sm text-danger">{error}</p>;
  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  return <>{children(data)}</>;
}

export function Page({ title, subtitle, back, actions, children }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="animate-fade-in">
      {back && (
        <a href={back} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
          <ArrowLeft size={15} /> Voltar
        </a>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-balance">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}


export const fmtDate = (ms: number) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtNumber = (n: number) => n.toLocaleString('pt-BR');
export const fmtSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
export const fmtDuration = (ms: number) => {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${Math.max(1, min)} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};

export function Stat({ label, value, hint, accent, href }: { label: string; value: number; hint?: string; accent?: boolean; href?: string }) {
  const body = (
    <>
      <span className="text-xs font-semibold text-fg-muted">{label}</span>
      <b className={cx('font-display text-3xl font-extrabold tabular-nums', accent && 'text-accent')}>{fmtNumber(value)}</b>
      {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
    </>
  );
  const cls = 'flex flex-col gap-0.5 rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line';
  return href ? (
    <a href={href} className={cx(cls, 'transition-colors hover:bg-surface-3')}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Barras por dia (últimos 30 dias), com o valor do dia sob o mouse. */
export function BarDays({ title, days }: { title: string; days: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const shown = hover !== null ? days[hover] : null;
  const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return (
    <div className="rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="text-xs text-fg-muted tabular-nums">{shown ? `${label(shown.day)}: ${fmtNumber(shown.count)}` : `${fmtNumber(total)} em 30 dias`}</span>
      </div>
      <div className="flex h-28 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <div key={d.day} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className={cx('w-full rounded-t-[4px] transition-colors', hover === i ? 'bg-accent' : 'bg-accent/45')}
              style={{ height: `${d.count ? Math.max(4, (d.count / max) * 100) : 2}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-fg-subtle">
        <span>{days[0] && label(days[0].day)}</span>
        <span>hoje</span>
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'ok' | 'warn' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-px text-[10.5px] font-bold whitespace-nowrap',
        tone === 'muted' && 'bg-surface-4 text-fg-muted',
        tone === 'accent' && 'bg-accent/15 text-accent',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-warn/15 text-warn',
      )}
    >
      {children}
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block w-full max-w-xs">
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-full bg-surface-3 pr-4 pl-9 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent/60"
      />
    </label>
  );
}

/** Espera a pessoa parar de digitar antes de buscar. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const btn = 'flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 hover:bg-surface-4 disabled:opacity-40';
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm text-fg-muted">
      <span className="tabular-nums">
        Página {page + 1} de {pages}
      </span>
      <button aria-label="Página anterior" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={16} />
      </button>
      <button aria-label="Próxima página" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** Tabela com rolagem lateral própria (a página nunca rola de lado). */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-3xl ring-1 ring-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-3/60 text-xs text-fg-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

/** Linha clicável que leva para o detalhe (o link fica na primeira célula, para o teclado). */
export function RowLink({ href, cells }: { href: string; cells: ReactNode[] }) {
  return (
    <tr className="cursor-pointer transition-colors hover:bg-surface-3/50" onClick={() => (location.hash = href.slice(1))}>
      {cells.map((c, i) => (
        <td key={i} className="px-4 py-2.5 align-middle">
          {i === 0 ? (
            <a href={href} className="outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
              {c}
            </a>
          ) : (
            c
          )}
        </td>
      ))}
    </tr>
  );
}
