// Diagnósticos no portal: a lista do que chegou e o detalhe de um, com os gráficos ao longo da gravação e as
// marcações ("travou agora") desenhadas por cima, para ver o que acontecia naquele instante.
import { Download, Flag, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../store/toast';
import { Avatar, Button, cx } from '../ui';
import { Badge, Loading, Page, Pager, RowLink, Table, fmtDate, fmtDuration, fmtSize, useAdminData } from './parts';

export interface DiagnosticMeta {
  id: string;
  user: { id: string; username: string; displayName: string } | null;
  note: string;
  startedAt: number;
  endedAt: number;
  samples: number;
  markers: number;
  mode: string | null;
  clientCommit: string | null;
  userAgent: string | null;
  size: number;
  createdAt: number;
}

/** Só o que os gráficos usam de cada leitura (o formato completo está em client/src/lib/devRecording.ts). */
interface Sample {
  t: string;
  latencyMs: number | null;
  connection?: { state: string; latencyMs: number | null; transport?: string };
  ui?: { fps: number | null; longTasks: number; longTaskMs: number };
  jsHeapUsedMB?: number;
  tracks?: { kind: string; isLocal: boolean; source: string; bitrateKbps: number; jitterMs?: number; packetsLost?: number; fps?: number; qualityLimitation?: string }[];
}

interface DiagnosticFile {
  startedAt: string;
  endedAt: string;
  environment: {
    mode?: string;
    userAgent?: string;
    clientCommit?: string;
    clientBuildTime?: string;
    devices?: { kind: string; label: string }[];
    server?: { version?: string };
    cpuCores?: number;
    gpuAdapter?: { vendor: string; renderer: string } | null;
    desktop?: { version?: string; platform?: string };
    system?: Record<string, unknown>;
  } | null;
  markers: { t: string; note: string }[];
  samples: Sample[];
}

// ------------------------------------------------------------------ lista

export function DiagnosticsList() {
  const [page, setPage] = useState(0);
  const { data, error } = useAdminData<{ items: DiagnosticMeta[]; total: number; pageSize: number }>(`/admin/diagnostics?page=${page}`);
  return (
    <Page title="Diagnósticos" subtitle="Gravações que as pessoas mandaram pela janela de diagnóstico. Cada uma é apagada 90 dias depois de chegar.">
      <Loading data={data} error={error}>
        {(d) =>
          d.items.length === 0 ? (
            <Empty />
          ) : (
            <>
              <Table head={['Quem', 'O que estava acontecendo', 'Duração', 'Marcações', 'Onde', 'Chegou em']}>
                {d.items.map((x) => (
                  <RowLink
                    key={x.id}
                    href={`#diagnosticos/${x.id}`}
                    cells={[
                      <span className="font-semibold">{x.user ? `@${x.user.username}` : 'conta apagada'}</span>,
                      <span className="line-clamp-2 max-w-sm text-fg-muted">{x.note || <i className="text-fg-subtle">sem descrição</i>}</span>,
                      <span className="tabular-nums">{fmtDuration(x.endedAt - x.startedAt)}</span>,
                      x.markers ? <Badge tone="accent">{x.markers}</Badge> : <span className="text-fg-subtle">0</span>,
                      <Badge>{x.mode === 'desktop' ? 'App desktop' : 'Navegador'}</Badge>,
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

function Empty() {
  return (
    <div className="rounded-3xl border border-dashed border-line-strong p-10 text-center">
      <p className="font-display font-bold">Nenhum diagnóstico por enquanto</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
        Quem tiver um problema grava em Configurações → Desenvolvedor (ou na janela de diagnóstico), para e clica em "Enviar para a equipe". Chega aqui.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ detalhe

export function DiagnosticDetail({ id }: { id: string }) {
  const meta = useAdminData<DiagnosticMeta>(`/admin/diagnostics/${id}`);
  const file = useAdminData<DiagnosticFile>(`/admin/diagnostics/${id}/file`);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    try {
      await api.del(`/admin/diagnostics/${id}`);
      toast.success('Diagnóstico apagado.');
      location.hash = 'diagnosticos';
    } catch (err) {
      toast.error(err);
    }
  }

  function download(d: DiagnosticFile, m: DiagnosticMeta) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `concord-diagnostico_${m.user?.username ?? 'conta'}_${new Date(m.startedAt).toISOString().slice(0, 16).replace(':', '')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <Loading data={meta.data} error={meta.error}>
      {(m) => (
        <Page
          back="#diagnosticos"
          title={m.user ? `Diagnóstico de @${m.user.username}` : 'Diagnóstico de uma conta apagada'}
          subtitle={`${fmtDate(m.startedAt)} · ${fmtDuration(m.endedAt - m.startedAt)} · ${m.samples} leituras · ${fmtSize(m.size)} compactado`}
          actions={
            <div className="flex flex-wrap gap-2">
              {file.data && (
                <Button variant="secondary" className="h-9 px-4" onClick={() => download(file.data!, m)}>
                  <Download size={15} /> Baixar .json
                </Button>
              )}
              {confirming ? (
                <>
                  <Button variant="ghost" className="h-9 px-4" onClick={() => setConfirming(false)}>
                    Cancelar
                  </Button>
                  <Button variant="danger" className="h-9 px-4" onClick={() => void remove()}>
                    Apagar de vez
                  </Button>
                </>
              ) : (
                <Button variant="ghost" className="h-9 px-4" onClick={() => setConfirming(true)}>
                  <Trash2 size={15} /> Apagar
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-6">
            <section className="flex gap-3 rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line">
              {m.user && <Avatar name={m.user.displayName} color="var(--color-accent-2)" size={36} />}
              <div className="min-w-0">
                <div className="text-sm">
                  {m.user ? (
                    <a href={`#contas/${m.user.id}`} className="font-bold hover:underline">
                      {m.user.displayName} <span className="font-normal text-fg-muted">@{m.user.username}</span>
                    </a>
                  ) : (
                    <b>Conta apagada</b>
                  )}
                </div>
                <p className={cx('mt-1 text-[15px] whitespace-pre-wrap', !m.note && 'text-fg-subtle italic')}>{m.note || 'A pessoa não escreveu o que estava acontecendo.'}</p>
              </div>
            </section>
            <Loading data={file.data} error={file.error}>
              {(d) => <Recording file={d} />}
            </Loading>
          </div>
        </Page>
      )}
    </Loading>
  );
}

function Recording({ file }: { file: DiagnosticFile }) {
  const start = Date.parse(file.startedAt);
  const end = Date.parse(file.endedAt);
  const markers = file.markers.map((mk) => ({ at: Date.parse(mk.t), note: mk.note }));
  const series = useMemo(() => buildSeries(file.samples), [file.samples]);
  const [cursor, setCursor] = useState<number | null>(null);
  const env = file.environment;

  return (
    <div className="space-y-6">
      {markers.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold">Momentos marcados</h2>
          <ol className="flex flex-wrap gap-2">
            {markers.map((mk, i) => (
              <li key={i}>
                <button
                  onMouseEnter={() => setCursor(mk.at)}
                  onMouseLeave={() => setCursor(null)}
                  onFocus={() => setCursor(mk.at)}
                  onBlur={() => setCursor(null)}
                  className="flex items-center gap-2 rounded-full bg-accent-2/12 px-3 py-1.5 text-sm hover:bg-accent-2/20"
                >
                  <Flag size={13} className="text-accent-2" />
                  <span className="font-mono text-xs text-fg-muted tabular-nums">{offset(mk.at - start)}</span>
                  {mk.note}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {series.map((s) => (
          <TimeChart key={s.title} {...s} start={start} end={end} markers={markers} cursor={cursor} onCursor={setCursor} />
        ))}
      </section>

      {series.length === 0 && <p className="text-sm text-fg-muted">Esta gravação não tem leituras.</p>}

      <section className="grid gap-4 lg:grid-cols-2">
        <Facts
          title="Ambiente"
          rows={[
            ['Onde', env?.mode === 'desktop' ? `App desktop ${env.desktop?.version ?? ''}` : 'Navegador'],
            ['Navegador', env?.userAgent],
            ['Versão do app', env?.clientCommit && `${env.clientCommit}${env.clientBuildTime ? ` · ${fmtDate(Date.parse(env.clientBuildTime))}` : ''}`],
            ['Servidor', env?.server?.version],
            ['Processador', env?.cpuCores ? `${env.cpuCores} núcleos` : undefined],
            ['Placa de vídeo', env?.gpuAdapter?.renderer],
          ]}
        />
        <Facts
          title="Dispositivos"
          rows={(env?.devices ?? []).map((dv): [string, string] => [dv.kind === 'audioinput' ? 'Microfone' : dv.kind === 'audiooutput' ? 'Saída de áudio' : 'Câmera', dv.label || 'sem nome'])}
          empty="Nenhum dispositivo informado."
        />
      </section>
      {env?.system && (
        <details className="rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line">
          <summary className="cursor-pointer text-sm font-bold">Sistema (app desktop)</summary>
          <pre className="mt-3 overflow-x-auto text-xs text-fg-muted">{JSON.stringify(env.system, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function Facts({ title, rows, empty }: { title: string; rows: [string, string | null | undefined][]; empty?: string }) {
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  return (
    <div className="rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      {shown.length === 0 ? (
        <p className="text-sm text-fg-subtle">{empty ?? 'Sem dados.'}</p>
      ) : (
        <dl className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
          {shown.map(([k, v], i) => (
            <div key={i} className="contents">
              <dt className="text-fg-muted">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const offset = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ------------------------------------------------------------------ séries e gráfico

interface Series {
  title: string;
  hint: string;
  unit: string;
  color: string;
  points: { at: number; v: number }[];
  /** linha de "ruim acima disto" */
  warnAbove?: number;
  /** linha de "ruim abaixo disto" */
  warnBelow?: number;
}

function buildSeries(samples: Sample[]): Series[] {
  const pick = (fn: (s: Sample) => number | null | undefined) =>
    samples.flatMap((s) => {
      const v = fn(s);
      return typeof v === 'number' && Number.isFinite(v) ? [{ at: Date.parse(s.t), v }] : [];
    });
  const remoteAudio = (s: Sample) => (s.tracks ?? []).filter((t) => t.kind === 'audio' && !t.isLocal);
  const list: Series[] = [
    {
      title: 'Latência até o servidor',
      hint: 'Ida e volta pelo socket. Acima de 150 ms a conversa começa a parecer atrasada.',
      unit: 'ms',
      color: 'var(--color-accent)',
      points: pick((s) => s.connection?.latencyMs ?? s.latencyMs),
      warnAbove: 150,
    },
    {
      title: 'Fluidez da interface',
      hint: 'Quadros por segundo do app. Abaixo de 30 a tela parece travada.',
      unit: 'fps',
      color: 'var(--color-ok)',
      points: pick((s) => s.ui?.fps),
      warnBelow: 30,
    },
    {
      title: 'Travamentos da interface',
      hint: 'Tempo preso em tarefas acima de 50 ms, a cada leitura de 2 s.',
      unit: 'ms',
      color: 'var(--color-warn)',
      points: pick((s) => s.ui?.longTaskMs),
    },
    {
      title: 'Jitter do áudio recebido',
      hint: 'Variação no tempo de chegada da voz dos outros (o pior entre eles). Acima de 30 ms a voz picota.',
      unit: 'ms',
      color: 'var(--color-accent-2)',
      points: pick((s) => {
        const j = remoteAudio(s).flatMap((t) => (t.jitterMs === undefined ? [] : [t.jitterMs]));
        return j.length ? Math.max(...j) : null;
      }),
      warnAbove: 30,
    },
    {
      title: 'Dados de áudio e vídeo',
      hint: 'Soma do que está entrando e saindo pelas faixas da sala.',
      unit: 'kbps',
      color: 'var(--color-live)',
      points: pick((s) => (s.tracks?.length ? s.tracks.reduce((n, t) => n + (t.bitrateKbps || 0), 0) : null)),
    },
    {
      title: 'Memória do app',
      hint: 'Memória JavaScript em uso. Subindo sem parar costuma ser vazamento.',
      unit: 'MB',
      color: 'var(--color-fg-muted)',
      points: pick((s) => s.jsHeapUsedMB),
    },
  ];
  return list.filter((s) => s.points.length >= 2);
}

const W = 600;
const H = 150;
const PAD_L = 40;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 20;

function TimeChart({
  title,
  hint,
  unit,
  color,
  points,
  warnAbove,
  warnBelow,
  start,
  end,
  markers,
  cursor,
  onCursor,
}: Series & { start: number; end: number; markers: { at: number; note: string }[]; cursor: number | null; onCursor: (t: number | null) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const span = Math.max(1, end - start);
  const top = Math.max(...points.map((p) => p.v), warnAbove ?? 0, warnBelow ?? 0) * 1.1 || 1;
  const x = (t: number) => PAD_L + ((t - start) / span) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points[points.length - 1].at).toFixed(1)} ${H - PAD_B} L${x(points[0].at).toFixed(1)} ${H - PAD_B} Z`;
  const ticks = [0, top / 2, top / 1.1];

  // valor mais perto do cursor (do mouse aqui ou do momento marcado sob o mouse)
  const near = cursor === null ? null : points.reduce((best, p) => (Math.abs(p.at - cursor) < Math.abs(best.at - cursor) ? p : best), points[0]);
  const avg = points.reduce((n, p) => n + p.v, 0) / points.length;
  const peak = Math.max(...points.map((p) => p.v));
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('pt-BR') : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

  function move(e: PointerEvent<SVGSVGElement>) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    onCursor(start + ((px - PAD_L) / (W - PAD_L - PAD_R)) * span);
  }

  return (
    <figure className="rounded-3xl bg-surface-3/60 p-4 ring-1 ring-line">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-xs text-fg-muted tabular-nums">
          {near ? (
            <>
              <b className="text-fg">
                {fmt(near.v)} {unit}
              </b>{' '}
              em {offset(near.at - start)}
            </>
          ) : (
            <>
              média {fmt(avg)} · pico {fmt(peak)} {unit}
            </>
          )}
        </span>
      </figcaption>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        onPointerMove={move}
        onPointerLeave={() => onCursor(null)}
        role="img"
        aria-label={`${title}: média ${fmt(avg)} ${unit}, pico ${fmt(peak)} ${unit}`}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
            <text x={PAD_L - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--color-fg-subtle)">
              {fmt(v)}
            </text>
          </g>
        ))}
        {[warnAbove, warnBelow].map(
          (w, i) =>
            w !== undefined && (
              <line key={i} x1={PAD_L} x2={W - PAD_R} y1={y(w)} y2={y(w)} stroke="var(--color-danger)" strokeDasharray="4 4" strokeOpacity="0.6" />
            ),
        )}
        <path d={area} fill={color} fillOpacity="0.14" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {markers.map((mk, i) => (
          <g key={i}>
            <line x1={x(mk.at)} x2={x(mk.at)} y1={PAD_T} y2={H - PAD_B} stroke="var(--color-accent-2)" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx={x(mk.at)} cy={PAD_T} r="3.5" fill="var(--color-accent-2)" />
          </g>
        ))}
        {near && (
          <>
            <line x1={x(near.at)} x2={x(near.at)} y1={PAD_T} y2={H - PAD_B} stroke="var(--color-fg-muted)" strokeOpacity="0.5" />
            <circle cx={x(near.at)} cy={y(near.v)} r="4" fill={color} stroke="var(--color-surface-3)" strokeWidth="2" />
          </>
        )}
        <text x={PAD_L} y={H - 5} fontSize="10" fill="var(--color-fg-subtle)">
          0:00
        </text>
        <text x={W - PAD_R} y={H - 5} fontSize="10" textAnchor="end" fill="var(--color-fg-subtle)">
          {offset(span)}
        </text>
      </svg>
      <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
    </figure>
  );
}
