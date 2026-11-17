'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windownPrefs', {
  get: () => ipcRenderer.invoke('prefs:get'),
  set: (patch) => ipcRenderer.invoke('prefs:set', patch),
  reveal: (kind) => ipcRenderer.invoke('prefs:reveal', kind),
  choose: (kind) => ipcRenderer.invoke('prefs:choose', kind),
  fontsFallback: () => ipcRenderer.invoke('system:fonts-fallback'),
  shellStatus: () => ipcRenderer.invoke('shell:status'),
  shellInstall: () => ipcRenderer.invoke('shell:install'),
  shellUninstall: () => ipcRenderer.invoke('shell:uninstall'),
  onChanged: (cb) => {
    const handler = (_e, changed, prefs, lang) => cb(changed, prefs, lang);
    ipcRenderer.on('prefs:changed', handler);
    return () => ipcRenderer.removeListener('prefs:changed', handler);
  },
});
