const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    selectFolder: () => ipcRenderer.invoke('select-folder')
});
