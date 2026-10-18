// Concord Desktop — processo principal do Electron.
// Carrega o Concord do servidor configurado e adiciona o que o navegador não oferece:
// seletor próprio de tela/janela e áudio da transmissão sem as vozes da sala (sem retorno).
const { app, BrowserWindow, desktopCapturer, ipcMain, Menu, Notification, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_SERVER = 'https://concord.yaatoro.com';

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

// o Windows só mostra notificações de apps com um AppUserModelID (o mesmo appId do instalador)
if (process.platform === 'win32') app.setAppUserModelId('com.duartehiago.concord');

let win = null;
let pendingSourceId = null;
let capture = null;

function createWindow() {
  const bounds = config.bounds ?? { width: 1360, height: 860 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 600,
    title: 'Concord',
    backgroundColor: '#0a0b0f',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // mantém áudio e vídeo fluindo quando a janela está minimizada
      backgroundThrottling: false,
    },
  });
  if (config.maximized) win.maximize();

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    config.maximized = win.isMaximized();
    if (!config.maximized && !win.isMinimized()) config.bounds = win.getBounds();
    saveConfig();
  };
  win.on('close', remember);
  win.on('focus', () => win?.flashFrame(false));

  // links externos abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
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
  // pisca na barra de tarefas até a janela receber foco
  if (win && !win.isFocused()) win.flashFrame(true);
});

let shaking = false;
handle('concord:shake-window', () => {
  if (!win || shaking || win.isMinimized() || win.isFullScreen()) return;
  if (win.isMaximized()) return; // maximizada não dá para mover: a interface treme sozinha
  shaking = true;
  const [x, y] = win.getPosition();
  const offsets = [[-12, 4], [10, -6], [-10, -4], [12, 6], [-8, 2], [8, -4], [-6, 4], [4, -2], [-2, 2], [0, 0]];
  offsets.forEach(([dx, dy], i) =>
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.setPosition(x + dx, y + dy);
      if (i === offsets.length - 1) shaking = false;
    }, i * 40),
  );
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
});

app.on('before-quit', stopCapture);
app.on('window-all-closed', () => app.quit());
