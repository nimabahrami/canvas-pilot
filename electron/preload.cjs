const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('canvasPilot', {
  isDesktop: true,
  platform: process.platform,
  init: () => ipcRenderer.invoke('app:init'),
  append: payload => ipcRenderer.invoke('session:append', payload),
  rename: (id, title) => ipcRenderer.invoke('session:rename', id, title),
  removeEntry: (id, entryId) => ipcRenderer.invoke('session:remove-entry', id, entryId),
  deleteSession: id => ipcRenderer.invoke('session:delete', id),
  imageForEdit: (id, imageId) => ipcRenderer.invoke('session:image-edit', id, imageId),
  updateImage: (id, imageId, image) => ipcRenderer.invoke('session:update-image', id, imageId, image),
  image: (id, imageId) => ipcRenderer.invoke('session:image', id, imageId),
  exportJournal: (id, format) => ipcRenderer.invoke('session:export', id, format),
  openFolder: id => ipcRenderer.invoke('session:open', id),
  copy: text => ipcRenderer.invoke('clipboard:copy', text),
  captureSources: () => ipcRenderer.invoke('capture:sources'),
  captureAccess: () => ipcRenderer.invoke('capture:access'),
  openCaptureSettings: () => ipcRenderer.invoke('capture:settings'),
  revealApplication: () => ipcRenderer.invoke('capture:reveal-app'),
  restart: () => ipcRenderer.invoke('app:restart'),
  hide: () => ipcRenderer.invoke('app:hide'),
  openCopyPicker: () => ipcRenderer.invoke('quick:open'),
  capture: (id, target) => ipcRenderer.invoke('capture:start', id, target),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  listModels: input => ipcRenderer.invoke('settings:models', input),
  chooseFolder: () => ipcRenderer.invoke('settings:folder'),
  enhance: (id, format) => ipcRenderer.invoke('journal:enhance', id, format),
  applyEnhancement: (id, updatedAt, entries) => ipcRenderer.invoke('journal:apply-enhancement', id, updatedAt, entries),
  onCaptureRequested: callback => {
    const listener = () => callback();
    ipcRenderer.on('capture:requested', listener);
    return () => ipcRenderer.removeListener('capture:requested', listener);
  },
});
