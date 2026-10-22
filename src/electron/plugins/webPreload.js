'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const listen = (channel, callback) => {
  if (typeof callback !== 'function') throw new TypeError('callback required');
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
// Wait for the page's initial bridge work to settle before offering its first
// presentation. Every call still uses the same document capability checks.
// This is a one-shot opening barrier, not an animation or background service.
let pending = 0, loaded = false, presented = false, presentationTimer;
function offerPresentation() {
  clearTimeout(presentationTimer);
  if (!loaded || pending || presented) return;
  presentationTimer = setTimeout(() => {
    if (pending || presented) return;
    presented = true;
    void ipcRenderer.invoke('plugins:web:call', 'present').catch(() => {});
  }, 32);
}
function call(op, args) {
  pending++; clearTimeout(presentationTimer);
  return ipcRenderer.invoke('plugins:web:call', op, args).finally(() => { pending--; offerPresentation(); });
}
window.addEventListener('DOMContentLoaded', () => { loaded = true; offerPresentation(); }, { once: true });
window.addEventListener('pagehide', () => { presented = true; clearTimeout(presentationTimer); }, { once: true });
// Internal resume barrier follows context/data delivery in IPC order. It does
// not expose lifecycle control to author code or require author cooperation.
ipcRenderer.on('plugins:web:resume', (_event, epoch) => {
  void ipcRenderer.invoke('plugins:web:call', 'resumed', epoch).catch(() => {});
});
// Fixed capability methods, never expose ipcRenderer or an IPC channel argument.
contextBridge.exposeInMainWorld('tm', Object.freeze({
  version: 1,
  context: () => call('context'),
  onContext: callback => listen('plugins:web:context', callback),
  subscribe: sources => call('subscribe', sources),
  onData: callback => listen('plugins:web:data', callback),
  restoreOriginal: () => call('restore'),
  storage: Object.freeze({
    get: key => call('get', { key }),
    set: (key, value) => call('set', { key, value }),
    delete: key => call('delete', { key })
  })
}));
