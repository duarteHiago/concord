// Janela independente de diagnóstico ("Modo desenvolvedor"). Roda em outra janela/aba (ver
// App.tsx e lib/desktop.ts) e só recebe dados pelo BroadcastChannel de lib/devStats.ts — a
// Room do LiveKit e a ponte do desktop só existem na janela principal.
import { Fragment, useState, type ReactNode } from 'react';
import { type DevHistory, type DevSnapshot, type DevTrackStat, useDevHistory, useDevStatsSubscriber, useRemoteRecording } from '../lib/devStats';
import { LiveChart } from './LiveChart';
import { RecordControls } from './RecordControls';
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
      <RecordBar snapshot={snapshot} />
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

// ------------------------------------------------------------------ gravação

/** A gravação roda no app (janela principal); daqui só se vê e controla. Fechar esta janela não para a gravação. */
function RecordBar({ snapshot }: { snapshot: DevSnapshot | null }) {
  const rec = useRemoteRecording();
  return (
    <RecordControls
      state={rec}
      onStart={rec.start}
      onStop={rec.stop}
      onMark={rec.mark}
      disabled={!snapshot}
      className={rec.recording ? 'border-b border-line bg-danger/10 px-4 py-2' : 'border-b border-line bg-surface-1 px-4 py-2'}
    />
  );
}

// ------------------------------------------------------------------ pecinhas reutilizadas

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">{children}</h2>;
}

/** Legenda curta explicando o que a seção mostra — sempre antes do gráfico/dado em si. */
function Caption({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs text-fg-subtle">{children}</p>;
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

/** Fabricante/modelo/driver, só disponíveis no app desktop (a web não expõe isso). */
function gpuDriverRows(gpu: unknown): [string, string][] {
  if (!gpu || typeof gpu !== 'object') return [];
  const g = gpu as { gpuDevice?: unknown; auxAttributes?: unknown };
  const rows: [string, string][] = [];
  const devices = Array.isArray(g.gpuDevice) ? (g.gpuDevice as Record<string, unknown>[]) : [];
  const active = devices.find((d) => d.active) ?? devices[0];
  if (active) {
    if (typeof active.vendorString === 'string' && active.vendorString) rows.push(['Fabricante', active.vendorString]);
    if (typeof active.deviceString === 'string' && active.deviceString) rows.push(['Modelo', active.deviceString]);
    if (typeof active.driverVendor === 'string' && active.driverVendor) rows.push(['Driver', active.driverVendor]);
    if (typeof active.driverVersion === 'string' && active.driverVersion) rows.push(['Versão do driver', active.driverVersion]);
  }
  const aux = g.auxAttributes as Record<string, unknown> | undefined;
  if (aux && typeof aux.softwareRendering === 'boolean') rows.push(['Renderização', aux.softwareRendering ? 'por software (sem GPU dedicada)' : 'por hardware']);
  return rows;
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

  const concordMemoryMB = history.concordMemoryMB.length ? history.concordMemoryMB[history.concordMemoryMB.length - 1] : undefined;

  return (
    <div className="space-y-6">
      <Caption>Visão geral de agora; os gráficos pequenos mostram a tendência dos últimos ~2 minutos.</Caption>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Latência com o servidor" value={snapshot.health.latencyMs !== null ? `${snapshot.health.latencyMs} ms` : '?'} trend={history.latencyMs} unit="ms" />
        <StatTile label="Memória do cliente" value={snapshot.performance.jsHeapUsedMB !== undefined ? `${snapshot.performance.jsHeapUsedMB} MB` : '?'} trend={history.jsHeapUsedMB} unit="MB" />
        {snapshot.desktopInfo ? (
          <StatTile label="RAM usada pelo Concord" value={concordMemoryMB !== undefined ? `${Math.round(concordMemoryMB)} MB` : '?'} trend={history.concordMemoryMB} unit="MB" />
        ) : (
          <StatTile label="Faixas de áudio/vídeo ativas" value={String(snapshot.tracks.length)} />
        )}
        <StatTile
          label="Codificação de vídeo"
          value={videoTrack ? (videoTrack.hardwareAccelerated ? 'GPU' : videoTrack.hardwareAccelerated === false ? 'CPU' : '?') : '— nenhuma —'}
        />
      </div>

      <section>
        <SectionTitle>Placa/adaptador de vídeo</SectionTitle>
        <Caption>O que o navegador/app está de fato usando pra desenhar e codificar vídeo nesta máquina.</Caption>
        {snapshot.gpuAdapter ? (
          <InfoGrid rows={[['Fornecedor', snapshot.gpuAdapter.vendor], ['Adaptador', snapshot.gpuAdapter.renderer]]} />
        ) : (
          <p className="text-sm text-fg-muted">Não foi possível identificar — o navegador não expôs essa informação.</p>
        )}
      </section>

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
  const concordMemoryMB = history.concordMemoryMB.length ? history.concordMemoryMB[history.concordMemoryMB.length - 1] : undefined;

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Memória JS do cliente (heap)</SectionTitle>
        <Caption>Memória que o motor do JavaScript usa pra rodar a interface do Concord. Sobe com o uso e cai de vez em quando quando o navegador limpa o que não usa mais (coleta de lixo) — isso é normal, não é vazamento.</Caption>
        <LiveChart data={history.jsHeapUsedMB} formatValue={(v) => `${Math.round(v)}`} unit=" MB" height={72} />
      </section>

      <section>
        <SectionTitle>Processos do Concord</SectionTitle>
        <Caption>Cada processo que o Chromium/Electron abre pro Concord (o principal, a tela que você vê, a GPU, utilitários) e o quanto de CPU cada um está usando agora.</Caption>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-xs text-fg-muted">CPU</div>
                    <LiveChart data={p.cpuPercent} formatValue={(v) => v.toFixed(1)} unit="%" height={40} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-fg-muted">RAM</div>
                    <LiveChart data={p.memoryMB} formatValue={(v) => String(Math.round(v))} unit=" MB" height={40} color="var(--color-accent-2)" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {snapshot.desktopInfo && (
        <section>
          <SectionTitle>Memória do sistema</SectionTitle>
          <Caption>RAM realmente ocupada na sua máquina pelos processos do Concord, e quanto sobra no total do sistema.</Caption>
          <InfoGrid
            rows={[
              ['RAM usada pelo Concord', concordMemoryMB !== undefined ? `${Math.round(concordMemoryMB)} MB` : '?'],
              ['RAM total do sistema', `${(snapshot.desktopInfo.totalMemMB / 1024).toFixed(1)} GB`],
              ['RAM livre no sistema', `${(snapshot.desktopInfo.freeMemMB / 1024).toFixed(1)} GB`],
            ]}
          />
        </section>
      )}

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
  const driverRows = snapshot.desktopInfo ? gpuDriverRows(snapshot.desktopInfo.gpu) : [];
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Placa/adaptador de vídeo</SectionTitle>
        <Caption>
          Qual placa de vídeo (ou emulação por software, se não houver uma disponível) o navegador está realmente usando. Se aparecer algo como "SwiftShader" ou "software" no nome, não há
          aceleração de GPU nesta máquina — tudo é desenhado pelo processador.
        </Caption>
        {snapshot.gpuAdapter ? (
          <InfoGrid rows={[['Fornecedor', snapshot.gpuAdapter.vendor], ['Adaptador', snapshot.gpuAdapter.renderer], ...driverRows]} />
        ) : (
          <p className="text-sm text-fg-muted">Não foi possível identificar — o navegador não expôs essa informação.</p>
        )}
      </section>

      <section>
        <SectionTitle>Codificação / decodificação de vídeo</SectionTitle>
        <Caption>
          Enquanto você transmite tela ou recebe vídeo de alguém, mostra se a placa de vídeo está fazendo o trabalho pesado (GPU/hardware, ideal) ou se sobrou pro processador (CPU/software — mais
          lento e esquenta mais a máquina).
        </Caption>
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
          <Caption>Por recurso (decodificação de vídeo, composição da tela, WebGL): "enabled" é acelerado pela GPU, "disabled"/"software" caiu pro processador.</Caption>
          <InfoGrid rows={gpuFeatureRows(snapshot.desktopInfo.gpu)} />
        </section>
      )}

      {snapshot.desktopInfo && (
        <section>
          <SectionTitle>Processador</SectionTitle>
          <InfoGrid rows={[['Modelo', snapshot.desktopInfo.cpuModel ?? '?'], ['Núcleos', String(snapshot.desktopInfo.cpuCores)]]} />
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
        <Caption>Tempo de ida e volta de uma requisição simples até o servidor do Concord — não é o ping de nenhum jogo, é só a conexão com o Concord em si.</Caption>
        <LiveChart data={history.latencyMs} formatValue={(v) => String(Math.round(v))} unit="ms" height={64} />
      </section>

      <section>
        <SectionTitle>Faixas de áudio/vídeo</SectionTitle>
        <Caption>
          <b>Bitrate</b>: quanto está sendo enviado/recebido por segundo. <b>Jitter</b>: variação no tempo entre pacotes — quanto menor, melhor. <b>RTT</b>: tempo de ida e volta da conexão de
          voz/vídeo (diferente da latência HTTP acima).
        </Caption>
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
