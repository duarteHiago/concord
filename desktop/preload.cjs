// Ponte segura entre a página do Concord e o app desktop (window.concordDesktop).
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('concordDesktop', {
  info: () => ipcRenderer.invoke('concord:info'),
  devInfoStatic: () => ipcRenderer.invoke('concord:dev-info-static'),
  devInfoLive: () => ipcRenderer.invoke('concord:dev-info-live'),
  openDevWindow: () => ipcRenderer.invoke('concord:open-dev-window'),
  getSources: () => ipcRenderer.invoke('concord:sources'),
  selectSource: (id) => ipcRenderer.invoke('concord:select-source', id),
  startAudio: (sourceId) => ipcRenderer.invoke('concord:audio-start', { sourceId }),
  stopAudio: () => ipcRenderer.invoke('concord:audio-stop'),
  onAudioData: listen('concord:audio-data'),
  onAudioEnded: listen('concord:audio-ended'),
  setServer: (url) => ipcRenderer.invoke('concord:set-server', url),
  updateStatus: () => ipcRenderer.invoke('concord:update-status').catch(() => null),
  onUpdateReady: listen('concord:update-ready'),
  installUpdate: () => ipcRenderer.invoke('concord:update-install'),
  checkForUpdates: () => ipcRenderer.invoke('concord:update-check'),
  updateState: () => ipcRenderer.invoke('concord:update-state').catch(() => null),
  onUpdateState: listen('concord:update-state'),
  notify: (opts) => ipcRenderer.invoke('concord:notify', opts),
  shakeWindow: () => ipcRenderer.invoke('concord:shake-window'),
  showClip: (data) => ipcRenderer.invoke('concord:show-clip', data),
  showNudgeMessage: (data) => ipcRenderer.invoke('concord:show-nudge-message', data),
  setStreaming: (on) => ipcRenderer.invoke('concord:streaming', on).catch(() => []),
  onNotificationClick: listen('concord:notification-click'),
  getActivity: () => ipcRenderer.invoke('concord:activity').catch(() => null),
  refreshActivity: () => ipcRenderer.invoke('concord:activity-refresh').catch(() => null),
  onActivity: listen('concord:activity'),
  setActivitySharing: (enabled) => ipcRenderer.invoke('concord:activity-sharing', enabled),
  setGlobalShortcuts: (map) => ipcRenderer.invoke('concord:global-shortcuts', map),
  onShortcut: listen('concord:shortcut'),
  reload: () => ipcRenderer.invoke('concord:reload'),
  googleAuth: (link) => ipcRenderer.invoke('concord:google-auth', link),
  googleAuthCancel: () => ipcRenderer.invoke('concord:google-auth-cancel'),
});
