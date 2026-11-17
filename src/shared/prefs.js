'use strict';
/**
 * Préférences de WinDown : valeurs par défaut (celles de MacDown 0.7.3 sauf
 * indication), types attendus et nettoyage des valeurs lues sur disque.
 */

const DEFAULTS = Object.freeze({
  // Général
  language: 'auto', // auto | fr | en
  ensureOpenDocument: true,
  createFileForLinkTarget: false,
  autoRender: true, // MacDown : « markdownManualRender » inversé
  syncScrolling: true,
  editorOnRight: false,
  showWordCount: false,
  wordCountType: 0, // 0 mots, 1 caractères, 2 caractères sans espaces

  // Markdown
  extIntraEmphasis: true,
  extTables: true,
  extFencedCode: true,
  extFootnotes: true,
  extAutolink: false,
  extStrikethrough: false,
  extUnderline: false,
  extSuperscript: false,
  extHighlight: false,
  extQuote: false,
  extSmartyPants: false,

  // Rendu
  htmlStyleName: 'GitHub2',
  htmlCustomCssPath: '',
  htmlHighlightingThemeName: '', // '' = thème Prism par défaut
  htmlSyntaxHighlighting: false,
  htmlLineNumbers: false,
  htmlCodeBlockAccessory: 'none', // none | language | custom
  htmlMathJax: false,
  htmlMathJaxInlineDollar: false,
  htmlMermaid: false,
  htmlGraphviz: false,
  htmlTaskList: false,
  htmlDetectFrontMatter: false,
  htmlRendersTOC: false,
  htmlHardWrap: false,
  previewZoomRelativeToBaseFontSize: false,
  htmlDefaultDirectory: '', // '' = dossier personnel

  // Éditeur
  editorBaseFontName: 'Consolas',
  editorBaseFontSize: 14,
  editorStyleName: 'Tomorrow+',
  editorHorizontalInset: 15,
  editorVerticalInset: 30,
  editorLineSpacing: 3,
  editorWidthLimited: false,
  editorMaximumWidth: 1000,
  editorScrollsPastEnd: false,
  editorConvertTabs: false,
  editorAutoIncrementNumberedLists: true,
  editorInsertPrefixInBlock: true,
  editorCompleteMatchingCharacters: false,
  editorSmartHome: false,
  editorEnsuresNewlineAtEndOfFile: false,
  editorUnorderedListMarkerType: 0, // 0 *, 1 +, 2 -

  // Fenêtre (état, pas dans les volets de préférences)
  toolbarVisible: true,
  splitRatio: 0.5,
  editorPaneVisible: true,
  previewPaneVisible: true,
  recentFiles: [],
});

const ENUMS = {
  language: ['auto', 'fr', 'en'],
  htmlCodeBlockAccessory: ['none', 'language', 'custom'],
  wordCountType: [0, 1, 2],
  editorUnorderedListMarkerType: [0, 1, 2],
};

const RANGES = {
  editorBaseFontSize: [6, 96],
  editorHorizontalInset: [0, 200],
  editorVerticalInset: [0, 200],
  editorLineSpacing: [0, 40],
  editorMaximumWidth: [200, 5000],
  splitRatio: [0.1, 0.9],
};

/** Retourne une copie complète et valide : toute clé inconnue ou invalide revient à la valeur par défaut. */
function sanitize(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const [key, def] of Object.entries(DEFAULTS)) {
    let v = src[key];
    if (v === undefined) {
      out[key] = Array.isArray(def) ? [...def] : def;
      continue;
    }
    if (Array.isArray(def)) {
      out[key] = Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : [...def];
    } else if (typeof def === 'boolean') {
      out[key] = typeof v === 'boolean' ? v : def;
    } else if (typeof def === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) v = def;
      if (RANGES[key]) v = Math.min(RANGES[key][1], Math.max(RANGES[key][0], v));
      out[key] = v;
    } else {
      out[key] = typeof v === 'string' ? v : def;
    }
    if (ENUMS[key] && !ENUMS[key].includes(out[key])) out[key] = def;
  }
  return out;
}

/** Options du moteur de rendu déduites des préférences. */
function renderOptionsFromPrefs(p) {
  return {
    intraEmphasis: p.extIntraEmphasis,
    tables: p.extTables,
    fencedCode: p.extFencedCode,
    footnotes: p.extFootnotes,
    autolink: p.extAutolink,
    strikethrough: p.extStrikethrough,
    underline: p.extUnderline,
    superscript: p.extSuperscript,
    highlight: p.extHighlight,
    quote: p.extQuote,
    smartypants: p.extSmartyPants,
    hardWrap: p.htmlHardWrap,
    taskList: p.htmlTaskList,
    frontMatter: p.htmlDetectFrontMatter,
    toc: p.htmlRendersTOC,
    syntaxHighlighting: p.htmlSyntaxHighlighting,
    lineNumbers: p.htmlSyntaxHighlighting && p.htmlLineNumbers,
    codeBlockAccessory: p.htmlSyntaxHighlighting ? p.htmlCodeBlockAccessory : 'none',
    mermaid: p.htmlMermaid,
    graphviz: p.htmlGraphviz,
    mathjax: p.htmlMathJax,
    mathInlineDollar: p.htmlMathJaxInlineDollar,
  };
}

const LIST_MARKERS = ['* ', '+ ', '- '];

module.exports = { DEFAULTS, sanitize, renderOptionsFromPrefs, LIST_MARKERS };
