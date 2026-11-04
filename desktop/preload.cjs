const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folioPDF', Object.freeze({
  export: (request) => ipcRenderer.invoke('folio:pdf:export', request),
  cancel: (requestId) => ipcRenderer.invoke('folio:pdf:cancel', requestId),
  reveal: (token) => ipcRenderer.invoke('folio:pdf:reveal', token),
}));

// The desktop app's own controls (polish spec §6.4): fixed channels, every argument checked in the
// main process; callbacks get the state alone, never the IPC event.
contextBridge.exposeInMainWorld('folioDesktop', Object.freeze({
  platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux',
  info: () => ipcRenderer.invoke('folio:desktop:info'),
  revealLibrary: () => ipcRenderer.invoke('folio:desktop:reveal-library'),
  chooseLibrary: () => ipcRenderer.invoke('folio:desktop:choose-library'),
  updateAction: () => ipcRenderer.invoke('folio:desktop:update'),
  setAppearance: (mode) => ipcRenderer.invoke('folio:desktop:appearance', mode),
  setSurface: (surface) => ipcRenderer.invoke('folio:desktop:surface', surface),
  setContext: (context) => ipcRenderer.invoke('folio:context', context),
  onCommand(callback) {
    const listener = (event, name) => { if (typeof name === 'string') callback(name); };
    ipcRenderer.on('folio:command', listener);
    return () => ipcRenderer.removeListener('folio:command', listener);
  },
  onState(callback) {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('folio:desktop:state', listener);
    return () => ipcRenderer.removeListener('folio:desktop:state', listener);
  },
}));
