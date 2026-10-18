"""Gera os painéis do Grafana (deploy/monitoring/grafana/dashboards/*.json).

Rode depois de mudar algo aqui:  python deploy/monitoring/dashboards.py
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / 'grafana' / 'dashboards'
DS = {'type': 'prometheus', 'uid': 'prometheus'}

GREEN, YELLOW, ORANGE, RED, BLUE, PURPLE = '#3fb950', '#f5c451', '#ff8a6b', '#f85149', '#58a6ff', '#c4a5ff'


class Board:
    def __init__(self, uid, title, description, refresh='10s', time='now-1h'):
        self.uid, self.title, self.description, self.refresh, self.time = uid, title, description, refresh, time
        self.panels, self.y, self.x, self.row_h, self.next_id = [], 0, 0, 0, 1

    def _place(self, w, h):
        if self.x + w > 24:
            self.x, self.y, self.row_h = 0, self.y + self.row_h, 0
        pos = {'x': self.x, 'y': self.y, 'w': w, 'h': h}
        self.x += w
        self.row_h = max(self.row_h, h)
        return pos

    def row(self, title):
        if self.x:
            self.x, self.y, self.row_h = 0, self.y + self.row_h, 0
        self.panels.append({'type': 'row', 'title': title, 'id': self._id(), 'collapsed': False, 'gridPos': {'x': 0, 'y': self.y, 'w': 24, 'h': 1}, 'panels': []})
        self.y += 1

    def _id(self):
        self.next_id += 1
        return self.next_id

    def _targets(self, queries):
        out = []
        for i, q in enumerate(queries):
            expr, legend = (q, '') if isinstance(q, str) else q
            out.append({'datasource': DS, 'expr': expr, 'legendFormat': legend or '__auto', 'refId': chr(65 + i), 'range': True, 'instant': False})
        return out

    def stat(self, title, queries, unit='none', w=4, h=4, thresholds=None, decimals=None, description='', color_mode='background', mappings=None, text_mode='auto', graph=True):
        steps = [{'color': c, 'value': v} for v, c in (thresholds or [(None, BLUE)])]
        p = {
            'type': 'stat', 'title': title, 'id': self._id(), 'datasource': DS, 'description': description,
            'gridPos': self._place(w, h), 'targets': self._targets(queries),
            'fieldConfig': {'defaults': {'unit': unit, 'thresholds': {'mode': 'absolute', 'steps': steps}, 'mappings': mappings or [], **({'decimals': decimals} if decimals is not None else {})}, 'overrides': []},
            'options': {'reduceOptions': {'calcs': ['lastNotNull'], 'fields': '', 'values': False}, 'colorMode': color_mode, 'graphMode': 'area' if graph else 'none', 'justifyMode': 'center', 'textMode': text_mode, 'wideLayout': True},
        }
        self.panels.append(p)

    def gauge(self, title, query, unit='percent', w=4, h=6, thresholds=None, max_=100, description=''):
        steps = [{'color': c, 'value': v} for v, c in (thresholds or [(None, GREEN), (70, YELLOW), (90, RED)])]
        self.panels.append({
            'type': 'gauge', 'title': title, 'id': self._id(), 'datasource': DS, 'description': description,
            'gridPos': self._place(w, h), 'targets': self._targets([query]),
            'fieldConfig': {'defaults': {'unit': unit, 'min': 0, 'max': max_, 'thresholds': {'mode': 'absolute', 'steps': steps}}, 'overrides': []},
            'options': {'reduceOptions': {'calcs': ['lastNotNull'], 'fields': '', 'values': False}, 'showThresholdMarkers': True, 'showThresholdLabels': False},
        })

    def series(self, title, queries, unit='none', w=12, h=8, stack=False, fill=12, description='', min_=None, overrides=None, legend_calcs=('mean', 'max', 'lastNotNull'), draw='line', decimals=None):
        custom = {'drawStyle': draw, 'lineWidth': 2, 'fillOpacity': fill, 'gradientMode': 'opacity', 'showPoints': 'never', 'spanNulls': True,
                  'stacking': {'mode': 'normal' if stack else 'none', 'group': 'A'}, 'axisSoftMin': 0 if min_ is None else min_}
        defaults = {'unit': unit, 'custom': custom, 'color': {'mode': 'palette-classic'}}
        if decimals is not None:
            defaults['decimals'] = decimals
        self.panels.append({
            'type': 'timeseries', 'title': title, 'id': self._id(), 'datasource': DS, 'description': description,
            'gridPos': self._place(w, h), 'targets': self._targets(queries),
            'fieldConfig': {'defaults': defaults, 'overrides': overrides or []},
            'options': {'legend': {'displayMode': 'table', 'placement': 'bottom', 'calcs': list(legend_calcs), 'showLegend': True}, 'tooltip': {'mode': 'multi', 'sort': 'desc'}},
        })

    def bars(self, title, query, unit='percent', w=8, h=8, max_=100, thresholds=None, legend='', description=''):
        steps = [{'color': c, 'value': v} for v, c in (thresholds or [(None, GREEN), (70, YELLOW), (90, RED)])]
        self.panels.append({
            'type': 'bargauge', 'title': title, 'id': self._id(), 'datasource': DS, 'description': description,
            'gridPos': self._place(w, h), 'targets': [{**t, 'instant': True, 'range': False} for t in self._targets([(query, legend)])],
            'fieldConfig': {'defaults': {'unit': unit, 'min': 0, **({'max': max_} if max_ is not None else {}), 'thresholds': {'mode': 'absolute', 'steps': steps}, 'color': {'mode': 'thresholds'}}, 'overrides': []},
            'options': {'orientation': 'horizontal', 'displayMode': 'gradient', 'showUnfilled': True, 'valueMode': 'color', 'namePlacement': 'left', 'reduceOptions': {'calcs': ['lastNotNull'], 'fields': '', 'values': False}},
        })

    def table(self, title, queries, w=24, h=8, columns=None, description='', hide=('Time', '__name__', 'job', 'instance', 'app', 'image', 'compose_project', 'compose_service'), overrides=()):
        targets = [{**t, 'instant': True, 'range': False, 'format': 'table'} for t in self._targets(queries)]
        organize = {'excludeByName': {k: True for k in hide}, 'renameByName': columns or {}}
        self.panels.append({
            'type': 'table', 'title': title, 'id': self._id(), 'datasource': DS, 'description': description,
            'gridPos': self._place(w, h), 'targets': targets,
            'transformations': [{'id': 'merge', 'options': {}}, {'id': 'organize', 'options': organize}],
            'fieldConfig': {'defaults': {}, 'overrides': [{'matcher': {'id': 'byName', 'options': n}, 'properties': [{'id': 'unit', 'value': u}]} for n, u in overrides]},
            'options': {'showHeader': True, 'cellHeight': 'sm', 'sortBy': [{'displayName': columns and list(columns.values())[0] or '', 'desc': False}]},
        })

    def save(self):
        data = {
            'uid': self.uid, 'title': self.title, 'description': self.description, 'tags': ['concord'], 'timezone': 'browser',
            'refresh': self.refresh, 'schemaVersion': 39, 'version': 1, 'editable': False, 'graphTooltip': 1,
            'time': {'from': self.time, 'to': 'now'},
            'timepicker': {'refresh_intervals': ['5s', '10s', '30s', '1m', '5m']},
            'links': [{'title': 'Painéis do Concord', 'type': 'dashboards', 'tags': ['concord'], 'asDropdown': True, 'icon': 'external link'}],
            'panels': self.panels, 'templating': {'list': []}, 'annotations': {'list': []},
        }
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f'{self.uid}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')


UP_DOWN = [{'type': 'value', 'options': {'0': {'text': 'FORA DO AR', 'color': RED}, '1': {'text': 'NO AR', 'color': GREEN}}}]
EXT = 'probe="site (de fora, pela Cloudflare)"'
CPU = '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m])))'
RAM = '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)'
# disco principal: a partição "/" (ou, se ela não aparecer, a maior partição de dados)
DISK = '(100 * (1 - node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})) or topk(1, 100 * (1 - max by (device) (node_filesystem_avail_bytes{fstype=~"ext4|xfs|btrfs"}) / max by (device) (node_filesystem_size_bytes{fstype=~"ext4|xfs|btrfs"})))'
REQS = 'sum(rate(concord_http_request_duration_seconds_count[1m]))'
ERR5 = '100 * (sum(rate(concord_http_request_duration_seconds_count{status=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(concord_http_request_duration_seconds_count[5m])), 1e-9)'
P = lambda q: f'histogram_quantile({q}, sum by (le) (rate(concord_http_request_duration_seconds_bucket{{route!~"/uploads|/downloads"}}[5m])))'
NET_IF = 'device!~"lo|veth.*|docker.*|br-.*|virbr.*"'

# ------------------------------------------------------------------ visão geral
b = Board('visao-geral', 'Concord — Visão geral', 'O essencial ao vivo: o site está no ar? quantos estão usando? a VPS aguenta?', refresh='5s', time='now-30m')
b.row('Agora')
b.stat('Site (visto de fora)', [(f'probe_success{{{EXT}}}', '')], mappings=UP_DOWN, w=4, graph=False, thresholds=[(None, RED), (1, GREEN)], description='Checagem a cada 10 s de https://DOMINIO/health passando pela Cloudflare.')
b.stat('Latência de fora', [(f'probe_duration_seconds{{{EXT}}}', '')], unit='s', thresholds=[(None, GREEN), (0.5, YELLOW), (1.5, RED)], decimals=2, description='Tempo total de uma requisição ao site pela internet (DNS + conexão + TLS + resposta).')
b.stat('Online agora', [('concord_users_online', '')], thresholds=[(None, PURPLE)])
b.stat('Em salas de voz', [('concord_voice{kind="participants"}', '')], thresholds=[(None, PURPLE)])
b.stat('Transmitindo tela', [('concord_voice{kind="streams"}', '')], thresholds=[(None, ORANGE)])
b.stat('Requisições/s', [(REQS, '')], unit='reqps', decimals=1, thresholds=[(None, BLUE)])
b.stat('Erros 5xx', [(ERR5, '')], unit='percent', decimals=2, thresholds=[(None, GREEN), (0.5, YELLOW), (2, RED)], description='Porcentagem de respostas com erro do servidor nos últimos 5 minutos.')
b.stat('Resposta p95', [(P(0.95), '')], unit='s', decimals=3, thresholds=[(None, GREEN), (0.3, YELLOW), (1, RED)], description='95% das requisições da API respondem em menos que isto (sem contar downloads de arquivos).')
b.stat('CPU da VPS', [(CPU, '')], unit='percent', decimals=0, thresholds=[(None, GREEN), (70, YELLOW), (90, RED)])
b.stat('RAM da VPS', [(RAM, '')], unit='percent', decimals=0, thresholds=[(None, GREEN), (80, YELLOW), (92, RED)])
b.stat('Disco', [(DISK, '')], unit='percent', decimals=0, thresholds=[(None, GREEN), (80, YELLOW), (92, RED)])
b.stat('VPS ligada há', [('time() - node_boot_time_seconds', '')], unit='s', graph=False, color_mode='none', decimals=0)
b.row('Uso')
b.series('Pessoas', [('concord_users_online', 'online'), ('concord_voice{kind="participants"}', 'em voz'), ('concord_voice{kind="streams"}', 'transmitindo'), ('concord_voice{kind="cameras"}', 'câmera ligada')], w=12, decimals=0)
b.series('Requisições por segundo (por resultado)', [('sum(rate(concord_http_request_duration_seconds_count{status=~"2.."}[1m]))', 'ok (2xx)'), ('sum(rate(concord_http_request_duration_seconds_count{status=~"3.."}[1m]))', 'redirecionamento (3xx)'), ('sum(rate(concord_http_request_duration_seconds_count{status=~"4.."}[1m]))', 'erro do usuário (4xx)'), ('sum(rate(concord_http_request_duration_seconds_count{status=~"5.."}[1m]))', 'erro do servidor (5xx)')], unit='reqps', stack=True,
         overrides=[{'matcher': {'id': 'byName', 'options': 'erro do servidor (5xx)'}, 'properties': [{'id': 'color', 'value': {'mode': 'fixed', 'fixedColor': RED}}]}])
b.series('Tempo de resposta da API', [(P(0.5), 'mediana'), (P(0.95), 'p95'), (P(0.99), 'p99')], unit='s')
b.series('Latência', [(f'probe_duration_seconds{{{EXT}}}', 'site de fora (pela Cloudflare)'), ('probe_duration_seconds{probe="app (por dentro)"}', 'app por dentro'), ('probe_icmp_duration_seconds{phase="rtt"}', 'ping {{probe}}')], unit='s')
b.row('VPS')
b.series('CPU e memória', [(CPU, 'CPU %'), (RAM, 'RAM %')], unit='percent', w=12)
b.series('Rede da VPS', [(f'sum(rate(node_network_receive_bytes_total{{{NET_IF}}}[1m])) * 8', 'download'), (f'-sum(rate(node_network_transmit_bytes_total{{{NET_IF}}}[1m])) * 8', 'upload (para baixo)')], unit='bps', w=12, min_=-1,
         description='Upload aparece para baixo. Transmissões de tela usam bastante upload (o servidor reenvia o vídeo para cada pessoa).')
b.save()

# ------------------------------------------------------------------ VPS
b = Board('vps', 'Concord — VPS', 'Tudo da máquina: CPU, memória, disco, rede e sistema.')
b.row('Resumo')
b.gauge('CPU', CPU)
b.gauge('RAM', RAM, thresholds=[(None, GREEN), (80, YELLOW), (92, RED)])
b.gauge('Disco /', DISK, thresholds=[(None, GREEN), (80, YELLOW), (92, RED)])
b.gauge('Swap', '100 * (1 - node_memory_SwapFree_bytes / clamp_min(node_memory_SwapTotal_bytes, 1))', thresholds=[(None, GREEN), (30, YELLOW), (70, RED)])
b.stat('Núcleos', [('count(count by (cpu) (node_cpu_seconds_total))', '')], w=2, h=6, graph=False, color_mode='none')
b.stat('RAM total', [('node_memory_MemTotal_bytes', '')], unit='bytes', w=2, h=6, graph=False, color_mode='none')
b.stat('Carga (1 min)', [('node_load1', '')], w=2, h=6, decimals=2, thresholds=[(None, GREEN)], color_mode='value')
b.stat('Ligada há', [('time() - node_boot_time_seconds', '')], unit='s', w=2, h=6, graph=False, color_mode='none', decimals=0)
b.row('CPU')
b.series('CPU por tipo de uso', [('100 * sum by (mode) (rate(node_cpu_seconds_total{mode!="idle"}[1m])) / scalar(count(count by (cpu) (node_cpu_seconds_total)))', '{{mode}}')], unit='percent', stack=True,
         description='user = programas; system = kernel; iowait = esperando disco; steal = CPU "roubada" pelo provedor (VPS compartilhada); softirq = rede.')
b.series('CPU por núcleo', [('100 * (1 - rate(node_cpu_seconds_total{mode="idle"}[1m]))', 'núcleo {{cpu}}')], unit='percent', fill=0)
b.series('Carga do sistema', [('node_load1', '1 min'), ('node_load5', '5 min'), ('node_load15', '15 min'), ('count(count by (cpu) (node_cpu_seconds_total))', 'núcleos (limite)')], decimals=2,
         description='Carga acima do número de núcleos = processos esperando CPU.')
b.series('Trocas de contexto e interrupções', [('rate(node_context_switches_total[1m])', 'trocas de contexto/s'), ('rate(node_intr_total[1m])', 'interrupções/s')])
b.row('Memória')
b.series('Memória', [('node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes', 'em uso'), ('node_memory_Buffers_bytes + node_memory_Cached_bytes', 'cache (liberável)'), ('node_memory_MemAvailable_bytes', 'disponível')], unit='bytes', stack=False)
b.series('Swap e pressão de memória', [('node_memory_SwapTotal_bytes - node_memory_SwapFree_bytes', 'swap em uso'), ('rate(node_vmstat_pgmajfault[1m])', 'page faults graves/s')], unit='bytes',
         overrides=[{'matcher': {'id': 'byName', 'options': 'page faults graves/s'}, 'properties': [{'id': 'unit', 'value': 'short'}, {'id': 'custom.axisPlacement', 'value': 'right'}]}])
b.row('Disco')
b.bars('Uso por partição', '100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs|rootfs"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs|rootfs"})', legend='{{mountpoint}}')
b.series('Leitura e escrita', [('sum by (device) (rate(node_disk_read_bytes_total[1m]))', 'leitura {{device}}'), ('-sum by (device) (rate(node_disk_written_bytes_total[1m]))', 'escrita {{device}}')], unit='Bps', w=8, min_=-1)
b.series('Disco ocupado (%)', [('100 * rate(node_disk_io_time_seconds_total[1m])', '{{device}}')], unit='percent', w=8, description='Perto de 100% = o disco é o gargalo.')
b.row('Rede')
b.series('Tráfego por interface', [(f'rate(node_network_receive_bytes_total{{{NET_IF}}}[1m]) * 8', 'recebe {{device}}'), (f'-rate(node_network_transmit_bytes_total{{{NET_IF}}}[1m]) * 8', 'envia {{device}}')], unit='bps', min_=-1)
b.series('Pacotes por segundo', [(f'rate(node_network_receive_packets_total{{{NET_IF}}}[1m])', 'recebe {{device}}'), (f'-rate(node_network_transmit_packets_total{{{NET_IF}}}[1m])', 'envia {{device}}')], unit='pps', min_=-1)
b.series('Erros e descartes de rede', [(f'rate(node_network_receive_errs_total{{{NET_IF}}}[1m])', 'erro ao receber {{device}}'), (f'rate(node_network_transmit_errs_total{{{NET_IF}}}[1m])', 'erro ao enviar {{device}}'), (f'rate(node_network_receive_drop_total{{{NET_IF}}}[1m])', 'descartado ao receber {{device}}'), (f'rate(node_network_transmit_drop_total{{{NET_IF}}}[1m])', 'descartado ao enviar {{device}}')], unit='pps')
b.series('Conexões', [('node_netstat_Tcp_CurrEstab', 'TCP abertas'), ('node_sockstat_TCP_tw', 'TCP em TIME_WAIT'), ('node_sockstat_UDP_inuse', 'UDP em uso'), ('node_filefd_allocated', 'arquivos abertos')],
         overrides=[{'matcher': {'id': 'byName', 'options': 'arquivos abertos'}, 'properties': [{'id': 'custom.axisPlacement', 'value': 'right'}, {'id': 'custom.lineStyle', 'value': {'fill': 'dash', 'dash': [6, 4]}}]}])
b.save()

# ------------------------------------------------------------------ containers
C = 'name!=""'
b = Board('containers', 'Concord — Containers', 'Consumo de cada container Docker da VPS (Concord e os outros projetos).')
b.row('Agora')
b.bars('CPU por container', f'sum by (name) (rate(container_cpu_usage_seconds_total{{{C}}}[1m])) * 100', legend='{{name}}', max_=None, thresholds=[(None, GREEN), (50, YELLOW), (90, RED)], w=12, h=9,
       description='100% = um núcleo inteiro.')
b.bars('Memória por container', f'sum by (name) (container_memory_working_set_bytes{{{C}}})', unit='bytes', legend='{{name}}', max_=None, thresholds=[(None, BLUE)], w=12, h=9)
b.row('Histórico')
b.series('CPU por container (% de um núcleo)', [(f'sum by (name) (rate(container_cpu_usage_seconds_total{{{C}}}[1m])) * 100', '{{name}}')], unit='percent', fill=0)
b.series('Memória por container', [(f'sum by (name) (container_memory_working_set_bytes{{{C}}})', '{{name}}')], unit='bytes', fill=0)
b.series('Disco por container', [(f'sum by (name) (rate(container_fs_reads_bytes_total{{{C}}}[1m]))', 'lê {{name}}'), (f'-sum by (name) (rate(container_fs_writes_bytes_total{{{C}}}[1m]))', 'escreve {{name}}')], unit='Bps', min_=-1, fill=0)
b.series('CPU limitada (throttling)', [(f'sum by (name) (rate(container_cpu_cfs_throttled_seconds_total{{{C}}}[1m]))', '{{name}}')], unit='s', fill=0,
         description='Tempo em que o container quis CPU e foi segurado pelo limite. Os do Concord usam a rede do host; a rede deles aparece no painel da VPS.')
b.table('Containers', [(f'max by (name) (container_running{{{C}}})', ''), (f'max by (name) (time() - container_start_time_seconds{{{C}}})', ''), (f'max by (name) (container_memory_working_set_bytes{{{C}}})', ''), (f'max by (name) (container_restart_count{{{C}}})', '')], h=10,
        columns={'name': 'Container', 'Value #A': 'Rodando (1 = sim)', 'Value #B': 'Rodando há', 'Value #C': 'Memória', 'Value #D': 'Reinícios'},
        overrides=[('Rodando há', 's'), ('Memória', 'bytes')])
b.save()

# ------------------------------------------------------------------ app e rede
b = Board('app', 'Concord — App e rede', 'Por dentro do app: rotas, eventos, salas de voz, Node.js, Caddy, Cloudflare e latência.')
b.row('Tráfego da API')
b.series('Requisições/s por rota (top 10)', [('topk(10, sum by (method, route) (rate(concord_http_request_duration_seconds_count[1m])))', '{{method}} {{route}}')], unit='reqps', fill=0)
b.series('Tempo de resposta p95 por rota (top 10)', [('topk(10, histogram_quantile(0.95, sum by (le, route) (rate(concord_http_request_duration_seconds_bucket[5m]))))', '{{route}}')], unit='s', fill=0)
b.series('Respostas por código', [('sum by (status) (rate(concord_http_request_duration_seconds_count[1m]))', '{{status}}')], unit='reqps', stack=True)
b.series('Dados enviados pelo app', [('sum by (route) (rate(concord_http_response_bytes_total[1m])) * 8', '{{route}}')], unit='bps', stack=True)
b.row('O que a galera está fazendo')
b.series('Eventos por minuto', [('sum by (event) (rate(concord_events_total[5m])) * 60', '{{event}}')], unit='short', fill=0, description='Mensagens, logins, uploads, chamar atenção, códigos compartilhados, minigames, stickers...')
b.series('Eventos em tempo real (Socket.io)', [('sum by (event) (rate(concord_socket_events_total[1m]))', '{{event}}'), ('concord_sockets', 'conexões abertas')], fill=0,
         overrides=[{'matcher': {'id': 'byName', 'options': 'conexões abertas'}, 'properties': [{'id': 'custom.axisPlacement', 'value': 'right'}, {'id': 'custom.lineStyle', 'value': {'fill': 'dash', 'dash': [6, 4]}}]}])
b.series('Salas de voz', [('concord_voice', '{{kind}}')], decimals=0, w=8)
b.stat('Contas', [('concord_db_rows{table="users"}', '')], w=4, h=4, thresholds=[(None, PURPLE)])
b.stat('Servidores', [('concord_db_rows{table="servers"}', '')], w=4, h=4, thresholds=[(None, PURPLE)])
b.stat('Mensagens', [('sum(concord_db_rows{table=~"messages|dm_messages"})', '')], w=4, h=4, thresholds=[(None, PURPLE)])
b.stat('Tamanho do banco', [('concord_db_size_bytes', '')], unit='bytes', w=4, h=4, thresholds=[(None, BLUE)])
b.row('Node.js (processo do app)')
b.series('Atraso do event loop', [('nodejs_eventloop_lag_p50_seconds{job="concord"}', 'mediana'), ('nodejs_eventloop_lag_p99_seconds{job="concord"}', 'p99'), ('nodejs_eventloop_lag_max_seconds{job="concord"}', 'máximo')], unit='s', w=8,
         description='Quanto o servidor demora para atender algo novo por estar ocupado. Acima de ~100 ms a experiência piora.')
b.series('Memória do processo', [('process_resident_memory_bytes{job="concord"}', 'RSS'), ('nodejs_heap_size_used_bytes{job="concord"}', 'heap usado'), ('nodejs_heap_size_total_bytes{job="concord"}', 'heap total'), ('nodejs_external_memory_bytes{job="concord"}', 'externa (buffers)')], unit='bytes', w=8)
b.series('CPU do processo e coleta de lixo', [('rate(process_cpu_seconds_total{job="concord"}[1m]) * 100', 'CPU %'), ('sum(rate(nodejs_gc_duration_seconds_sum{job="concord"}[1m])) * 100', 'coleta de lixo %')], unit='percent', w=8)
b.row('Entrada: Caddy e Cloudflare')
b.series('Caddy: requisições/s', [('sum by (code) (rate(caddy_http_request_duration_seconds_count[1m]))', 'código {{code}}'), ('sum(rate(caddy_http_request_duration_seconds_count[1m]))', 'total')], unit='reqps', w=8, fill=0)
b.series('Caddy: tempo de resposta', [('histogram_quantile(0.5, sum by (le) (rate(caddy_http_request_duration_seconds_bucket[5m])))', 'mediana'), ('histogram_quantile(0.95, sum by (le) (rate(caddy_http_request_duration_seconds_bucket[5m])))', 'p95')], unit='s', w=8)
b.series('Túnel Cloudflare', [('sum(rate(cloudflared_tunnel_total_requests[1m]))', 'requisições/s'), ('sum(rate(cloudflared_tunnel_request_errors[1m]))', 'erros/s'), ('sum(cloudflared_tunnel_ha_connections)', 'conexões com a Cloudflare')], w=8, fill=0,
         description='Requisições de todos os sites do túnel. "Conexões com a Cloudflare" deveria ficar em 4.')
b.row('Latência e disponibilidade')
b.series('Fases da requisição de fora (pela Cloudflare)', [(f'probe_http_duration_seconds{{{EXT}}}', '{{phase}}')], unit='s', stack=True,
         description='resolve = DNS; connect = abrir conexão; tls = criptografia; processing = esperando a resposta; transfer = recebendo.')
b.series('Ping da VPS', [('probe_icmp_duration_seconds{phase="rtt"}', '{{probe}}')], unit='s', fill=0, description='Latência da VPS até servidores grandes da internet: mostra se o problema é a rede do provedor.')
b.stat('Site de fora', [(f'avg_over_time(probe_success{{{EXT}}}[24h]) * 100', '')], unit='percent', decimals=2, w=6, thresholds=[(None, RED), (99, YELLOW), (99.9, GREEN)], description='Disponibilidade nas últimas 24 horas.')
b.stat('App por dentro', [('avg_over_time(probe_success{probe="app (por dentro)"}[24h]) * 100', '')], unit='percent', decimals=2, w=6, thresholds=[(None, RED), (99, YELLOW), (99.9, GREEN)])
b.stat('LiveKit', [('avg_over_time(probe_success{probe="LiveKit (voz e vídeo)"}[24h]) * 100', '')], unit='percent', decimals=2, w=6, thresholds=[(None, RED), (99, YELLOW), (99.9, GREEN)])
b.stat('Certificado vence em', [(f'(probe_ssl_earliest_cert_expiry{{{EXT}}} - time()) / 86400', '')], unit='d', decimals=0, w=6, thresholds=[(None, RED), (7, YELLOW), (20, GREEN)], graph=False)
b.table('Coletas', [('up', '')], h=8, columns={'job': 'Fonte', 'instance': 'Endereço', 'probe': 'Checagem', 'Value': 'Funcionando (1 = sim)'}, hide=('Time', '__name__', 'app'), description='Se algo aparecer 0, aquele coletor não está respondendo. No cloudflared é normal só uma das portas responder.')
b.save()

print('painéis gerados em', OUT)
