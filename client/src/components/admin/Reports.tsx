// Denúncias no portal da equipe: a fila (das mais graves para as mais leves) e o detalhe com a prova guardada na
// hora. As ações aqui são arquivar, apagar a mensagem e encerrar a transmissão; suspender a conta é na página da
// conta (o link fica no detalhe). Ver server/src/reports.ts.
import { ExternalLink, MonitorX, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { REPORT_CATEGORIES, REPORT_CATEGORY_INFO, type ReportCategory } from '../../../../shared/reports.ts';
import { api } from '../../lib/api';
import { toast } from '../../store/toast';
import { Button, cx } from '../ui';
import { Badge, Loading, Page, Pager, RowLink, Table, fmtDate, useAdminData } from './parts';
import { TrustBadge, TrustBreakdown, type TrustBrief } from './Trust';
import type { TrustItem } from '../../../../shared/trust.ts';

type Kind = 'message' | 'dm_message' | 'user' | 'stream';

interface ReportSummary {
  id: string;
  kind: Kind;
  category: ReportCategory;
  /** o motivo que a equipe confirmou ao agir (é o que pesa na confiança) */
  confirmedCategory: ReportCategory | null;
  reporter: string | null;
  reporterTrust: TrustBrief | null;
  target: { id: string; username: string; deleted: boolean; suspended: boolean; trust: TrustBrief | null };
  status: 'open' | 'resolved';
  outcome: 'dismissed' | 'actioned' | null;
  createdAt: number;
  resolvedAt: number | null;
}

interface ReportDetailData extends ReportSummary {
  details: string | null;
  note: string | null;
  resolvedBy: string | null;
  place: string | null;
  message: { content: string; kind: string; createdAt: number; attachments: number; stillThere: boolean } | null;
  frames: string[];
  files: string[];
  expired: boolean;
  streamingNow: boolean;
  otherReports: number;
  /** pessoas diferentes que denunciaram o mesmo caso */
  reporters: number;
  targetTrustItems: TrustItem[];
  retentionDays: number;
}

const KIND_LABEL: Record<Kind, string> = { message: 'Mensagem', dm_message: 'Mensagem direta', user: 'Conta', stream: 'Transmissão' };
const GRAVE: ReportCategory[] = ['csam', 'violence', 'nudity'];

function CategoryBadge({ category }: { category: ReportCategory }) {
  return <Badge tone={GRAVE.includes(category) ? 'warn' : 'muted'}>{REPORT_CATEGORY_INFO[category].label}</Badge>;
}

export function ReportsList() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [page, setPage] = useState(0);
  const { data, error } = useAdminData<{ items: ReportSummary[]; total: number; open: number; pageSize: number }>(`/admin/reports?status=${status}&page=${page}`);
  return (
    <Page
      title="Denúncias"
      subtitle="O que as pessoas denunciaram no app. As abertas vêm das mais graves para as mais leves. A prova some 90 dias depois de resolvida (menos nas de abuso infantil)."
      actions={
        <div className="flex gap-1 rounded-full bg-surface-3 p-1">
          {(['open', 'resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s);
                setPage(0);
              }}
              className={cx('rounded-full px-4 py-1.5 text-sm font-semibold', status === s ? 'bg-accent text-on-accent' : 'text-fg-muted hover:text-fg')}
            >
              {s === 'open' ? `Abertas${data ? ` (${data.open})` : ''}` : 'Resolvidas'}
            </button>
          ))}
        </div>
      }
    >
      <Loading data={data} error={error}>
        {(d) =>
          d.items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line-strong p-10 text-center">
              <p className="font-display font-bold">{status === 'open' ? 'Nenhuma denúncia aberta' : 'Nenhuma denúncia resolvida ainda'}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
                As pessoas denunciam pelo botão de bandeira nas mensagens, no cartão de alguém ou no quadro de uma transmissão.
              </p>
            </div>
          ) : (
            <>
              <Table head={['Motivo', 'O quê', 'Denunciado', 'Quem denunciou', status === 'open' ? 'Chegou em' : 'Resolvida em']}>
                {d.items.map((r) => (
                  <RowLink
                    key={r.id}
                    href={`#denuncias/${r.id}`}
                    cells={[
                      <CategoryBadge category={r.category} />,
                      <span>{KIND_LABEL[r.kind]}</span>,
                      <span className="font-semibold">
                        @{r.target.username} {r.target.suspended && <Badge tone="warn">suspensa</Badge>} {r.target.deleted && <Badge>apagada</Badge>}
                        {' '}
                        <TrustBadge trust={r.target.trust} />
                      </span>,
                      <span className="text-fg-muted">{r.reporter ? `@${r.reporter}` : 'conta apagada'}</span>,
                      <span className="whitespace-nowrap text-fg-muted">{fmtDate(status === 'open' ? r.createdAt : (r.resolvedAt ?? r.createdAt))}</span>,
                    ]}
                  />
                ))}
              </Table>
              <Pager page={page} total={d.total} pageSize={d.pageSize} onPage={setPage} />
            </>
          )
        }
      </Loading>
    </Page>
  );
}

export function ReportDetail({ id }: { id: string }) {
  const { data, error, reload } = useAdminData<ReportDetailData>(`/admin/reports/${id}`);
  const [note, setNote] = useState('');
  // o motivo confirmado ao agir (vazio: o que quem denunciou escolheu)
  const [confirmed, setConfirmed] = useState<ReportCategory | ''>('');
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: string, body: Record<string, unknown> = {}, done = 'Feito.', key = action) {
    setBusy(key);
    try {
      await api.post(`/admin/reports/${id}/${action}`, { note: note.trim() || undefined, category: confirmed || undefined, ...body });
      toast.success(done);
      setNote('');
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Loading data={data} error={error}>
      {(r) => (
        <Page
          back="#denuncias"
          title={`${KIND_LABEL[r.kind]} de @${r.target.username}`}
          subtitle={`${REPORT_CATEGORY_INFO[r.category].label} · denunciada por ${r.reporter ? `@${r.reporter}` : 'conta apagada'} em ${fmtDate(r.createdAt)}${r.place ? ` · ${r.place}` : ''}`}
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {r.details && (
                <Box title="O que quem denunciou contou">
                  <p className="text-sm whitespace-pre-wrap">{r.details}</p>
                </Box>
              )}
              {r.expired ? (
                <Box title="Prova">
                  <p className="text-sm text-fg-muted">A prova foi apagada {r.retentionDays} dias depois de a denúncia ser resolvida. Ficou só o registro.</p>
                </Box>
              ) : (
                <>
                  {r.message && (
                    <Box title={`A mensagem, como estava em ${fmtDate(r.message.createdAt)}`}>
                      <p className="rounded-2xl bg-surface-1 p-3 text-sm whitespace-pre-wrap">{r.message.content || <i className="text-fg-subtle">sem texto</i>}</p>
                      <p className="mt-2 text-xs text-fg-muted">
                        {r.message.attachments ? `${r.message.attachments} anexo(s). ` : ''}
                        {r.message.stillThere ? 'A mensagem ainda está no ar.' : 'A mensagem já foi apagada (esta é a cópia guardada na denúncia).'}
                      </p>
                    </Box>
                  )}
                  {(r.frames.length > 0 || r.files.length > 0) && (
                    <Box title={r.frames.length ? 'Imagens da tela no momento da denúncia' : 'Imagens anexadas'}>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[...r.frames, ...r.files].map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-black">
                            <img src={src} alt={`Prova ${i + 1}`} className="max-h-72 w-full object-contain" />
                          </a>
                        ))}
                      </div>
                    </Box>
                  )}
                  {r.kind === 'stream' && r.frames.length === 0 && (
                    <Box title="Prova">
                      <p className="text-sm text-fg-muted">Quem denunciou não mandou imagens da tela.</p>
                    </Box>
                  )}
                </>
              )}
            </div>

            <div className="space-y-4">
              <Box title="Quem foi denunciado">
                <p className="font-semibold">
                  @{r.target.username} {r.target.suspended && <Badge tone="warn">suspensa</Badge>} {r.target.deleted && <Badge>apagada</Badge>}
                </p>
                <p className="mt-1 text-xs text-fg-muted">{r.otherReports ? `${r.otherReports} outra(s) denúncia(s) contra essa conta.` : 'Nenhuma outra denúncia contra essa conta.'}</p>
                {r.reporters > 1 && <p className="mt-1 text-xs font-semibold text-warn">{r.reporters} pessoas diferentes denunciaram este mesmo caso.</p>}
                {r.target.trust && (
                  <div className="mt-3 rounded-2xl bg-surface-1 p-3">
                    <TrustBreakdown trust={r.target.trust} items={r.targetTrustItems} />
                  </div>
                )}
                {!r.target.deleted && (
                  <a href={`#contas/${r.target.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                    <ExternalLink size={14} /> Abrir a conta (suspender fica lá)
                  </a>
                )}
              </Box>

              <Box title="Quem denunciou">
                <p className="font-semibold">{r.reporter ? `@${r.reporter}` : 'conta apagada'}</p>
                {r.reporterTrust && (
                  <p className="mt-1">
                    <TrustBadge trust={r.reporterTrust} />
                  </p>
                )}
              </Box>

              {r.status === 'open' ? (
                <Box title="Decidir">
                  <label className="mb-3 block">
                    <span className="mb-1 block text-xs text-fg-muted">Motivo confirmado (se a equipe agir, é ele que baixa a confiança)</span>
                    <select
                      value={confirmed || r.category}
                      onChange={(e) => setConfirmed(e.target.value as ReportCategory)}
                      className="h-9 w-full rounded-2xl bg-surface-1 px-3 text-sm outline-none focus:ring-1 focus:ring-accent"
                    >
                      {REPORT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {REPORT_CATEGORY_INFO[c].label}
                          {c === r.category ? ' (o que foi denunciado)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Anotação da equipe (opcional)"
                    className="mb-3 w-full resize-none rounded-2xl bg-surface-1 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="flex flex-col gap-2">
                    {r.message?.stillThere && (
                      <Button variant="danger" loading={busy === 'delete-message'} onClick={() => void act('delete-message', {}, 'Mensagem apagada e denúncia resolvida.')}>
                        <Trash2 size={15} /> Apagar a mensagem
                      </Button>
                    )}
                    {r.kind === 'stream' && r.streamingNow && (
                      <Button variant="danger" loading={busy === 'stop-stream'} onClick={() => void act('stop-stream', {}, 'Transmissão encerrada e denúncia resolvida.')}>
                        <MonitorX size={15} /> Encerrar a transmissão
                      </Button>
                    )}
                    <Button variant="secondary" loading={busy === 'resolve-actioned'} onClick={() => void act('resolve', { outcome: 'actioned' }, 'Denúncia resolvida.', 'resolve-actioned')}>
                      Já agi (por exemplo, suspendi a conta)
                    </Button>
                    <Button variant="ghost" loading={busy === 'resolve'} onClick={() => void act('resolve', { outcome: 'dismissed' }, 'Denúncia arquivada.')}>
                      Arquivar: nada a fazer
                    </Button>
                  </div>
                  {r.category === 'csam' && (
                    <p className="mt-3 rounded-2xl bg-warn/10 p-3 text-xs">
                      Abuso infantil: suspenda a conta e denuncie à SaferNet (denuncie.org.br) ou à Polícia Federal. A prova desta denúncia não é apagada
                      automaticamente.
                    </p>
                  )}
                </Box>
              ) : (
                <Box title="Decisão">
                  <p className="text-sm">
                    <Badge tone={r.outcome === 'actioned' ? 'ok' : 'muted'}>{r.outcome === 'actioned' ? 'A equipe agiu' : 'Arquivada'}</Badge>
                  </p>
                  {r.outcome === 'actioned' && r.confirmedCategory && (
                    <p className="mt-2 text-xs text-fg-muted">
                      Motivo confirmado: <b className="text-fg">{REPORT_CATEGORY_INFO[r.confirmedCategory].label}</b>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-fg-muted">
                    {r.resolvedBy ? `por @${r.resolvedBy}` : ''} {r.resolvedAt ? `em ${fmtDate(r.resolvedAt)}` : ''}
                  </p>
                  {r.note && <p className="mt-2 text-sm whitespace-pre-wrap">{r.note}</p>}
                  {!r.expired && (
                    <Button variant="ghost" className="mt-3" loading={busy === 'reopen'} onClick={() => void act('reopen', {}, 'Denúncia reaberta.')}>
                      <RotateCcw size={15} /> Reabrir
                    </Button>
                  )}
                </Box>
              )}
            </div>
          </div>
        </Page>
      )}
    </Loading>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line">
      <h2 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}
