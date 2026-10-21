// Janela independente de diagnóstico ("Modo desenvolvedor"). Roda em outra janela/aba (ver
// App.tsx e lib/desktop.ts) e só recebe dados pelo BroadcastChannel de lib/devStats.ts — a
// Room do LiveKit e a ponte do desktop só existem na janela principal.
import { Fragment, useState, type ReactNode } from 'react';
import { type DevHistory, type DevSnapshot, type DevTrackStat, useDevHistory, useDevStatsSubscriber } from '../lib/devStats';
import { LiveChart } from './LiveChart';
import { cx } from './ui';

type Tab = 'geral' | 'cpu' | 'gpu' | 'rede';

const TABS: [Tab, string][] = [
  ['geral', 'Geral'],
  ['cpu', 'CPU'],
  ['gpu', 'GPU'],
  ['rede', 'Rede'],
];

export function DevWindow() {
  const snapshot = useDevStatsSubscriber();
  const history = useDevHistory(snapshot);
  const [tab, setTab] = useState<Tab>('geral');

  return (
    <div className="flex h-full flex-col bg-surface-0 text-fg">
      <header className="flex items-center gap-1 border-b border-line px-4 pt-3">
        <h1 className="mr-4 text-sm font-bold whitespace-nowrap">Concord · Diagnóstico</h1>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx('-mb-px border-b-2 px-3 pb-2 text-sm font-semibold', tab === id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}
          >
            {label}
          </button>
        ))}
        <span className={cx('ml-auto mb-2 h-2 w-2 rounded-full', snapshot ? 'bg-ok' : 'bg-fg-subtle')} title={snapshot ? 'Recebendo dados' : 'Sem dados'} />
      </header>
      <main className="flex-1 overflow-y-auto p-5">
        {!snapshot ? (
          <p className="text-sm text-fg-muted">Aguardando dados do Concord — deixe a janela principal aberta e com a sua conta conectada.</p>
        ) : (
          <>
            {tab === 'geral' && <GeralTab snapshot={snapshot} history={history} />}
            {tab === 'cpu' && <CpuTab snapshot={snapshot} history={history} />}
            {tab === 'gpu' && <GpuTab snapshot={snapshot} history={history} />}
            {tab === 'rede' && <RedeTab snapshot={snapshot} history={history} />}
          </>
        )}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ pecinhas reutilizadas

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">{children}</h2>;
}

function InfoGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span className="text-fg-muted">{label}</span>
          <span className="truncate font-mono text-xs text-fg">{value}</span>
        </Fragment>
      ))}
    </div>
  );
}

function StatTile({ label, value, trend, color, unit }: { label: string; value: string; trend?: number[]; color?: string; unit?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {trend && trend.length > 1 && (
        <div className="mt-2">
          <LiveChart data={trend} color={color} height={32} unit={unit} />
        </div>
      )}
    </div>
  );
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** Electron devolve o GPUInfo com formato solto; pega só o que interessa pro diagnóstico (decode/encode/compositing). */
function gpuFeatureRows(gpu: unknown): [string, string][] {
  if (!gpu || typeof gpu !== 'object') return [];
  const featureStatus = (gpu as { featureStatus?: Record<string, string> }).featureStatus;
  if (!featureStatus) return [];
  return Object.entries(featureStatus)
    .filter(([k]) => /video|gpu_compositing|webgl/.test(k))
    .map(([k, v]): [string, string] => [k, v]);
}

// ------------------------------------------------------------------ Geral

function GeralTab({ snapshot, history }: { snapshot: DevSnapshot; history: DevHistory }) {
  const videoTrack = snapshot.tracks.find((t) => t.kind === 'video');
  const envRows: [string, string][] = [
    ['Modo', snapshot.mode === 'desktop' ? 'App desktop' : 'Navegador (web)'],
    ['Build do cliente', new Date(snapshot.clientBuildTime).toLocaleString('pt-BR')],
  ];
  if (snapshot.desktop) envRows.push(['Versão do app', snapshot.desktop.version], ['Plataforma', snapshot.desktop.platform]);
  if (snapshot.desktopInfo) envRows.push(['Electron', snapshot.desktopInfo.versions.electron ?? '?'], ['Chromium', snapshot.desktopInfo.versions.chrome ?? '?']);
  envRows.push(['Servidor', snapshot.health.version ? `v${snapshot.health.version}` : '?'], ['No ar há', snapshot.health.uptimeSec !== undefined ? formatUptime(snapshot.health.uptimeSec) : '?']);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Latência com o servidor" value={snapshot.health.latencyMs !== null ? `${snapshot.health.latencyMs} ms` : '?'} trend={history.latencyMs} unit="ms" />
        <StatTile label="Memória do cliente" value={snapshot.performance.jsHeapUsedMB !== undefined ? `${snapshot.performance.jsHeapUsedMB} MB` : '?'} trend={history.jsHeapUsedMB} unit="MB" />
        <StatTile label="Faixas de áudio/vídeo ativas" value={String(snapshot.tracks.length)} />
        <StatTile
          label="Codificação de vídeo"
          value={videoTrack ? (videoTrack.hardwareAccelerated ? 'GPU' : videoTrack.hardwareAccelerated === false ? 'CPU' : '?') : '— nenhuma —'}
        />
      </div>

      <section>
        <SectionTitle>Supressão de ruído</SectionTitle>
        <InfoGrid rows={[['Motor ativo', snapshot.voice?.noiseMode ?? '?'], ['Portão de voz', snapshot.voice?.gateOn ? 'ligado' : 'desligado']]} />
      </section>

      <section>
        <SectionTitle>Ambiente</SectionTitle>
        <InfoGrid rows={envRows} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ CPU

function CpuTab({ snapshot, history }: { snapshot: DevSnapshot; history: DevHistory }) {
  const procs = Object.values(history.processes);
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Memória JS do cliente (heap)</SectionTitle>
        <LiveChart data={history.jsHeapUsedMB} formatValue={(v) => `${Math.round(v)}`} unit=" MB" height={72} />
      </section>

      <section>
        <SectionTitle>Processos do Concord</SectionTitle>
        {snapshot.mode !== 'desktop' ? (
          <p className="text-sm text-fg-muted">CPU por processo só está disponível no app desktop — na web o navegador não expõe isso pra uma página.</p>
        ) : procs.length === 0 ? (
          <p className="text-sm text-fg-muted">Ainda sem leituras.</p>
        ) : (
          <div className="space-y-3">
            {procs.map((p) => (
              <div key={p.meta.pid} className="rounded-xl bg-surface-2 p-3">
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-semibold">
                    {p.meta.type} <span className="font-mono text-xs text-fg-subtle">pid {p.meta.pid}</span>
                  </span>
                  <span className="font-mono text-xs text-fg-muted">{p.meta.memoryMB !== null ? `${p.meta.memoryMB} MB` : '?'}</span>
                </div>
                <LiveChart data={p.cpuPercent} formatValue={(v) => v.toFixed(1)} unit="%" height={44} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Outros números</SectionTitle>
        <InfoGrid rows={[['Elementos na tela (DOM)', String(snapshot.performance.domNodes)], ['Núcleos de CPU disponíveis', String(snapshot.cpuCores)]]} />
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ GPU

function GpuTab({ snapshot, history }: { snapshot: DevSnapshot; history: DevHistory }) {
  const videoTracks = snapshot.tracks.filter((t) => t.kind === 'video');
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Codificação / decodificação de vídeo</SectionTitle>
        {videoTracks.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhuma faixa de vídeo ativa agora — entre numa chamada com câmera ou transmita a tela.</p>
        ) : (
          <div className="space-y-3">
            {videoTracks.map((t) => {
              const h = history.tracks[t.key];
              return (
                <div key={t.key} className="rounded-xl bg-surface-2 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">
                      {t.participant} · {t.source}
                    </span>
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', t.hardwareAccelerated ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger')}>
                      {t.hardwareAccelerated === null ? '?' : t.hardwareAccelerated ? 'GPU (hardware)' : 'CPU (software)'}
                    </span>
                  </div>
                  <InfoGrid
                    rows={[
                      ['Codec', t.codec.toUpperCase()],
                      ['Implementação', t.encoderImpl ?? '?'],
                      ['Resolução', t.width && t.height ? `${t.width}x${t.height}${t.fps ? `@${t.fps}fps` : ''}` : '?'],
                    ]}
                  />
                  {h && h.encodeMs.length > 1 && (
                    <div className="mt-2">
                      <div className="mb-1 text-xs text-fg-muted">Tempo de codificação por quadro</div>
                      <LiveChart data={h.encodeMs} formatValue={(v) => v.toFixed(1)} unit="ms" height={44} color="var(--color-accent-2)" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {snapshot.desktopInfo && gpuFeatureRows(snapshot.desktopInfo.gpu).length > 0 && (
        <section>
          <SectionTitle>Aceleração de GPU do sistema</SectionTitle>
          <InfoGrid rows={gpuFeatureRows(snapshot.desktopInfo.gpu)} />
        </section>
      )}

      {snapshot.desktopInfo && (
        <section>
          <SectionTitle>Hardware</SectionTitle>
          <InfoGrid rows={[['Processador', snapshot.desktopInfo.cpuModel ?? '?'], ['Núcleos', String(snapshot.desktopInfo.cpuCores)]]} />
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Rede

function TrackNetworkCard({ t, h }: { t: DevTrackStat; h: DevHistory['tracks'][string] | undefined }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
        <span className="truncate">
          {t.participant} · {t.source} ({t.kind === 'video' ? 'vídeo' : 'áudio'})
        </span>
        <span className="shrink-0 font-mono text-xs text-fg-muted uppercase">
          {t.codec} · {t.protocol ?? '?'}
          {t.candidateType ? ` (${t.candidateType})` : ''}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="mb-1 text-xs text-fg-muted">Bitrate</div>
          <LiveChart data={h?.bitrateKbps ?? []} formatValue={(v) => String(Math.round(v))} unit=" kbps" height={44} />
        </div>
        <div>
          <div className="mb-1 text-xs text-fg-muted">Jitter</div>
          <LiveChart data={h?.jitterMs ?? []} formatValue={(v) => String(Math.round(v))} unit="ms" height={44} color="var(--color-accent-2)" />
        </div>
        <div>
          <div className="mb-1 text-xs text-fg-muted">RTT</div>
          <LiveChart data={h?.roundTripMs ?? []} formatValue={(v) => String(Math.round(v))} unit="ms" height={44} color="var(--color-accent-2)" />
        </div>
      </div>
      {(!!t.packetsLost || (!!t.qualityLimitation && t.qualityLimitation !== 'none')) && (
        <div className="mt-2 space-y-0.5 text-xs text-danger">
          {!!t.packetsLost && <p>{t.packetsLost} pacote(s) perdido(s) no total</p>}
          {!!t.qualityLimitation && t.qualityLimitation !== 'none' && <p>qualidade limitada por: {t.qualityLimitation}</p>}
        </div>
      )}
    </div>
  );
}

function RedeTab({ snapshot, history }: { snapshot: DevSnapshot; history: DevHistory }) {
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Latência com o servidor</SectionTitle>
        <LiveChart data={history.latencyMs} formatValue={(v) => String(Math.round(v))} unit="ms" height={64} />
      </section>

      <section>
        <SectionTitle>Faixas de áudio/vídeo</SectionTitle>
        {snapshot.tracks.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhuma chamada ativa agora.</p>
        ) : (
          <div className="space-y-3">
            {snapshot.tracks.map((t) => (
              <TrackNetworkCard key={t.key} t={t} h={history.tracks[t.key]} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
