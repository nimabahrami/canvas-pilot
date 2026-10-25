const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, callback) => {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('quickCopy', {
  list: () => ipcRenderer.invoke('quick:list'),
  copy: (id, format) => ipcRenderer.invoke('quick:copy', id, format),
  close: () => ipcRenderer.invoke('quick:close'),
  onShow: callback => subscribe('quick:show', callback),
  onHide: callback => subscribe('quick:hide', callback),
});
