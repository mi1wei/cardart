const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folioPDF', Object.freeze({
  export: (request) => ipcRenderer.invoke('folio:pdf:export', request),
  cancel: (requestId) => ipcRenderer.invoke('folio:pdf:cancel', requestId),
  reveal: (token) => ipcRenderer.invoke('folio:pdf:reveal', token),
}));
