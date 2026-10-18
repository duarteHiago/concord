// Coletor de consumo dos containers (mesmos números do `docker stats`) no formato do Prometheus.
// Substitui o cAdvisor, que não acha os containers nas versões novas do Docker (image store do containerd).
// Lê a API do Docker pelo socket (somente leitura) e responde em 127.0.0.1:19323/metrics.
import { request, createServer } from 'node:http';

const SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const PORT = Number(process.env.PORT ?? 19323);
const HOST = process.env.HOST ?? '127.0.0.1';

function docker(path) {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: SOCKET, path, method: 'GET', timeout: 8000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${res.statusCode} ${body.slice(0, 120)}`));
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
const labels = (o) => `{${Object.entries(o).map(([k, v]) => `${k}="${esc(v)}"`).join(',')}}`;

const HELP = {
  container_cpu_usage_seconds_total: ['counter', 'Tempo de CPU usado (segundos)'],
  container_cpu_cfs_throttled_seconds_total: ['counter', 'Tempo em que a CPU foi segurada pelo limite'],
  container_memory_working_set_bytes: ['gauge', 'Memória em uso (sem cache liberável), como no docker stats'],
  container_memory_rss: ['gauge', 'Memória RSS'],
  container_spec_memory_limit_bytes: ['gauge', 'Limite de memória (0 = sem limite)'],
  container_fs_reads_bytes_total: ['counter', 'Bytes lidos do disco'],
  container_fs_writes_bytes_total: ['counter', 'Bytes escritos no disco'],
  container_network_receive_bytes_total: ['counter', 'Bytes recebidos pela rede (containers com rede própria)'],
  container_network_transmit_bytes_total: ['counter', 'Bytes enviados pela rede (containers com rede própria)'],
  container_start_time_seconds: ['gauge', 'Quando o container iniciou (unix)'],
  container_restart_count: ['gauge', 'Quantas vezes o Docker reiniciou o container'],
  container_running: ['gauge', '1 se o container está rodando'],
  docker_exporter_scrape_seconds: ['gauge', 'Tempo para ler o Docker'],
};

async function collect() {
  const started = Date.now();
  const out = new Map(Object.keys(HELP).map((k) => [k, []]));
  const add = (metric, l, value) => Number.isFinite(value) && out.get(metric).push(`${metric}${labels(l)} ${value}`);

  const list = await docker('/containers/json?all=true');
  await Promise.all(
    list.map(async (c) => {
      const name = (c.Names?.[0] ?? c.Id.slice(0, 12)).replace(/^\//, '');
      const l = {
        name,
        image: c.Image,
        compose_project: c.Labels?.['com.docker.compose.project'] ?? '',
        compose_service: c.Labels?.['com.docker.compose.service'] ?? '',
      };
      const running = c.State === 'running';
      add('container_running', l, running ? 1 : 0);
      try {
        const info = await docker(`/containers/${c.Id}/json`);
        const startedAt = Date.parse(info.State?.StartedAt ?? '');
        if (running && startedAt > 0) add('container_start_time_seconds', l, startedAt / 1000);
        add('container_restart_count', l, info.RestartCount ?? 0);
      } catch {
        // container sumiu no meio da leitura
      }
      if (!running) return;
      try {
        const s = await docker(`/containers/${c.Id}/stats?stream=false&one-shot=true`);
        const cpu = s.cpu_stats ?? {};
        add('container_cpu_usage_seconds_total', l, (cpu.cpu_usage?.total_usage ?? 0) / 1e9);
        add('container_cpu_cfs_throttled_seconds_total', l, (cpu.throttling_data?.throttled_time ?? 0) / 1e9);
        const mem = s.memory_stats ?? {};
        const st = mem.stats ?? {};
        const cache = st.inactive_file ?? st.total_inactive_file ?? st.cache ?? 0;
        if (mem.usage !== undefined) add('container_memory_working_set_bytes', l, Math.max(0, mem.usage - cache));
        if (st.anon !== undefined || st.rss !== undefined) add('container_memory_rss', l, st.anon ?? st.rss);
        const limit = mem.limit ?? 0;
        // sem limite o Docker devolve a RAM da máquina (ou um número enorme): trata como 0
        add('container_spec_memory_limit_bytes', l, memoryLimit(limit));
        let read = 0;
        let write = 0;
        for (const e of s.blkio_stats?.io_service_bytes_recursive ?? []) {
          if (/read/i.test(e.op)) read += e.value;
          if (/write/i.test(e.op)) write += e.value;
        }
        add('container_fs_reads_bytes_total', l, read);
        add('container_fs_writes_bytes_total', l, write);
        let rx = 0;
        let tx = 0;
        for (const n of Object.values(s.networks ?? {})) {
          rx += n.rx_bytes ?? 0;
          tx += n.tx_bytes ?? 0;
        }
        if (s.networks) {
          add('container_network_receive_bytes_total', l, rx);
          add('container_network_transmit_bytes_total', l, tx);
        }
      } catch {
        // parou no meio da leitura
      }
    }),
  );
  add('docker_exporter_scrape_seconds', {}, (Date.now() - started) / 1000);

  let text = '';
  for (const [metric, lines] of out) {
    if (!lines.length) continue;
    const [type, help] = HELP[metric];
    text += `# HELP ${metric} ${help}\n# TYPE ${metric} ${type}\n${lines.join('\n')}\n`;
  }
  return text;
}

const limits = new Map();
/** Sem limite, o Docker informa a RAM inteira da máquina: nesse caso devolve 0 (sem limite). */
function memoryLimit(limit) {
  const host = limits.get('host') ?? 0;
  if (limit >= host * 0.98 || limit > 2 ** 60) return 0;
  return limit;
}

async function hostMemory() {
  try {
    const info = await docker('/info');
    limits.set('host', info.MemTotal ?? 0);
  } catch {
    // tenta de novo na próxima coleta
  }
}

createServer(async (req, res) => {
  if (req.url !== '/metrics') {
    res.writeHead(404).end();
    return;
  }
  try {
    if (!limits.has('host')) await hostMemory();
    const body = await collect();
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }).end(body);
  } catch (err) {
    res.writeHead(500).end(`# erro: ${err.message}\n`);
  }
}).listen(PORT, HOST, () => console.log(`docker-exporter em http://${HOST}:${PORT}/metrics`));
