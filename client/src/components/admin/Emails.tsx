// Portal da equipe: e-mails enviados (código do cadastro, confirmação, senha) contra o limite diário do plano do
// Brevo. Se o limite estourar, ninguém mais consegue terminar o cadastro naquele dia: é a métrica para acompanhar
// numa divulgação grande. O dia é o do Brevo (UTC, vira às 21h no horário de Brasília).
import { AlertTriangle } from 'lucide-react';
import { cx } from '../ui';
import { BarDays, Loading, Page, Stat, fmtNumber, useAdminData } from './parts';

type Kind = 'signup' | 'verify' | 'reset' | 'password' | 'email-changed';
interface Day {
  day: string;
  sent: number;
  failed: number;
  byKind: Partial<Record<Kind, number>>;
}
interface MailData {
  enabled: boolean;
  limit: number;
  days: Day[];
  today: Day;
  plan: { plan: string; credits: number | null; creditsType: string | null } | null;
}

const KIND_LABEL: Record<Kind, string> = {
  signup: 'Código do cadastro',
  verify: 'Confirmar e-mail',
  reset: 'Esqueci a senha',
  password: 'Senha trocada',
  'email-changed': 'E-mail trocado',
};

export function EmailsPage() {
  const { data, error } = useAdminData<MailData>('/admin/mail');
  return (
    <Page title="E-mails" subtitle="Quantos e-mails o Concord mandou hoje e se está perto do limite do plano de envio">
      <Loading data={data} error={error}>
        {(d) => {
          const used = d.today.sent + d.today.failed;
          const pct = Math.min(100, Math.round((used / d.limit) * 100));
          const tone = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warn' : 'bg-ok';
          const week = d.days.slice(-7).reduce((n, x) => n + x.sent, 0);
          const peak = d.days.reduce((m, x) => Math.max(m, x.sent), 0);
          return (
            <div className="space-y-5">
              {!d.enabled && (
                <div className="rounded-2xl bg-surface-3 p-4 text-sm text-fg-muted">O envio de e-mail está desligado nesta instalação (sem BREVO_API_KEY ou MAIL_FROM).</div>
              )}
              <div className="rounded-3xl bg-surface-3/60 p-5 ring-1 ring-line">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold">Hoje (dia do Brevo, vira às 21h de Brasília)</h2>
                  <span className="text-sm text-fg-muted tabular-nums">
                    <b className="text-fg">{fmtNumber(used)}</b> de {fmtNumber(d.limit)} ({pct}%)
                  </span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-4">
                  <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
                {pct >= 70 && (
                  <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-danger">
                    <AlertTriangle size={16} />
                    {pct >= 100 ? 'Limite atingido: novos cadastros não recebem o código até o dia virar.' : 'Perto do limite: se passar, novos cadastros não recebem o código até o dia virar.'}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <div key={k} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                      <span className="text-fg-muted">{KIND_LABEL[k]}</span>
                      <b className="tabular-nums">{fmtNumber(d.today.byKind[k] ?? 0)}</b>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                    <span className="text-fg-muted">Falharam</span>
                    <b className={cx('tabular-nums', d.today.failed > 0 && 'text-danger')}>{fmtNumber(d.today.failed)}</b>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Limite por dia" value={d.limit} hint="MAIL_DAILY_LIMIT" />
                <Stat label="Últimos 7 dias" value={week} />
                <Stat label="Pico em 30 dias" value={peak} />
                <Stat label={d.plan?.creditsType === 'sendLimit' ? 'Créditos no Brevo' : 'Créditos (Brevo)'} value={d.plan?.credits ?? 0} hint={d.plan ? `plano ${d.plan.plan}` : 'não deu para consultar'} />
              </div>
              <BarDays title="E-mails enviados por dia" days={d.days.map((x) => ({ day: x.day, count: x.sent }))} />
            </div>
          );
        }}
      </Loading>
    </Page>
  );
}
