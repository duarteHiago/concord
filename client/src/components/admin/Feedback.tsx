// Feedback no portal: a fila do que as pessoas mandaram (bug, sugestão, melhoria), com filtros, e o detalhe com os
// prints, o contexto técnico, a situação e a anotação (que a pessoa vê em "Meus envios").
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FEEDBACK_KINDS, FEEDBACK_RETENTION_DAYS, FEEDBACK_STATUSES } from '../../../../shared/feedback.ts';
import { api, getToken } from '../../lib/api';
import { toast } from '../../store/toast';
import { Button, cx } from '../ui';
import { Badge, Loading, Page, Pager, RowLink, Table, fmtDate, useAdminData } from './parts';

interface Item {
  id: string;
  kind: string;
  body: string;
  images: number;
  status: string;
  teamNote: string;
  createdAt: number;
  updatedAt: number;
  context: { commit?: string; path?: string; userAgent?: string; desktop?: string; screen?: string; area?: string };
  user: { id: string; username: string; displayName: string } | null;
}

const kindOf = (id: string) => FEEDBACK_KINDS.find((k) => k.id === id);
const statusOf = (id: string) => FEEDBACK_STATUSES.find((s) => s.id === id);
const statusTone = (s: string) => (s === 'novo' ? 'accent' : s === 'feito' ? 'ok' : s === 'vendo' || s === 'planejado' ? 'warn' : 'muted') as 'accent' | 'ok' | 'warn' | 'muted';

export function FeedbackList() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('abertos');
  const [kind, setKind] = useState('');
  const q = new URLSearchParams({ page: String(page), status, ...(kind ? { kind } : {}) });
  const { data, error } = useAdminData<{ items: Item[]; total: number; pageSize: number; counts: Record<string, number> }>(`/admin/feedback?${q}`);
  const chip = (active: boolean) => cx('rounded-full px-3 py-1 text-xs font-semibold', active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg-muted hover:text-fg');
  return (
    <Page title="Feedback" subtitle={`Bugs, sugestões e melhorias que as pessoas mandaram pelo app. Some ${FEEDBACK_RETENTION_DAYS} dias depois da última mudança.`}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[['abertos', 'Em aberto'], ['', 'Todos'], ...FEEDBACK_STATUSES.map((s) => [s.id, s.label])].map(([id, label]) => (
          <button key={id || 'todos'} className={chip(status === id)} onClick={() => (setStatus(id), setPage(0))}>
            {label}
            {data && id && id !== 'abertos' && data.counts[id] ? ` · ${data.counts[id]}` : ''}
          </button>
        ))}
        <span className="mx-1 w-px bg-line" />
        {[['', 'Tudo'], ...FEEDBACK_KINDS.map((k) => [k.id, `${k.emoji} ${k.label}`])].map(([id, label]) => (
          <button key={id || 'tudo'} className={chip(kind === id)} onClick={() => (setKind(id), setPage(0))}>
            {label}
          </button>
        ))}
      </div>
      <Loading data={data} error={error}>
        {(d) =>
          d.items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line-strong p-10 text-center">
              <p className="font-display font-bold">Nada por aqui</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">As pessoas mandam pelo botão de feedback na fileira de servidores (o balão com coração). Chega aqui.</p>
            </div>
          ) : (
            <>
              <Table head={['Tipo', 'Quem', 'O que disse', 'Prints', 'Situação', 'Chegou em']}>
                {d.items.map((x) => (
                  <RowLink
                    key={x.id}
                    href={`#feedback/${x.id}`}
                    cells={[
                      <span className="whitespace-nowrap">
                        {kindOf(x.kind)?.emoji} {kindOf(x.kind)?.label}
                      </span>,
                      <span className="font-semibold">{x.user ? `@${x.user.username}` : 'conta apagada'}</span>,
                      <span className="line-clamp-2 max-w-md text-fg-muted">{x.body}</span>,
                      x.images ? <Badge tone="accent">{x.images}</Badge> : <span className="text-fg-subtle">0</span>,
                      <Badge tone={statusTone(x.status)}>{statusOf(x.status)?.label ?? x.status}</Badge>,
                      <span className="whitespace-nowrap text-fg-muted">{fmtDate(x.createdAt)}</span>,
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

/** Print do feedback: a rota exige o token, então busca como arquivo e mostra o resultado. */
function Shot({ id, n }: { id: string; n: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    void fetch(`/api/admin/feedback/${id}/image/${n}`, { headers: { authorization: `Bearer ${getToken() ?? ''}` } })
      .then(async (r) => {
        const type = r.headers.get('content-type') ?? '';
        // só imagem: um arquivo de outro tipo aberto como blob rodaria na origem do portal
        if (!r.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) return null;
        return new Blob([await r.arrayBuffer()], { type });
      })
      .then((b) => {
        if (b) setUrl((made = URL.createObjectURL(b)));
      });
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, n]);
  if (!url) return <div className="aspect-video w-full animate-pulse rounded-2xl bg-surface-3" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl ring-1 ring-line">
      <img src={url} alt={`Print ${n + 1}`} className="w-full object-contain" />
    </a>
  );
}

export function FeedbackDetail({ id }: { id: string }) {
  const { data, error, reload } = useAdminData<Item>(`/admin/feedback/${id}`);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (patch: { status?: string; teamNote?: string }) => {
    setSaving(true);
    try {
      await api.patch(`/admin/feedback/${id}`, patch);
      toast.success(patch.status ? 'Situação atualizada (quem mandou recebe um aviso).' : 'Anotação salva.');
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    try {
      await api.del(`/admin/feedback/${id}`);
      toast.success('Feedback apagado.');
      location.hash = 'feedback';
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Loading data={data} error={error}>
      {(f) => (
        <Page
          back="#feedback"
          title={`${kindOf(f.kind)?.emoji ?? ''} ${kindOf(f.kind)?.label ?? f.kind} de ${f.user ? `@${f.user.username}` : 'uma conta apagada'}`}
          subtitle={`Chegou em ${fmtDate(f.createdAt)}${f.updatedAt !== f.createdAt ? ` · mudou em ${fmtDate(f.updatedAt)}` : ''}`}
          actions={
            <Button variant="ghost" className="h-9 px-3 text-danger" onClick={() => void remove()}>
              <Trash2 size={15} /> Apagar
            </Button>
          }
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className="rounded-2xl bg-surface-2 p-4 text-sm whitespace-pre-wrap ring-1 ring-line">{f.body}</div>
              {f.images > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: f.images }, (_, n) => (
                    <Shot key={n} id={f.id} n={n} />
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
                <div className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Situação</div>
                <div className="flex flex-wrap gap-1.5">
                  {FEEDBACK_STATUSES.map((s) => (
                    <button
                      key={s.id}
                      disabled={saving}
                      onClick={() => void save({ status: s.id })}
                      className={cx('rounded-full px-3 py-1 text-xs font-semibold', f.status === s.id ? 'bg-accent text-on-accent' : 'bg-surface-3 hover:bg-surface-4')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 mb-1 text-xs font-bold tracking-wide text-fg-muted uppercase">Resposta para a pessoa</div>
                <textarea
                  value={note ?? f.teamNote}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Aparece em Meus envios (ex.: Obrigado! Corrigido na versão de hoje.)"
                  className="w-full resize-none rounded-xl bg-surface-3 p-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
                <Button className="mt-2 h-8 px-3 text-xs" loading={saving} disabled={note === null || note === f.teamNote} onClick={() => void save({ teamNote: note ?? '' })}>
                  Salvar resposta
                </Button>
              </div>
              <div className="rounded-2xl bg-surface-2 p-4 text-xs ring-1 ring-line">
                <div className="mb-2 font-bold tracking-wide text-fg-muted uppercase">Contexto</div>
                <dl className="space-y-1">
                  {f.user && (
                    <div>
                      <dt className="inline text-fg-muted">Conta: </dt>
                      <dd className="inline">
                        <a className="text-accent hover:underline" href={`#contas/${f.user.id}`}>
                          {f.user.displayName} (@{f.user.username})
                        </a>
                      </dd>
                    </div>
                  )}
                  {(
                    [
                      ['Versão', f.context.commit],
                      ['App desktop', f.context.desktop],
                      ['Página', f.context.path],
                      ['Tela', f.context.screen],
                      ['Veio de um erro em', f.context.area],
                      ['Navegador', f.context.userAgent],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="break-words">
                        <dt className="inline text-fg-muted">{k}: </dt>
                        <dd className="inline">{v}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            </div>
          </div>
        </Page>
      )}
    </Loading>
  );
}
