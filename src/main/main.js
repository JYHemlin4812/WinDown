'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, clipboard, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const protocols = require('./protocols.js');
protocols.registerSchemes(); // doit précéder `ready`

const { PrefsStore } = require('./prefs-store.js');
const { createAssets } = require('./assets.js');
const { readDocument, writeDocument, isMarkdownFile } = require('./files.js');
const { buildMenuTemplate } = require('./menu.js');
const { renderPdf, printHtml } = require('./export.js');
const { createShellSupport } = require('./shell-support.js');
const { translate, resolveLanguage } = require('../shared/i18n.js');
const { DEFAULTS } = require('../shared/prefs.js');

const ROOT = path.join(__dirname, '..', '..');
const VERSION = require('../../package.json').version;
const ISOLATED = Boolean(process.env.WINDOWN_USER_DATA); // essais automatisés : profil séparé, pas d'instance unique
if (ISOLATED) app.setPath('userData', process.env.WINDOWN_USER_DATA);

/** @type {PrefsStore} */
let prefs;
let assets;
let shellSupport;
let lang = 'fr';
let prefsWindow = null;
/** @type {Map<number, DocState>} */
const docs = new Map();
let lastFocusedDocId = null;

/**
 * @typedef {object} DocState
 * @property {BrowserWindow} win
 * @property {string|null} filePath
 * @property {string} text         texte initial envoyé au renderer
 * @property {string} eol
 * @property {boolean} bom
 * @property {boolean} dirty
 * @property {boolean} pristine    document sans titre jamais modifié (réutilisable à l'ouverture d'un fichier)
 * @property {boolean} forceClose
 * @property {string|null} titleOverride
 * @property {{editorVisible:boolean, previewVisible:boolean, toolbarVisible:boolean}} view
 */

const t = (key, params) => translate(lang, key, params);

/* ------------------------------------------------------------------ */
/* Utilitaires                                                        */
/* ------------------------------------------------------------------ */

function stateOf(wc) {
  const win = BrowserWindow.fromWebContents(wc);
  return win ? docs.get(win.id) : undefined;
}

function activeDoc() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && docs.has(focused.id)) return docs.get(focused.id);
  if (lastFocusedDocId && docs.has(lastFocusedDocId)) return docs.get(lastFocusedDocId);
  const first = docs.values().next();
  return first.done ? undefined : first.value;
}

function defaultDirectory() {
  const dir = prefs.get('htmlDefaultDirectory');
  return dir && fs.existsSync(dir) ? dir : app.getPath('home');
}

function docBaseDir(id) {
  const st = docs.get(id);
  if (!st) return null;
  return st.filePath ? path.dirname(st.filePath) : defaultDirectory();
}

function docName(st) {
  return st.filePath ? path.basename(st.filePath) : t('untitled');
}

function updateTitle(st) {
  if (st.win.isDestroyed()) return;
  const base = st.titleOverride || docName(st);
  st.win.setTitle(`${st.dirty ? '● ' : ''}${base} — ${t('appName')}`);
}

function showError(win, message) {
  dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, {
    type: 'error',
    title: t('dlg.errorTitle'),
    message,
    buttons: [t('dlg.ok')],
  });
}

async function getEditorSnapshot(st) {
  return st.win.webContents.executeJavaScript('window.windownApp.snapshot()');
}

function fileMtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function readErrorMessage(err, file) {
  return err && err.code === 'WD_NOT_UTF8' ? t('dlg.notUtf8', { path: file }) : t('dlg.cannotRead', { path: file });
}

/* ------------------------------------------------------------------ */
/* Fenêtres de documents                                              */
/* ------------------------------------------------------------------ */

function createDocumentWindow({ filePath = null, text = '', titleOverride = null } = {}) {
  let eol = '\n';
  let bom = false;
  let mtimeMs = null;
  if (filePath) {
    try {
      const d = readDocument(filePath);
      text = d.text;
      eol = d.eol;
      bom = d.bom;
      mtimeMs = fileMtime(filePath);
    } catch (err) {
      showError(undefined, readErrorMessage(err, filePath));
      return null;
    }
  }

  const focused = BrowserWindow.getFocusedWindow();
  const bounds = focused && docs.has(focused.id) ? focused.getBounds() : null;
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 480,
    minHeight: 320,
    ...(bounds ? { x: bounds.x + 28, y: bounds.y + 28 } : {}),
    show: false,
    backgroundColor: '#ffffff',
    title: t('appName'),
    icon: path.join(ROOT, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload', 'document.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  /** @type {DocState} */
  const st = {
    win,
    filePath,
    text,
    eol,
    bom,
    dirty: false,
    pristine: !filePath && !titleOverride,
    forceClose: false,
    mtimeMs,
    rendererReady: false,
    titleOverride,
    view: {
      editorVisible: prefs.get('editorPaneVisible'),
      previewVisible: prefs.get('previewPaneVisible'),
      toolbarVisible: prefs.get('toolbarVisible'),
    },
  };
  docs.set(win.id, st);
  lastFocusedDocId = win.id;
  updateTitle(st);

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('page-title-updated', (e) => e.preventDefault());
  win.once('ready-to-show', () => win.show());
  win.on('focus', () => {
    lastFocusedDocId = win.id;
    rebuildMenu();
  });
  // Le bouton « plein écran » de la barre d'outils suit l'état réel (F11, menu ou bouton).
  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false));
  win.on('close', (e) => onWindowClose(e, st));
  win.on('closed', () => {
    docs.delete(win.id);
    rebuildMenu();
  });
  win.webContents.on('context-menu', (_e, params) => {
    const menu = Menu.buildFromTemplate([
      { label: t('menu.cut'), role: 'cut', enabled: params.editFlags.canCut },
      { label: t('menu.copy'), role: 'copy', enabled: params.editFlags.canCopy },
      { label: t('menu.paste'), role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { label: t('menu.selectAll'), role: 'selectAll' },
    ]);
    menu.popup({ window: win });
  });

  win.loadFile(path.join(ROOT, 'dist', 'renderer', 'index.html'));
  if (filePath) addRecent(filePath);
  rebuildMenu();
  return st;
}

/** Ferme un document en proposant d'enregistrer ; retourne false si l'utilisateur annule. */
async function closeInteractive(st) {
  if (st.dirty) {
    const choice = await confirmUnsaved(st);
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDocument(st, false))) return false;
  }
  st.forceClose = true;
  if (!st.win.isDestroyed()) st.win.close();
  return true;
}

function onWindowClose(e, st) {
  if (st.forceClose || !st.dirty) return;
  e.preventDefault();
  closeInteractive(st);
}

/** @returns {Promise<'save'|'discard'|'cancel'>} */
async function confirmUnsaved(st) {
  if (!st.win.isDestroyed()) {
    if (st.win.isMinimized()) st.win.restore();
    st.win.focus();
  }
  const r = await dialog.showMessageBox(st.win, {
    type: 'warning',
    title: t('appName'),
    message: t('dlg.unsavedTitle'),
    detail: `${docName(st)}\n${t('dlg.unsavedDetail')}`,
    buttons: [t('dlg.save'), t('dlg.dontSave'), t('dlg.cancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return ['save', 'discard', 'cancel'][r.response];
}

async function quitAll() {
  for (const st of [...docs.values()]) {
    if (st.win.isDestroyed()) continue;
    if (!(await closeInteractive(st))) return; // l'utilisateur a annulé : on reste ouvert
  }
  app.quit();
}

/* ------------------------------------------------------------------ */
/* Ouverture, enregistrement                                          */
/* ------------------------------------------------------------------ */

function addRecent(filePath) {
  prefs.addRecent(filePath);
  try {
    app.addRecentDocument(filePath);
  } catch {
    /* liste de récents du système indisponible */
  }
  rebuildMenu();
}

function openPath(filePath) {
  const resolved = path.resolve(filePath);
  for (const st of docs.values()) {
    if (st.filePath && path.resolve(st.filePath).toLowerCase() === resolved.toLowerCase()) {
      if (st.win.isMinimized()) st.win.restore();
      st.win.focus();
      return st;
    }
  }
  if (!fs.existsSync(resolved)) {
    showError(undefined, t('dlg.fileNotFound', { path: resolved }));
    return null;
  }
  const reuse = activeDoc();
  // Réutiliser une fenêtre vierge seulement si son renderer a déjà demandé son contenu :
  // sinon `doc:load` pourrait arriver avant l'écouteur et laisser un éditeur vide lié au vrai fichier.
  if (reuse && reuse.pristine && reuse.rendererReady && !reuse.dirty && !reuse.win.isDestroyed()) {
    try {
      const d = readDocument(resolved);
      Object.assign(reuse, {
        filePath: resolved,
        text: d.text,
        eol: d.eol,
        bom: d.bom,
        mtimeMs: fileMtime(resolved),
        pristine: false,
        titleOverride: null,
      });
      updateTitle(reuse);
      reuse.win.webContents.send('doc:load', { text: d.text, filePath: resolved, fileName: path.basename(resolved) });
      addRecent(resolved);
      return reuse;
    } catch (err) {
      showError(reuse.win, readErrorMessage(err, resolved));
      return null;
    }
  }
  return createDocumentWindow({ filePath: resolved });
}

async function openDialog() {
  const parent = BrowserWindow.getFocusedWindow() || undefined;
  const r = await dialog.showOpenDialog(parent, {
    title: t('dlg.openTitle'),
    defaultPath: activeDoc()?.filePath ? path.dirname(activeDoc().filePath) : defaultDirectory(),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: t('dlg.markdownFiles'), extensions: ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'txt'] },
      { name: t('dlg.allFiles'), extensions: ['*'] },
    ],
  });
  if (!r.canceled) r.filePaths.forEach(openPath);
}

/** Enregistre ; retourne false si l'utilisateur annule ou si l'écriture échoue. */
async function saveDocument(st, forceDialog) {
  let snap;
  try {
    snap = await getEditorSnapshot(st);
  } catch {
    return false;
  }
  let target = st.filePath;
  if (!target || forceDialog) {
    const r = await dialog.showSaveDialog(st.win, {
      title: t('dlg.saveTitle'),
      defaultPath: target || path.join(defaultDirectory(), `${t('untitled')}.md`),
      filters: [
        { name: t('dlg.markdownFiles'), extensions: ['md', 'markdown'] },
        { name: t('dlg.textFiles'), extensions: ['txt'] },
        { name: t('dlg.allFiles'), extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePath) return false;
    target = r.filePath;
    if (!path.extname(target)) target += '.md';
  } else if (st.mtimeMs !== null && fileMtime(target) !== null && fileMtime(target) !== st.mtimeMs) {
    // Le fichier a été modifié ailleurs (autre éditeur, OneDrive…) depuis son ouverture.
    const c = await dialog.showMessageBox(st.win, {
      type: 'warning',
      title: t('appName'),
      message: t('dlg.externalTitle'),
      detail: `${target}\n${t('dlg.externalDetail')}`,
      buttons: [t('dlg.overwrite'), t('dlg.cancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (c.response !== 0) return false;
  }
  try {
    writeDocument(target, snap.text, {
      bom: st.bom,
      eol: st.eol,
      ensureNewline: prefs.get('editorEnsuresNewlineAtEndOfFile'),
    });
  } catch {
    showError(st.win, t('dlg.cannotWrite', { path: target }));
    return false;
  }
  const changedPath = st.filePath !== target;
  st.filePath = target;
  st.mtimeMs = fileMtime(target);
  st.titleOverride = null;
  st.pristine = false;
  st.dirty = false; // le renderer renverra `dirty` si le texte a changé pendant l'écriture
  updateTitle(st);
  addRecent(target);
  if (!st.win.isDestroyed()) {
    st.win.webContents.send('doc:saved', {
      rev: snap.rev,
      filePath: target,
      fileName: path.basename(target),
      pathChanged: changedPath,
    });
  }
  return true;
}

async function revertDocument(st) {
  if (!st.filePath) return;
  const r = await dialog.showMessageBox(st.win, {
    type: 'warning',
    title: t('appName'),
    message: t('dlg.revertTitle'),
    detail: t('dlg.revertDetail'),
    buttons: [t('dlg.revert'), t('dlg.cancel')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (r.response !== 0) return;
  try {
    const d = readDocument(st.filePath);
    Object.assign(st, { text: d.text, eol: d.eol, bom: d.bom, dirty: false, mtimeMs: fileMtime(st.filePath) });
    updateTitle(st);
    st.win.webContents.send('doc:load', { text: d.text, filePath: st.filePath, fileName: path.basename(st.filePath) });
  } catch (err) {
    showError(st.win, readErrorMessage(err, st.filePath));
  }
}

function helpText() {
  const file = path.join(ROOT, 'resources', `help.${lang}.md`);
  const fallback = path.join(ROOT, 'resources', 'help.en.md');
  try {
    return fs.readFileSync(fs.existsSync(file) ? file : fallback, 'utf8');
  } catch {
    return '# WinDown\n';
  }
}

/** Licences et attributions (MacDown, Mou, bibliothèques) : document en lecture dans une fenêtre. */
function openLicenses() {
  let text = '# WinDown — Version Windows JYH 2026\n';
  try {
    text = fs.readFileSync(path.join(ROOT, 'resources', 'licences.md'), 'utf8');
  } catch {
    /* texte minimal ci-dessus */
  }
  createDocumentWindow({ text, titleOverride: t('menu.licenses') });
}

function openHelp() {
  createDocumentWindow({ text: helpText(), titleOverride: t('menu.helpDoc') });
}

/* ------------------------------------------------------------------ */
/* Menu                                                               */
/* ------------------------------------------------------------------ */

let menuTimer = null;
function rebuildMenu() {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => {
    const st = activeDoc();
    const view = st ? st.view : { editorVisible: true, previewVisible: true, toolbarVisible: true };
    const withDoc = (fn) => () => {
      const s = activeDoc();
      if (s) fn(s);
    };
    const actions = {
      command: (name, arg) => {
        const s = activeDoc();
        if (s && !s.win.isDestroyed()) s.win.webContents.send('cmd', name, arg);
      },
      newDocument: () => createDocumentWindow(),
      openDialog,
      openPath,
      clearRecent: () => {
        prefs.set({ recentFiles: [] });
        app.clearRecentDocuments();
        rebuildMenu();
      },
      closeWindow: withDoc((s) => s.win.close()),
      save: withDoc((s) => saveDocument(s, false)),
      saveAs: withDoc((s) => saveDocument(s, true)),
      revert: withDoc(revertDocument),
      exportHtml: () => actions.command('exportHtml'),
      exportPdf: () => actions.command('exportPdf'),
      print: () => actions.command('print'),
      preferences: openPreferences,
      quit: quitAll,
      help: openHelp,
      licenses: openLicenses,
      about: () => {
        dialog.showMessageBox(BrowserWindow.getFocusedWindow() || undefined, {
          type: 'info',
          title: t('menu.about'),
          message: `${t('appName')} — Version Windows JYH 2026`,
          detail: t('dlg.aboutDetail', { version: VERSION }),
          buttons: [t('dlg.ok'), t('menu.licenses')],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        }).then((r) => {
          if (r.response === 1) openLicenses();
        });
      },
    };
    const template = buildMenuTemplate({
      t,
      recent: prefs.get('recentFiles'),
      view,
      devTools: !app.isPackaged,
      actions,
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }, 20);
}

/* ------------------------------------------------------------------ */
/* Préférences                                                        */
/* ------------------------------------------------------------------ */

function openPreferences() {
  if (prefsWindow && !prefsWindow.isDestroyed()) {
    if (prefsWindow.isMinimized()) prefsWindow.restore();
    prefsWindow.focus();
    return;
  }
  const parent = BrowserWindow.getFocusedWindow();
  prefsWindow = new BrowserWindow({
    width: 680,
    height: 560,
    minWidth: 560,
    minHeight: 420,
    parent: parent && docs.has(parent.id) ? parent : undefined,
    show: false,
    autoHideMenuBar: true,
    title: `${t('prefs.title')} — ${t('appName')}`,
    icon: path.join(ROOT, 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload', 'prefs.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  prefsWindow.setMenu(null);
  prefsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  prefsWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  prefsWindow.once('ready-to-show', () => prefsWindow.show());
  prefsWindow.loadFile(path.join(ROOT, 'dist', 'renderer', 'prefs.html'));
}

function broadcast(channel, ...args) {
  for (const st of docs.values()) {
    if (!st.win.isDestroyed()) st.win.webContents.send(channel, ...args);
  }
  if (prefsWindow && !prefsWindow.isDestroyed()) prefsWindow.webContents.send(channel, ...args);
}

function onPrefsChanged(changed) {
  if (changed.includes('language')) {
    lang = resolveLanguage(prefs.get('language'), app.getLocale());
    for (const st of docs.values()) updateTitle(st);
    if (prefsWindow && !prefsWindow.isDestroyed()) {
      prefsWindow.setTitle(`${t('prefs.title')} — ${t('appName')}`);
    }
  }
  if (changed.includes('htmlDefaultDirectory') || changed.includes('htmlCustomCssPath')) {
    /* lu à la demande par les protocoles */
  }
  broadcast('prefs:changed', changed, prefs.all(), lang);
  rebuildMenu();
}

/* ------------------------------------------------------------------ */
/* IPC                                                                */
/* ------------------------------------------------------------------ */

function isTrusted(event) {
  const wc = event.sender;
  return docs.has(BrowserWindow.fromWebContents(wc)?.id) || (prefsWindow && wc === prefsWindow.webContents);
}

function setupIpc() {
  ipcMain.handle('doc:init', (e) => {
    const st = stateOf(e.sender);
    if (!st) return null;
    st.rendererReady = true;
    return {
      docId: st.win.id,
      filePath: st.filePath,
      fileName: st.filePath ? path.basename(st.filePath) : null,
      text: st.text,
      prefs: prefs.all(),
      lang,
      editorTheme: assets.readEditorTheme(prefs.get('editorStyleName')),
      docBase: `windown-doc://w${st.win.id}/`,
      defaultDir: defaultDirectory(),
      version: VERSION,
      view: st.view,
      defaults: DEFAULTS,
    };
  });

  ipcMain.handle('win:toggle-fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || !docs.has(win.id)) return false;
    win.setFullScreen(!win.isFullScreen());
    return !win.isFullScreen();
  });

  ipcMain.on('doc:dirty', (e, dirty) => {
    const st = stateOf(e.sender);
    if (!st) return;
    st.dirty = Boolean(dirty);
    if (dirty) st.pristine = false;
    updateTitle(st);
  });

  ipcMain.on('doc:view', (e, view) => {
    const st = stateOf(e.sender);
    if (!st || !view) return;
    st.view = {
      editorVisible: Boolean(view.editorVisible),
      previewVisible: Boolean(view.previewVisible),
      toolbarVisible: Boolean(view.toolbarVisible),
    };
    rebuildMenu();
  });

  ipcMain.handle('prefs:set', (e, patch) => {
    if (!isTrusted(e) || !patch || typeof patch !== 'object') return false;
    prefs.set(patch);
    return true;
  });

  ipcMain.handle('prefs:get', (e) => {
    if (!isTrusted(e)) return null;
    return {
      prefs: prefs.all(),
      lang,
      styles: assets.listStyles().map((s) => ({ name: s.name, user: s.user })),
      editorThemes: assets.listEditorThemes().map((s) => ({ name: s.name, user: s.user })),
      prismThemes: assets.listPrismThemes().map((s) => ({ name: s.name })),
      defaults: DEFAULTS,
    };
  });

  ipcMain.handle('assets:editor-theme', (e, name) => (isTrusted(e) ? assets.readEditorTheme(String(name)) : null));

  ipcMain.handle('assets:style-text', (e, name) => {
    if (!isTrusted(e)) return '';
    const file = name === '__custom__' ? customCssFile() : assets.styleFile(String(name));
    try {
      return file ? fs.readFileSync(file, 'utf8') : '';
    } catch {
      return '';
    }
  });

  ipcMain.handle('assets:prism-text', (e, name) => {
    if (!isTrusted(e)) return '';
    const file = assets.prismFile(String(name || ''));
    try {
      return file ? fs.readFileSync(file, 'utf8') : '';
    } catch {
      return '';
    }
  });

  // Ressources fournies, désignées par un nom fixe (jamais par un chemin venu du renderer).
  const VENDOR_FILES = {
    mermaid: 'vendor/mermaid.min.js',
    viz: 'vendor/viz-global.js',
    mathjax: 'vendor/tex-mml-svg.js',
    post: 'post.js',
    extra: 'extra.css',
  };
  const vendorPath = (name) =>
    Object.hasOwn(VENDOR_FILES, name) ? path.join(ROOT, 'dist', 'preview', VENDOR_FILES[name]) : null;

  ipcMain.handle('assets:vendor-text', (e, name) => {
    if (!isTrusted(e)) return '';
    const file = vendorPath(name);
    try {
      return file ? fs.readFileSync(file, 'utf8') : '';
    } catch {
      return '';
    }
  });

  ipcMain.handle('assets:vendor-url', (e, name) => {
    if (!isTrusted(e)) return '';
    const file = vendorPath(name);
    return file ? require('node:url').pathToFileURL(file).href : '';
  });

  ipcMain.handle('prefs:reveal', (e, kind) => {
    if (!isTrusted(e)) return false;
    const map = { styles: 'styles', themes: 'themes' };
    if (!map[kind]) return false;
    shell.openPath(assets.userFolder(map[kind]));
    return true;
  });

  ipcMain.handle('prefs:choose', async (e, kind) => {
    if (!isTrusted(e)) return null;
    const parent = BrowserWindow.fromWebContents(e.sender) || undefined;
    if (kind === 'css') {
      const r = await dialog.showOpenDialog(parent, {
        properties: ['openFile'],
        filters: [{ name: 'CSS', extensions: ['css'] }],
      });
      return r.canceled ? null : r.filePaths[0];
    }
    if (kind === 'directory') {
      const r = await dialog.showOpenDialog(parent, { properties: ['openDirectory'], defaultPath: defaultDirectory() });
      return r.canceled ? null : r.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('shell:status', async (e) => (isTrusted(e) ? shellSupport.status() : null));
  ipcMain.handle('shell:install', async (e) => {
    if (!isTrusted(e)) return null;
    try {
      return { ok: true, status: await shellSupport.install() };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('shell:uninstall', async (e) => {
    if (!isTrusted(e)) return null;
    try {
      return { ok: true, status: await shellSupport.uninstall() };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  ipcMain.handle('system:fonts-fallback', () => ['Consolas', 'Cascadia Mono', 'Cascadia Code', 'Courier New', 'Lucida Console']);

  ipcMain.handle('clipboard:write-text', (e, text) => {
    if (!isTrusted(e)) return false;
    clipboard.writeText(String(text));
    return true;
  });

  ipcMain.handle('link:open', (e, href) => openLinkFromPreview(e, String(href || '')));

  ipcMain.handle('files:open-paths', (e, paths) => {
    if (!isTrusted(e) || !Array.isArray(paths)) return false;
    for (const p of paths) if (typeof p === 'string' && isMarkdownFile(p)) openPath(p);
    return true;
  });

  ipcMain.handle('export:html', async (e, { html, name }) => {
    const st = stateOf(e.sender);
    if (!st) return { ok: false };
    const base = (name || docName(st)).replace(/\.[^.]+$/, '');
    const r = await dialog.showSaveDialog(st.win, {
      title: t('dlg.exportHtmlTitle'),
      defaultPath: path.join(st.filePath ? path.dirname(st.filePath) : defaultDirectory(), `${base}.html`),
      filters: [{ name: t('dlg.htmlFiles'), extensions: ['html', 'htm'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(r.filePath, String(html), 'utf8');
      return { ok: true, path: r.filePath };
    } catch {
      showError(st.win, t('dlg.cannotWrite', { path: r.filePath }));
      return { ok: false };
    }
  });

  ipcMain.handle('export:pdf', async (e, { html, name }) => {
    const st = stateOf(e.sender);
    if (!st) return { ok: false };
    const base = (name || docName(st)).replace(/\.[^.]+$/, '');
    const r = await dialog.showSaveDialog(st.win, {
      title: t('dlg.exportPdfTitle'),
      defaultPath: path.join(st.filePath ? path.dirname(st.filePath) : defaultDirectory(), `${base}.pdf`),
      filters: [{ name: t('dlg.pdfFiles'), extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      const pdf = await renderPdf(String(html), { tempDir: app.getPath('temp') });
      fs.writeFileSync(r.filePath, pdf);
      return { ok: true, path: r.filePath };
    } catch {
      showError(st.win, t('dlg.cannotWrite', { path: r.filePath }));
      return { ok: false };
    }
  });

  ipcMain.handle('export:print', async (e, { html }) => {
    const st = stateOf(e.sender);
    if (!st) return { ok: false };
    try {
      const r = await printHtml(String(html), { tempDir: app.getPath('temp') });
      return { ok: r.success };
    } catch {
      return { ok: false };
    }
  });
}

function customCssFile() {
  const p = prefs.get('htmlCustomCssPath');
  return p && fs.existsSync(p) && path.extname(p).toLowerCase() === '.css' ? p : null;
}

/** Clic sur un lien dans l'aperçu : web et courriel vers le système, documents Markdown dans WinDown. */
async function openLinkFromPreview(e, href) {
  const st = stateOf(e.sender);
  if (!st) return false;
  let url = null;
  try {
    url = new URL(href);
  } catch {
    url = null;
  }
  if (url && ['http:', 'https:', 'mailto:'].includes(url.protocol)) {
    await shell.openExternal(url.href);
    return true;
  }
  // « C:/notes/a.md » est lu par URL comme le protocole « c: » : c'est un chemin, pas un protocole.
  const isDrivePath = url && /^[a-z]:$/i.test(url.protocol);
  if (url && !isDrivePath && url.protocol !== 'windown-doc:' && url.protocol !== 'file:') return false;

  // Lien relatif ou chemin local : cible = fichier Markdown, résolu depuis le dossier du document.
  let rel = href.split('#')[0].split('?')[0];
  if (url && url.protocol === 'windown-doc:') rel = url.pathname.replace(/^\/+/, '');
  if (url && url.protocol === 'file:') {
    if (url.host) return false; // file://serveur/… : chemin réseau
    try {
      rel = require('node:url').fileURLToPath(url);
    } catch {
      return false;
    }
  } else {
    try {
      rel = decodeURIComponent(rel);
    } catch {
      /* garder tel quel */
    }
  }
  if (!rel) return false;
  const base = docBaseDir(st.win.id);
  const target = path.resolve(base, rel);
  if (!protocols.isAllowedLocalTarget(base, target) || !isMarkdownFile(target)) {
    return false;
  }
  if (!fs.existsSync(target)) {
    if (prefs.get('createFileForLinkTarget')) {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, '', 'utf8');
      } catch {
        showError(st.win, t('dlg.cannotCreate', { path: target }));
        return false;
      }
    } else {
      showError(st.win, t('dlg.fileNotFound', { path: target }));
      return false;
    }
  }
  openPath(target);
  return true;
}

function hardenSession() {
  const ses = session.defaultSession;
  // Aucune requête file://serveur/… (UNC) : elle ouvrirait une connexion SMB et enverrait le hachage NTLM.
  ses.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => {
    let host = '';
    try {
      host = new URL(details.url).host;
    } catch {
      host = 'invalide';
    }
    callback({ cancel: host !== '' });
  });
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'local-fonts' && prefsWindow && !prefsWindow.isDestroyed() && wc === prefsWindow.webContents);
  });
  ses.setPermissionCheckHandler((wc, permission) =>
    permission === 'local-fonts' && Boolean(prefsWindow) && !prefsWindow.isDestroyed() && wc === prefsWindow.webContents
  );
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                          */
/* ------------------------------------------------------------------ */

function filesFromArgv(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  return args.filter((a) => a && !a.startsWith('-') && fs.existsSync(a) && fs.statSync(a).isFile());
}

if (!ISOLATED && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv);
    if (files.length) files.forEach(openPath);
    else {
      const st = createDocumentWindow();
      if (st) st.win.focus();
    }
  });

  app.whenReady().then(async () => {
    prefs = new PrefsStore(path.join(app.getPath('userData'), 'preferences.json'));
    prefs.onChange(onPrefsChanged);
    lang = resolveLanguage(prefs.get('language'), app.getLocale());
    assets = createAssets({ root: ROOT, userDir: app.getPath('userData') });
    shellSupport = createShellSupport({
      localAppData: process.env.LOCALAPPDATA || app.getPath('appData'),
      exePath: process.execPath,
      appPath: ROOT,
      isPackaged: app.isPackaged,
    });
    protocols.registerHandlers({
      root: ROOT,
      assets,
      getDocBaseDir: docBaseDir,
      getCustomCss: customCssFile,
    });
    hardenSession();
    setupIpc();
    rebuildMenu();

    const files = filesFromArgv(process.argv);
    if (files.length) files.forEach(openPath);
    else if (prefs.get('ensureOpenDocument') || process.env.WINDOWN_SMOKE_OUT) createDocumentWindow();

    if (process.env.WINDOWN_SMOKE_OUT) {
      require('./smoke.js').run({
        docs,
        prefs,
        app,
        openPath,
        createDocumentWindow,
        saveDocument,
        openPreferences,
        getPrefsWindow: () => prefsWindow,
      });
    }
  });

  app.on('window-all-closed', () => {
    prefs?.flush();
    app.quit();
  });
  app.on('before-quit', () => prefs?.flush());
}
