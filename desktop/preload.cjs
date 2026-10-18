// Ponte segura entre a página do Concord e o app desktop (window.concordDesktop).
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('concordDesktop', {
  info: () => ipcRenderer.invoke('concord:info'),
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
  reload: () => ipcRenderer.invoke('concord:reload'),
});
