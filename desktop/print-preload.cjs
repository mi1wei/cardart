const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folioPrint', Object.freeze({
  config: () => ipcRenderer.invoke('folio:pdf:config'),
  ready: (result) => ipcRenderer.invoke('folio:pdf:ready', result),
}));
