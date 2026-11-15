// Fator de Confiança no portal da equipe: a nota exata e o que entrou nela (só a equipe vê; ver shared/trust.ts).
import { BAND_INFO, LEVEL_INFO, type TrustBand, type TrustItem, type TrustLevel } from '../../../../shared/trust.ts';
import { cx } from '../ui';
import { Badge } from './parts';

export interface TrustBrief {
  score: number;
  band: TrustBand;
  level: TrustLevel;
}

const TONE: Record<TrustBand, 'warn' | 'muted' | 'ok'> = { low: 'warn', normal: 'muted', high: 'ok' };

export function TrustBadge({ trust }: { trust: TrustBrief | null | undefined }) {
  if (!trust) return null;
  return (
    <Badge tone={TONE[trust.band]}>
      confiança {trust.score} · {BAND_INFO[trust.band].label}
    </Badge>
  );
}

/** A nota, a faixa, o nível e cada item que somou ou tirou pontos. */
export function TrustBreakdown({ trust, items }: { trust: TrustBrief; items: TrustItem[] }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-3xl font-bold tabular-nums">{trust.score}</span>
        <TrustBadge trust={trust} />
        <span className="text-xs text-fg-muted">{LEVEL_INFO[trust.level].label}</span>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span className="text-fg-muted">{i.label}</span>
            <span className={cx('font-semibold tabular-nums', i.points < 0 ? 'text-danger' : 'text-ok')}>
              {i.points > 0 ? '+' : ''}
              {i.points}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
