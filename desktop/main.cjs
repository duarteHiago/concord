// Concord Desktop — processo principal do Electron.
// Carrega o Concord do servidor configurado e adiciona o que o navegador não oferece:
// seletor próprio de tela/janela e áudio da transmissão sem as vozes da sala (sem retorno).
const { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, Menu, Notification, powerMonitor, screen, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// `backgroundThrottling: false` (lá embaixo, na BrowserWindow) só evita o Chromium reduzir
// timers/JS da página. Minimizada ou atrás de outra janela, o Chromium também rebaixa a
// prioridade de CPU/agendamento do processo de renderização inteiro — isso é o que trava a
// transmissão de tela e deixa fps/bitrate inconsistentes, porque o codificador de vídeo passa
// a competir por menos CPU. Precisa ser setado antes da janela (e do processo de GPU) existir.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const DEFAULT_SERVER = 'https://concord-community.com';
// endereços antigos do servidor oficial: quem ainda aponta para eles vai para o novo
const OLD_SERVERS = ['https://concord.yaatoro.com'];
// No Windows o .ico traz versões desenhadas para 16–48 px (barra de tarefas, Alt+Tab, título da janela)
const APP_ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// ------------------------------------------------------------------ configuração

const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    return { server: DEFAULT_SERVER, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch {
    return { server: DEFAULT_SERVER };
  }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const config = loadConfig();
if (OLD_SERVERS.includes(config.server)) {
  config.server = DEFAULT_SERVER;
  saveConfig();
}
const serverOrigin = () => new URL(config.server).origin;

/** Só a página do servidor configurado (ou a tela offline local) pode usar a ponte do app. */
function trusted(event) {
  try {
    const url = new URL(event.senderFrame.url);
    return url.origin === serverOrigin() || url.protocol === 'file:';
  } catch {
    return false;
  }
}

// Process loopback do WASAPI existe a partir do Windows 10 build 20348 (inclui todo Windows 11).
function processAudioSupported() {
  if (process.platform !== 'win32') return false;
  const build = Number(os.release().split('.')[2] ?? 0);
  return build >= 20348 && fs.existsSync(helperPath());
}

function helperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'audio-capture.exe')
    : path.join(__dirname, 'native', 'audio-capture.exe');
}

// ------------------------------------------------------------------ janela

if (!app.requestSingleInstanceLock()) app.quit();

// A transmissão de tela é capturada e codificada pelos processos do app. Quando a janela perde o foco ou fica
// coberta (ex.: a pessoa vai mexer no outro monitor), o Chromium marca o app como "em segundo plano" e o
// Windows 11 coloca esses processos em modo de eficiência (EcoQoS): a codificação atrasa e a qualidade da live
// cai (perde a camada 1080p60 e fica na de 720p30). Isso desliga esse rebaixamento.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// o Windows só mostra notificações de apps com um AppUserModelID (o mesmo appId do instalador)
if (process.platform === 'win32') app.setAppUserModelId('com.duartehiago.concord');

let win = null;
let pendingSourceId = null;
let capture = null;

/** Tamanho da janela que cabe na tela: notebooks de 14"/15" (1366x768) têm uns 730px de altura útil. */
function fitBounds() {
  const saved = config.bounds;
  if (!saved) {
    const area = screen.getPrimaryDisplay().workAreaSize;
    return { width: Math.min(1360, area.width), height: Math.min(860, area.height) };
  }
  // tamanho salvo de um monitor maior (ou que foi desconectado): encolhe e traz para dentro da tela
  const area = screen.getDisplayMatching(saved).workArea;
  const width = Math.min(saved.width, area.width);
  const height = Math.min(saved.height, area.height);
  const x = Math.min(Math.max(saved.x ?? area.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(saved.y ?? area.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}

function createWindow() {
  const bounds = fitBounds();
  // primeira abertura numa tela menor que o tamanho padrão: já abre maximizada
  const smallScreen = !config.bounds && (bounds.width < 1360 || bounds.height < 860);
  win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    title: 'Concord',
    backgroundColor: '#0a0b0f',
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // mantém áudio e vídeo fluindo quando a janela está minimizada
      backgroundThrottling: false,
    },
  });
  if (config.maximized || smallScreen) win.maximize();

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    config.maximized = win.isMaximized();
    if (!config.maximized && !win.isMinimized()) config.bounds = win.getBounds();
    saveConfig();
  };
  win.on('close', remember);
  win.on('focus', () => win?.flashFrame(false));

  // links externos abrem no navegador padrão; janelas em branco (about:blank) são a
  // transmissão aberta em outra janela, montada pela própria página do Concord
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (url === 'about:blank' && frameName.startsWith('concord-live-')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 760,
          backgroundColor: '#000000',
          autoHideMenuBar: true,
          title: 'Transmissão · Concord',
          icon: APP_ICON,
          webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
        },
      };
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== serverOrigin()) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
  win.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = navegação cancelada
    void win.loadFile(path.join(__dirname, 'offline.html'), { query: { server: config.server, error: description } });
  });

  void win.loadURL(config.server);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

// ------------------------------------------------------------------ permissões e captura de tela

function setupSession() {
  const allowed = new Set(['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write']);
  const fromServer = (origin) => {
    try {
      return new URL(origin).origin === serverOrigin();
    } catch {
      return false;
    }
  };
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed.has(permission) && fromServer(details.requestingUrl || wc.getURL()));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && fromServer(origin));

  // A página escolhe a fonte no seletor do próprio Concord (concord:select-source) e
  // só depois chama getDisplayMedia; aqui entregamos exatamente a fonte escolhida.
  // O áudio NÃO vai por aqui: ele vem do audio-capture.exe, sem as vozes da sala.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    const id = pendingSourceId;
    pendingSourceId = null;
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const source = sources.find((s) => s.id === id);
        if (source) callback({ video: source });
        else callback({});
      })
      .catch(() => callback({}));
  });
}

// ------------------------------------------------------------------ áudio sem retorno

function stopCapture() {
  if (!capture) return;
  const proc = capture;
  capture = null;
  proc.stdin.end();
  setTimeout(() => proc.exitCode === null && proc.kill(), 1500);
}

function startCapture(sender, sourceId) {
  stopCapture();
  if (!processAudioSupported()) throw new Error('Captura de áudio por processo indisponível neste sistema.');

  // janela: só o áudio do programa dela. tela: tudo, menos o próprio Concord.
  const windowMatch = /^window:(\d+):/.exec(sourceId ?? '');
  const args = windowMatch ? ['--include-window', windowMatch[1]] : ['--exclude', String(process.pid)];

  const proc = spawn(helperPath(), args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  capture = proc;
  let stderr = '';
  proc.stdout.on('data', (chunk) => {
    if (capture === proc && !sender.isDestroyed()) sender.send('concord:audio-data', chunk);
  });
  proc.stderr.on('data', (d) => {
    stderr = (stderr + d.toString()).slice(-2000);
  });
  proc.on('exit', (code) => {
    if (capture === proc) capture = null;
    if (code && !sender.isDestroyed()) sender.send('concord:audio-ended', { code, message: stderr.trim() });
  });
  proc.on('error', (err) => {
    if (!sender.isDestroyed()) sender.send('concord:audio-ended', { code: -1, message: err.message });
  });
}

// ------------------------------------------------------------------ IPC

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Origem não autorizada');
    return fn(event, ...args);
  });
}

handle('concord:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  processAudio: processAudioSupported(),
  server: config.server,
}));

/** Dados pro "Modo desenvolvedor" das configurações, que não mudam durante a sessão — pede
 * só uma vez (o lado do cliente guarda em cache). `getGPUInfo('complete')` em especial é
 * lento (pede pro processo da GPU levantar os dados) e NÃO pode entrar no polling: já
 * aconteceu de travar a transmissão de tela chamando isso a cada poucos segundos. */
handle('concord:dev-info-static', async () => {
  const gpu = await app.getGPUInfo('complete').catch(() => null);
  return {
    versions: process.versions,
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? null,
    cpuCores: os.cpus().length,
    totalMemMB: Math.round(os.totalmem() / (1024 * 1024)),
    gpu,
  };
});

/** A parte que de fato muda a cada leitura (livre pra chamar com frequência). */
handle('concord:dev-info-live', () => ({
  freeMemMB: Math.round(os.freemem() / (1024 * 1024)),
  onBattery: powerMonitor.isOnBatteryPower(),
  appMetrics: app.getAppMetrics().map((m) => ({
    type: m.type,
    pid: m.pid,
    cpuPercent: m.cpu?.percentCPUUsage ?? null,
    memoryMB: m.memory?.workingSetSize ? Math.round(m.memory.workingSetSize / 1024) : null,
  })),
}));

let devWin = null;

/** Janela independente de diagnóstico (/diagnostico) — não recebe o preload: só mostra o que
 * a janela principal transmite pelo BroadcastChannel, não precisa da ponte do desktop. */
handle('concord:open-dev-window', () => {
  if (devWin && !devWin.isDestroyed()) {
    devWin.focus();
    return;
  }
  const area = screen.getPrimaryDisplay().workAreaSize;
  devWin = new BrowserWindow({
    width: Math.min(840, area.width),
    height: Math.min(680, area.height),
    minWidth: 480,
    minHeight: 420,
    title: 'Concord · Diagnóstico',
    backgroundColor: '#120e16',
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  devWin.loadURL(`${config.server}/diagnostico`);
  devWin.on('closed', () => {
    devWin = null;
  });
});

handle('concord:sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 225 },
    fetchWindowIcons: true,
  });
  const own = win?.getMediaSourceId();
  return sources
    .filter((s) => s.id !== own)
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    }));
});

handle('concord:select-source', (_e, id) => {
  pendingSourceId = typeof id === 'string' ? id : null;
});

handle('concord:audio-start', (event, opts) => startCapture(event.sender, opts?.sourceId));
handle('concord:audio-stop', () => stopCapture());

handle('concord:set-server', (_e, url) => {
  const parsed = new URL(String(url));
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Use um endereço http(s)');
  config.server = parsed.origin;
  saveConfig();
  void win?.loadURL(config.server);
});

handle('concord:reload', () => void win?.loadURL(config.server));

// ------------------------------------------------------------------ atividade ("Jogando…", "Ouvindo…")
//
// Só lê informações locais do Windows, sem login: o jogo aberto pela Steam (registro
// RunningAppID + manifesto do jogo) e a música no título da janela do Spotify.

const { execFile } = require('node:child_process');

const runCmd = (cmd, args) =>
  new Promise((resolve) =>
    execFile(cmd, args, { windowsHide: true, timeout: 8000, encoding: 'utf8' }, (err, stdout) => resolve(err ? '' : String(stdout))),
  );

const steamNames = new Map();

async function steamGame() {
  const out = await runCmd('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID']);
  const id = parseInt(/RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(out)?.[1] ?? '0', 16);
  if (!id) return null;
  if (steamNames.has(id)) return steamNames.get(id);

  let name = null;
  const steamPath = /SteamPath\s+REG_SZ\s+(.+)/i.exec(await runCmd('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']))?.[1]?.trim();
  if (steamPath) {
    const libraries = [steamPath];
    try {
      const vdf = fs.readFileSync(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.push(m[1].replace(/\\\\/g, '\\'));
    } catch {
      // sem bibliotecas extras
    }
    for (const lib of libraries) {
      try {
        const acf = fs.readFileSync(path.join(lib, 'steamapps', `appmanifest_${id}.acf`), 'utf8');
        name = /"name"\s+"([^"]+)"/.exec(acf)?.[1] ?? null;
        if (name) break;
      } catch {
        // não está nesta biblioteca
      }
    }
  }
  name ??= 'um jogo da Steam';
  steamNames.set(id, name);
  return name;
}

// pausado o título é "Spotify"/"Spotify Premium"; tocando é "Artista - Música"
const isTrackTitle = (t) => !!t && t.includes(' - ') && !/^Spotify( Free| Premium)?$/i.test(t);

async function spotifyTrack() {
  // 1º: o capturador nativo lista também janelas ocultas (Spotify minimizado na bandeja)
  if (fs.existsSync(helperPath())) {
    const titles = (await runCmd(helperPath(), ['--window-titles', 'Spotify.exe'])).split(/\r?\n/).map((t) => t.trim());
    const track = titles.find(isTrackTitle);
    if (track) return track.slice(0, 120);
    if (titles.some(Boolean)) return null; // Spotify aberto, mas pausado
  }
  // reserva: só enxerga a janela visível
  const script =
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process Spotify -ErrorAction SilentlyContinue | ' +
    'Where-Object { $_.MainWindowTitle } | Select-Object -First 1 -ExpandProperty MainWindowTitle';
  const title = (await runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])).trim();
  return isTrackTitle(title) ? title.slice(0, 120) : null;
}

// até 2 ao mesmo tempo: o jogo da Steam e o que estiver tocando no Spotify, lado a lado
let currentActivities = [];
// a pessoa pode desligar "Mostrar o que estou jogando e ouvindo" nas configurações: enquanto
// estiver desligado, não vale a pena rodar reg.exe/powershell.exe a cada 15s pra ninguém usar o resultado
let activitySharingEnabled = true;

/** só pros dois lados do changed/since: ignora o `since`, que muda sozinho sem ser uma atividade nova. */
const stripSince = (list) => list.map(({ since, ...rest }) => rest);

async function pollActivity() {
  if (process.platform !== 'win32' || !activitySharingEnabled) return;
  let next = [];
  try {
    const game = await steamGame();
    if (game) next.push({ type: 'playing', name: game });
    const track = await spotifyTrack();
    if (track) next.push({ type: 'listening', name: 'Spotify', details: track });
  } catch {
    next = [];
  }
  const changed = JSON.stringify(stripSince(next)) !== JSON.stringify(stripSince(currentActivities));
  if (!changed) return;
  currentActivities = next.map((a) => {
    const prev = currentActivities.find((p) => p.type === a.type && p.name === a.name);
    return { ...a, since: prev?.since ?? Date.now() };
  });
  win?.webContents.send('concord:activity', currentActivities);
}

// ------------------------------------------------------------------ prioridade durante a transmissão
// Enquanto transmite, só o processo da placa de vídeo (captura e codificação por hardware) ganha prioridade
// "acima do normal". A página e o processo principal ficam no normal: quando a tela é codificada pelo
// processador (sem hardware), dar prioridade a eles fazia a live tirar CPU de tudo e o PC inteiro travava.

const CAPTURE_PROCESS = /video.?capture/i;
let boosted = new Set();

function setStreamingPriority(on) {
  const level = on ? os.constants.priority.PRIORITY_ABOVE_NORMAL : os.constants.priority.PRIORITY_NORMAL;
  const pids = new Set();
  if (on) {
    for (const m of app.getAppMetrics()) {
      if (m.type === 'GPU' || (m.type === 'Utility' && CAPTURE_PROCESS.test(`${m.serviceName ?? ''} ${m.name ?? ''}`))) pids.add(m.pid);
    }
  } else {
    for (const pid of boosted) pids.add(pid);
  }
  for (const pid of pids) {
    try {
      os.setPriority(pid, level);
    } catch {
      // processo já terminou
    }
  }
  boosted = on ? pids : new Set();
  return [...pids];
}

handle('concord:streaming', (_e, on) => setStreamingPriority(!!on));
app.on('will-quit', () => setStreamingPriority(false));

handle('concord:activity', () => currentActivities);
handle('concord:activity-refresh', async () => {
  await pollActivity();
  return currentActivities;
});
handle('concord:activity-sharing', (_e, enabled) => {
  activitySharingEnabled = enabled !== false;
  if (!activitySharingEnabled) {
    currentActivities = [];
    win?.webContents.send('concord:activity', []);
  } else {
    void pollActivity();
  }
});

// ------------------------------------------------------------------ atalhos globais
// Funcionam com o app em segundo plano (ex.: silenciar o mic no meio de um jogo).

handle('concord:global-shortcuts', (_e, map) => {
  globalShortcut.unregisterAll();
  const result = {};
  for (const [action, accelerator] of Object.entries(map ?? {})) {
    if (typeof accelerator !== 'string' || !accelerator) continue;
    try {
      result[action] = globalShortcut.register(accelerator, () => win?.webContents.send('concord:shortcut', action));
    } catch {
      result[action] = false; // combinação inválida ou já usada por outro programa
    }
  }
  // o unregisterAll acima também soltou o Ctrl+C do código compartilhado que estiver na tela
  if (clipKeyOn) {
    clipKeyOn = false;
    setClipKey(true);
  }
  return result;
});

// ------------------------------------------------------------------ código compartilhado
// Janelinha por cima de tudo (inclusive jogos em tela cheia sem borda) com o código que alguém
// da sala mandou. Não rouba o foco do jogo: Ctrl+C (atalho global enquanto ela está aberta)
// ou um clique copia para a área de transferência.

const CLIP_KEY = 'CommandOrControl+C';
const CLIP_SHOW_MS = 20_000;
let clipWin = null;
let clipText = '';
let clipTimer = null;
let clipKeyOn = false;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function clipHtml(text, from, copied) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif;user-select:none;cursor:pointer}
  .card{box-sizing:border-box;margin:8px;height:calc(100% - 16px);border-radius:22px;background:#211a28;border:1px solid #ffffff22;
    box-shadow:0 12px 32px #000a;padding:14px 18px;color:#f3ecf7;display:flex;flex-direction:column;justify-content:center;gap:6px;position:relative;overflow:hidden;
    animation:pop .35s cubic-bezier(.2,1.5,.4,1)}
  @keyframes pop{from{transform:translateY(-14px) scale(.96);opacity:0}}
  .top{font-size:12px;color:#b3a6c2;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .top b{color:#f3ecf7}
  .code{font:700 26px Consolas,"Cascadia Mono",monospace;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ff8a6b}
  .hint{font-size:13px;color:#b3a6c2}
  kbd{background:#ffffff1a;border:1px solid #ffffff33;border-bottom-width:2px;border-radius:6px;padding:1px 6px;font:600 12px "Segoe UI",sans-serif;color:#f3ecf7}
  .ok .code{color:#5cffb0}
  .bar{position:absolute;left:0;bottom:0;height:3px;background:#ff8a6b;animation:shrink ${CLIP_SHOW_MS}ms linear forwards}
  .ok .bar{display:none}
  @keyframes shrink{from{width:100%}to{width:0}}
  </style></head><body><div class="card ${copied ? 'ok' : ''}" onclick="document.title='copy-'+Date.now()">
  <div class="top">📋 <b>${escapeHtml(from)}</b> compartilhou um código</div>
  <div class="code">${escapeHtml(text)}</div>
  <div class="hint">${copied ? '✔ Copiado! Agora é só <kbd>Ctrl</kbd> + <kbd>V</kbd> no jogo' : 'Aperte <kbd>Ctrl</kbd> + <kbd>C</kbd> para copiar (ou clique aqui)'}</div>
  <div class="bar"></div></div></body></html>`;
}

function setClipKey(on) {
  if (on === clipKeyOn) return;
  if (on) {
    try {
      clipKeyOn = globalShortcut.register(CLIP_KEY, copyClip);
    } catch {
      clipKeyOn = false; // outro programa já usa o atalho: o clique continua funcionando
    }
  } else {
    if (globalShortcut.isRegistered(CLIP_KEY)) globalShortcut.unregister(CLIP_KEY);
    clipKeyOn = false;
  }
}

function closeClip() {
  clearTimeout(clipTimer);
  setClipKey(false);
  if (clipWin && !clipWin.isDestroyed()) clipWin.close();
  clipWin = null;
}

let clipFrom = '';
function copyClip() {
  if (!clipWin || clipWin.isDestroyed()) return closeClip();
  clipboard.writeText(clipText);
  setClipKey(false); // devolve o Ctrl+C para o sistema
  void clipWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(clipHtml(clipText, clipFrom, true))}`);
  clearTimeout(clipTimer);
  clipTimer = setTimeout(closeClip, 3500);
}

function showClip({ text, from, autoCopy }) {
  text = String(text ?? '').slice(0, 200);
  if (!text) return false;
  clipText = text;
  clipFrom = String(from ?? 'Alguém').slice(0, 40);
  // aparece na tela onde está o mouse (normalmente a do jogo), no topo e centralizada
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = 440;
  const height = 132;
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2);
  const y = display.workArea.y + 24;
  if (!clipWin || clipWin.isDestroyed()) {
    clipWin = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      show: false,
      alwaysOnTop: true,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    clipWin.setAlwaysOnTop(true, 'screen-saver');
    clipWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // o clique na janelinha troca o título da página (ela não tem acesso a nada além disso)
    clipWin.webContents.on('page-title-updated', (e, title) => {
      e.preventDefault();
      if (title.startsWith('copy-')) copyClip();
    });
    clipWin.on('closed', () => {
      clipWin = null;
      setClipKey(false);
    });
  } else {
    clipWin.setBounds({ x, y, width, height });
  }
  void clipWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(clipHtml(text, clipFrom, false))}`);
  clipWin.showInactive();
  clearTimeout(clipTimer);
  if (autoCopy) {
    copyClip();
  } else {
    setClipKey(true);
    clipTimer = setTimeout(closeClip, CLIP_SHOW_MS);
  }
  return true;
}

handle('concord:show-clip', (_e, data) => showClip(data ?? {}));

// ------------------------------------------------------------------ chamar atenção (estilo MSN)

const activeNotifications = new Set(); // evita que o coletor de lixo descarte a notificação antes do clique

handle('concord:notify', (_e, opts) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: String(opts?.title ?? 'Concord').slice(0, 120),
    body: String(opts?.body ?? '').slice(0, 300),
    icon: path.join(__dirname, 'build', 'icon.png'),
    silent: true, // o som é do próprio app (e respeita as preferências)
  });
  activeNotifications.add(n);
  const forget = () => activeNotifications.delete(n);
  n.on('click', () => {
    forget();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('concord:notification-click', opts?.data ?? null);
  });
  n.on('close', forget);
  n.show();
  // pisca na barra de tarefas até a janela receber foco, mas não por cima de jogo em tela cheia: piscar faz
  // o Windows mostrar a barra de tarefas na frente dele
  if (win && !win.isFocused()) {
    void fullscreenInFront().then((busy) => {
      if (!busy && win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true);
    });
  }
});

let shaking = false;

// Tremida ao vivo: o window-shake.exe (native/window-shake.cpp) sacode a janela que está na frente — o jogo,
// o navegador, o próprio Concord — mexendo a posição dela, então nada congela. Quando não tem janela de
// programa na frente (área de trabalho) ou o Windows não deixa mover, cai na tremida da tela inteira com
// foto: tira uma foto de cada monitor, mostra por cima de tudo numa janela que não recebe clique nem foco,
// sacode e some. A foto fica só na memória deste computador. Jogo em tela cheia exclusiva não treme.
const SHAKE_MS = 750;
const SHAKE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:#000}
img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;transform:scale(1.03)}
img.go{animation:s ${SHAKE_MS}ms cubic-bezier(.36,.07,.19,.97) both}
@keyframes s{
0%,100%{transform:scale(1.03) translate(0,0)}10%{transform:scale(1.03) translate(-14px,5px)}
20%{transform:scale(1.03) translate(12px,-7px)}30%{transform:scale(1.03) translate(-12px,-5px)}
40%{transform:scale(1.03) translate(14px,7px)}50%{transform:scale(1.03) translate(-9px,3px)}
60%{transform:scale(1.03) translate(9px,-5px)}70%{transform:scale(1.03) translate(-7px,5px)}
80%{transform:scale(1.03) translate(5px,-3px)}90%{transform:scale(1.03) translate(-2px,2px)}}
</style></head><body><img id="i" alt=""></body></html>`;

async function shakeAllScreens() {
  const displays = screen.getAllDisplays();
  const width = Math.max(...displays.map((d) => Math.round(d.size.width * d.scaleFactor)));
  const height = Math.max(...displays.map((d) => Math.round(d.size.height * d.scaleFactor)));
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
  const overlays = await Promise.all(
    displays.map(async (d) => {
      const source = sources.find((s) => s.display_id === String(d.id)) ?? (displays.length === 1 ? sources[0] : null);
      if (!source || source.thumbnail.isEmpty()) return null;
      const overlay = new BrowserWindow({
        ...d.bounds,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        focusable: false,
        hasShadow: false,
        enableLargerThanScreen: true,
        show: false,
        backgroundColor: '#000000',
        webPreferences: { sandbox: true, contextIsolation: true },
      });
      overlay.setIgnoreMouseEvents(true);
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      await overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SHAKE_HTML)}`);
      const jpeg = source.thumbnail.toJPEG(85).toString('base64');
      // espera a foto desenhar antes de aparecer, para não piscar preto
      await overlay.webContents.executeJavaScript(
        `new Promise((r) => { const i = document.getElementById('i'); i.onload = i.onerror = r; i.src = 'data:image/jpeg;base64,${jpeg}'; })`,
      );
      overlay.setBounds(d.bounds);
      return overlay;
    }),
  );
  const shown = overlays.filter(Boolean);
  if (!shown.length) return false;
  for (const o of shown) o.showInactive();
  // a animação começa só depois de todas aparecerem, para os monitores tremerem juntos
  await Promise.all(shown.map((o) => o.webContents.executeJavaScript("document.getElementById('i').classList.add('go')")));
  setTimeout(() => shown.forEach((o) => !o.isDestroyed() && o.destroy()), SHAKE_MS + 80);
  return true;
}

const shakerPath = () =>
  app.isPackaged ? path.join(process.resourcesPath, 'window-shake.exe') : path.join(__dirname, 'native', 'window-shake.exe');

/** Sacode ao vivo a janela da frente. Devolve o código de saída do window-shake.exe (ver o .cpp), ou -1 se ele não existe. */
function shakeForegroundWindow() {
  if (process.platform !== 'win32' || !fs.existsSync(shakerPath())) return Promise.resolve(-1);
  return new Promise((resolve) => {
    execFile(shakerPath(), ['--ms', String(SHAKE_MS)], { windowsHide: true, timeout: 5000 }, (err) => {
      resolve(!err ? 0 : typeof err.code === 'number' ? err.code : -1);
    });
  });
}

/** Plano C (sem foto da tela): sacode só a janela do app, se der para mover. */
function shakeAppWindow() {
  if (!win || win.isMinimized() || win.isFullScreen() || win.isMaximized()) return;
  const [x, y] = win.getPosition();
  const offsets = [[-12, 4], [10, -6], [-10, -4], [12, 6], [-8, 2], [8, -4], [-6, 4], [4, -2], [-2, 2], [0, 0]];
  offsets.forEach(([dx, dy], i) =>
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.setPosition(x + dx, y + dy);
    }, i * 40),
  );
}

/** Tem jogo (ou outro programa) em tela cheia na frente? Piscar o botão na barra de tarefas traz a barra por cima dele. */
function fullscreenInFront() {
  if (process.platform !== 'win32' || !fs.existsSync(shakerPath())) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(shakerPath(), ['--fullscreen'], { windowsHide: true, timeout: 2000 }, (err) => resolve(!!err && err.code === 1));
  });
}

handle('concord:shake-window', async () => {
  if (!win || shaking) return;
  shaking = true;
  try {
    const live = await shakeForegroundWindow();
    // 0: tremeu ao vivo; 5: jogo em tela cheia exclusiva (nada aparece por cima dele)
    if (live !== 0 && live !== 5 && !(await shakeAllScreens())) shakeAppWindow();
  } catch (err) {
    console.error('[tremida] tela inteira falhou:', err);
    shakeAppWindow();
  } finally {
    setTimeout(() => (shaking = false), SHAKE_MS);
  }
});

// ------------------------------------------------------------------ atualização automática
//
// A interface vem do servidor e já se atualiza a cada deploy. Aqui se atualiza a "casca"
// (Electron + capturador de áudio): o CI publica o instalador e o latest.yml em
// <servidor>/downloads/, o app baixa em segundo plano e instala ao reiniciar ou fechar.

let updateReady = null;
// estado mostrado no botão "Procurar atualizações"
let updateState = { state: 'idle', version: null, progress: 0, error: null };

function setupAutoUpdate() {
  handle('concord:update-status', () => updateReady);
  handle('concord:update-state', () => updateState);
  if (!app.isPackaged) {
    updateState = { ...updateState, state: 'dev' };
    handle('concord:update-check', () => updateState);
    return;
  }
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // as atualizações vêm do mesmo servidor que o app abre
  autoUpdater.setFeedURL({ provider: 'generic', url: `${serverOrigin()}/downloads/` });

  const setState = (patch) => {
    updateState = { ...updateState, ...patch };
    win?.webContents.send('concord:update-state', updateState);
  };
  autoUpdater.on('checking-for-update', () => setState({ state: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => setState({ state: 'latest' }));
  autoUpdater.on('update-available', (info) => setState({ state: 'downloading', version: info.version, progress: 0 }));
  autoUpdater.on('download-progress', (p) => setState({ state: 'downloading', progress: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = { version: info.version };
    setState({ state: 'ready', version: info.version, progress: 100 });
    win?.webContents.send('concord:update-ready', updateReady);
  });
  autoUpdater.on('error', (err) => {
    console.warn('[atualização]', err?.message ?? err);
    setState({ state: 'error', error: String(err?.message ?? err).slice(0, 200) });
  });

  let lastCheck = 0;
  const check = (minGapMs = 0) => {
    if (updateReady || updateState.state === 'checking' || updateState.state === 'downloading') return;
    if (Date.now() - lastCheck < minGapMs) return;
    lastCheck = Date.now();
    autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(() => check(), 5_000);
  setInterval(() => check(), 10 * 60_000);
  // ao voltar para a janela, verifica de novo (no máximo a cada 5 min)
  app.on('browser-window-focus', () => check(5 * 60_000));

  handle('concord:update-check', () => {
    check();
    return updateState;
  });
  handle('concord:update-install', () => {
    stopCapture();
    // isSilent=true: sem telas do instalador; isForceRunAfter=true: abre o app de novo
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
}

// ------------------------------------------------------------------ ciclo de vida

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Concord',
        submenu: [
          { role: 'reload', label: 'Recarregar' },
          { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' },
          { type: 'separator' },
          { role: 'resetZoom', label: 'Zoom normal' },
          { role: 'zoomIn', label: 'Aumentar zoom' },
          { role: 'zoomOut', label: 'Diminuir zoom' },
          { role: 'togglefullscreen', label: 'Tela cheia' },
          { type: 'separator' },
          { label: `Versão ${app.getVersion()}`, enabled: false },
          { type: 'separator' },
          { role: 'quit', label: 'Sair' },
        ],
      },
    ]),
  );
  setupSession();
  createWindow();
  setupAutoUpdate();
  setTimeout(() => void pollActivity(), 4_000);
  setInterval(() => void pollActivity(), 15_000);
});

app.on('before-quit', stopCapture);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
