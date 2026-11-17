'use strict';
/**
 * Lecteur des thèmes d'éditeur au format Mou (`.style`), le format de MacDown :
 *
 *   editor
 *   foreground: cccccc
 *   background: 2d2d2d
 *
 *   H1
 *   foreground: 66cccc
 *   font-style: bold
 *   font-size: 24px
 *
 * Retourne { rules: { editor: {foreground, background, caret}, H1: {...}, ... } }.
 */

const KNOWN = new Set([
  'editor', 'editor-selection', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'EMPH', 'STRONG', 'HRULE',
  'LIST_BULLET', 'LIST_ENUMERATOR', 'LINK', 'AUTO_LINK_URL', 'AUTO_LINK_EMAIL', 'REFERENCE',
  'IMAGE', 'CODE', 'VERBATIM', 'HTML_ENTITY', 'COMMENT', 'BLOCKQUOTE', 'HTML', 'HTML_BLOCK',
  'NOTE', 'STRIKE', 'TABLE',
]);

function parseMouTheme(text) {
  const rules = {};
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    const kv = /^([a-z-]+)\s*:\s*(.+)$/i.exec(line); // asvs-ignore: RegExp.exec, aucune exécution de code.
    if (kv && current) {
      current[kv[1].toLowerCase()] = kv[2].trim();
      continue;
    }
    if (!kv) {
      current = {};
      rules[line] = current;
    }
  }
  for (const key of Object.keys(rules)) if (!KNOWN.has(key)) delete rules[key];
  return { rules };
}

/** Normalise une couleur Mou (« 2d2d2d », « #2d2d2d ») en `#rrggbb` ; undefined si invalide. */
function cssColor(v) {
  if (!v) return undefined;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(v).trim()); // asvs-ignore: RegExp.exec, aucune exécution de code.
  return m ? `#${m[1].toLowerCase()}` : undefined;
}

/** Valeurs prêtes à l'emploi pour l'éditeur. */
function toEditorTheme(parsed) {
  const r = parsed.rules || {};
  const editor = r.editor || {};
  const sel = r['editor-selection'] || {};
  const get = (k, prop) => cssColor((r[k] || {})[prop]);
  const dark = isDark(cssColor(editor.background) || '#ffffff');
  return {
    dark,
    foreground: cssColor(editor.foreground) || (dark ? '#dddddd' : '#222222'),
    background: cssColor(editor.background) || (dark ? '#222222' : '#ffffff'),
    caret: cssColor(editor.caret) || cssColor(editor.foreground) || (dark ? '#ffffff' : '#000000'),
    selectionBackground: cssColor(sel.background) || (dark ? '#515151' : '#b5d5ff'),
    selectionForeground: cssColor(sel.foreground),
    colors: Object.fromEntries(
      Object.keys(r)
        .filter((k) => k !== 'editor' && k !== 'editor-selection')
        .map((k) => [
          k,
          {
            color: get(k, 'foreground'),
            background: get(k, 'background'),
            bold: /bold/i.test((r[k]['font-style'] || '')),
            italic: /italic/i.test((r[k]['font-style'] || '')),
            size: r[k]['font-size'],
          },
        ])
    ),
  };
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

module.exports = { parseMouTheme, toEditorTheme, cssColor };
