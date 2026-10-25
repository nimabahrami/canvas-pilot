const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('captureOverlay', {
  frame: () => ipcRenderer.invoke('capture:frame'),
  complete: region => ipcRenderer.invoke('capture:complete', region),
  cancel: () => ipcRenderer.invoke('capture:cancel'),
  save: input => ipcRenderer.invoke('capture:save', input),
  resize: input => ipcRenderer.invoke('capture:resize', input),
  openSettings: () => ipcRenderer.invoke('capture:open-settings'),
  onStage: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('capture:stage', listener);
    return () => ipcRenderer.removeListener('capture:stage', listener);
  },
});
