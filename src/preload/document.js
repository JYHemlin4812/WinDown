'use strict';
/**
 * Pont de la fenêtre de document : seules les fonctions listées ici sont
 * exposées au renderer. L'aperçu (iframe isolée) n'y a jamais accès.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, cb) => {
  const handler = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('windown', {
  init: () => ipcRenderer.invoke('doc:init'),
  setDirty: (dirty) => ipcRenderer.send('doc:dirty', Boolean(dirty)),
  setView: (view) => ipcRenderer.send('doc:view', view),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  editorTheme: (name) => ipcRenderer.invoke('assets:editor-theme', name),
  styleText: (name) => ipcRenderer.invoke('assets:style-text', name),
  prismText: (name) => ipcRenderer.invoke('assets:prism-text', name),
  vendorText: (name) => ipcRenderer.invoke('assets:vendor-text', name),
  vendorUrl: (name) => ipcRenderer.invoke('assets:vendor-url', name),
  copyText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  openLink: (href) => ipcRenderer.invoke('link:open', href),
  openPaths: (paths) => ipcRenderer.invoke('files:open-paths', paths),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  exportHtml: (payload) => ipcRenderer.invoke('export:html', payload),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  print: (payload) => ipcRenderer.invoke('export:print', payload),
  toggleFullscreen: () => ipcRenderer.invoke('win:toggle-fullscreen'),
  onFullscreen: (cb) => on('win:fullscreen', cb),
  onCommand: (cb) => on('cmd', cb),
  onPrefsChanged: (cb) => on('prefs:changed', cb),
  onLoad: (cb) => on('doc:load', cb),
  onSaved: (cb) => on('doc:saved', cb),
});
