'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseMouTheme, toEditorTheme } = require('../shared/mou-theme.js');

/**
 * Styles CSS de l'aperçu, thèmes de l'éditeur (format Mou) et thèmes Prism.
 * Les fichiers fournis sont dans `resources/` ; ceux de l'utilisateur dans
 * `%APPDATA%/WinDown/Styles` et `.../Themes` (boutons « Révéler » / « Actualiser »).
 */
function createAssets({ root, userDir }) {
  const dirs = {
    styles: [path.join(root, 'resources', 'Styles'), path.join(userDir, 'Styles')],
    themes: [path.join(root, 'resources', 'Themes'), path.join(userDir, 'Themes')],
    prism: [path.join(root, 'dist', 'vendor', 'prism-themes')],
  };

  function listDir(dir, exts) {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isFile() && exts.includes(path.extname(d.name).toLowerCase()))
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  /** Retourne [{ name, file, user }] ; un fichier utilisateur masque un fichier fourni du même nom. */
  function list(kind, exts) {
    const byName = new Map();
    dirs[kind].forEach((dir, i) => {
      for (const f of listDir(dir, exts)) {
        const name = path.basename(f, path.extname(f));
        byName.set(name, { name, file: path.join(dir, f), user: i > 0 });
      }
    });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }

  const listStyles = () => list('styles', ['.css']);
  const listEditorThemes = () => list('themes', ['.style', '.styles']);
  const listPrismThemes = () => list('prism', ['.css']);

  const find = (items, name) => items.find((i) => i.name === name) || null;

  function readEditorTheme(name) {
    const items = listEditorThemes();
    const item = find(items, name) || find(items, 'Tomorrow+');
    if (!item) return toEditorTheme({ rules: {} });
    try {
      return { name: item.name, ...toEditorTheme(parseMouTheme(fs.readFileSync(item.file, 'utf8'))) };
    } catch {
      return { name: item.name, ...toEditorTheme({ rules: {} }) };
    }
  }

  // Les styles issus de Mou (dont GitHub2, défaut de MacDown) ne sont pas redistribués avec le dépôt
  // public : à défaut, on retombe sur GitHub.css, puis sur le premier style disponible.
  function styleFile(name) {
    const items = listStyles();
    const item = find(items, name) || find(items, 'GitHub') || items[0];
    return item ? item.file : null;
  }

  function prismFile(name) {
    const items = listPrismThemes();
    const item = find(items, name || 'prism') || find(items, 'prism');
    return item ? item.file : null;
  }

  function userFolder(kind) {
    const dir = dirs[kind][1];
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  return {
    listStyles,
    listEditorThemes,
    listPrismThemes,
    readEditorTheme,
    styleFile,
    prismFile,
    userFolder,
  };
}

module.exports = { createAssets };
