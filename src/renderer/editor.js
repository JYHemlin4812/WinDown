'use strict';
/**
 * Éditeur CodeMirror 6 : coloration Markdown pilotée par les thèmes Mou de
 * MacDown, aides à la saisie (listes, citations, caractères appariés,
 * tabulations, début de ligne), commandes de mise en forme.
 */
const { EditorState, Compartment, Prec, EditorSelection } = require('@codemirror/state');
const { EditorView, keymap, drawSelection, dropCursor, ViewPlugin, Decoration } = require('@codemirror/view');
const { history, historyKeymap, defaultKeymap, undo, redo } = require('@codemirror/commands');
const { markdown, markdownLanguage } = require('@codemirror/lang-markdown');
const { syntaxHighlighting, HighlightStyle, syntaxTree } = require('@codemirror/language');
const { tags: t } = require('@lezer/highlight');
const search = require('@codemirror/search');

const Fmt = require('./format.js');
const Smart = require('./smart-edit.js');
const { LIST_MARKERS } = require('../shared/prefs.js');

const SEARCH_PHRASES_FR = {
  Find: 'Rechercher',
  Replace: 'Remplacer',
  next: 'suivant',
  previous: 'précédent',
  all: 'tout',
  'match case': 'respecter la casse',
  regexp: 'expression régulière',
  'by word': 'mot entier',
  replace: 'remplacer',
  'replace all': 'tout remplacer',
  close: 'fermer',
  'current match': 'occurrence courante',
  'on line': 'ligne',
  'replaced $ matches': '$ occurrences remplacées',
  'replaced match on line $': 'occurrence remplacée à la ligne $',
  'Go to line': 'Aller à la ligne',
  go: 'aller',
};

/* ---------------------------------------------------------------- */
/* Thème                                                            */
/* ---------------------------------------------------------------- */

function highlightRules(theme) {
  const c = theme.colors || {};
  const rule = (key, tag, extra = {}) => {
    const s = c[key];
    if (!s) return null;
    const spec = { tag };
    if (s.color) spec.color = s.color;
    if (s.background) spec.backgroundColor = s.background;
    if (s.bold) spec.fontWeight = 'bold';
    if (s.italic) spec.fontStyle = 'italic';
    if (s.size && /^\d+(\.\d+)?px$/.test(s.size)) spec.fontSize = s.size;
    return { ...spec, ...extra };
  };
  return [
    rule('H1', t.heading1),
    rule('H2', t.heading2),
    rule('H3', t.heading3),
    rule('H4', t.heading4),
    rule('H5', t.heading5),
    rule('H6', t.heading6),
    rule('EMPH', t.emphasis),
    rule('STRONG', t.strong),
    rule('HRULE', t.contentSeparator),
    rule('LINK', t.link),
    rule('AUTO_LINK_URL', t.url),
    rule('REFERENCE', t.labelName),
    rule('CODE', t.monospace),
    rule('HTML_ENTITY', t.character),
    rule('COMMENT', t.comment),
    rule('BLOCKQUOTE', t.quote),
  ].filter(Boolean);
}

function makeTheme(theme, p) {
  const fontFamily = `"${p.editorBaseFontName}", "Cascadia Mono", Consolas, "Courier New", monospace`;
  const limited = p.editorWidthLimited;
  const sc = (k) => (theme.colors && theme.colors[k] && theme.colors[k].color) || null;
  const extra = {};
  const add = (sel, key) => {
    if (sc(key)) extra[sel] = { color: sc(key) };
  };
  add('.cm-content .cm-wd-bullet', 'LIST_BULLET');
  add('.cm-content .cm-wd-enum', 'LIST_ENUMERATOR');
  add('.cm-content .cm-wd-image', 'IMAGE');
  add('.cm-content .cm-wd-autolink-email', 'AUTO_LINK_EMAIL');
  const lineHeight = 1.25 + p.editorLineSpacing / p.editorBaseFontSize;

  return [
    EditorView.theme(
      {
        '&': { color: theme.foreground, backgroundColor: theme.background, height: '100%' },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': { fontFamily, fontSize: `${p.editorBaseFontSize}px`, lineHeight: String(lineHeight), overflow: 'auto' },
        '.cm-content': {
          caretColor: theme.caret,
          padding: `${p.editorVerticalInset}px ${p.editorHorizontalInset}px ${p.editorScrollsPastEnd ? '70vh' : p.editorVerticalInset + 'px'}`,
          maxWidth: limited ? `${p.editorMaximumWidth}px` : 'none',
          margin: limited ? '0 auto' : '0',
          boxSizing: 'border-box',
        },
        '.cm-line': { padding: '0' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: theme.caret, borderLeftWidth: '2px' },
        '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
          backgroundColor: theme.selectionBackground,
        },
        '.cm-content ::selection': { backgroundColor: theme.selectionBackground },
        '.cm-panels': { backgroundColor: theme.dark ? '#2b2b2b' : '#f0f0f0', color: theme.dark ? '#ddd' : '#222' },
        '.cm-panels-top': { borderBottom: `1px solid ${theme.dark ? '#444' : '#ccc'}` },
        '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '13px' },
        '.cm-searchMatch': { backgroundColor: theme.dark ? '#7a5f00aa' : '#ffe08a' },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: theme.dark ? '#b38600' : '#ffb300' },
        ...extra,
      },
      { dark: theme.dark }
    ),
    syntaxHighlighting(HighlightStyle.define(highlightRules(theme))),
  ];
}

/** Marque les puces, numéros de liste, images et courriels automatiques (couleurs LIST_BULLET, etc.). */
const markupDecorations = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view);
    }
    update(u) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = this.build(u.view);
      }
    }
    build(view) {
      const ranges = [];
      const doc = view.state.doc;
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (node) => {
            if (node.name === 'ListMark') {
              const txt = doc.sliceString(node.from, node.to);
              ranges.push(Decoration.mark({ class: /\d/.test(txt) ? 'cm-wd-enum' : 'cm-wd-bullet' }).range(node.from, node.to));
            } else if (node.name === 'Image') {
              ranges.push(Decoration.mark({ class: 'cm-wd-image' }).range(node.from, node.to));
            } else if (node.name === 'Autolink') {
              const txt = doc.sliceString(node.from, node.to);
              if (/^<[^>:\s]+@[^>\s]+>$/.test(txt)) {
                ranges.push(Decoration.mark({ class: 'cm-wd-autolink-email' }).range(node.from, node.to));
              }
            }
          },
        });
      }
      return Decoration.set(ranges, true);
    }
  },
  { decorations: (v) => v.decorations }
);

/* ---------------------------------------------------------------- */
/* Création                                                         */
/* ---------------------------------------------------------------- */

function createEditor({ parent, doc, prefs, theme, lang, onChange, onScroll, onDropFiles }) {
  let p = prefs;
  let curTheme = theme;
  let curLang = lang;
  const themeComp = new Compartment();
  const phrasesComp = new Compartment();
  const attrsComp = new Compartment();

  const state = () => view.state;
  const text = () => view.state.doc.toString();

  /** Applique le résultat d'une transformation pure de format.js à la sélection courante. */
  function runFormat(fn, ...args) {
    const sel = view.state.selection.main;
    const edit = fn({ text: text(), from: sel.from, to: sel.to }, ...args);
    if (!edit.changes.length && edit.anchor === sel.anchor && edit.head === sel.head) return true;
    view.dispatch({
      changes: edit.changes,
      selection: EditorSelection.single(edit.anchor, edit.head),
      scrollIntoView: true,
      userEvent: 'input',
    });
    view.focus();
    return true;
  }

  const indentUnit = () => (p.editorConvertTabs ? '    ' : '\t');

  /* -- Touches ---------------------------------------------------- */

  const enterKey = (v) => {
    const sel = v.state.selection.main;
    if (!sel.empty || v.composing) return false;
    const line = v.state.doc.lineAt(sel.head);
    const r = Smart.continueLine(line.text, sel.head - line.from, {
      insertPrefixInBlock: p.editorInsertPrefixInBlock,
      autoIncrement: p.editorAutoIncrementNumberedLists,
    });
    if (!r) return false;
    v.dispatch({
      changes: r.changes.map((c) => ({ from: c.from + line.from, to: c.to + line.from, insert: c.insert })),
      selection: { anchor: r.cursor + line.from },
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  };

  const tabKey = (v) => {
    const sel = v.state.selection.main;
    if (!sel.empty) return runFormat(Fmt.indentLines, indentUnit());
    if (p.editorConvertTabs) {
      const line = v.state.doc.lineAt(sel.head);
      const spaces = Smart.tabToSpaces(line.text, sel.head - line.from);
      v.dispatch({ changes: { from: sel.head, insert: spaces }, selection: { anchor: sel.head + spaces.length }, userEvent: 'input' });
    } else {
      v.dispatch({ changes: { from: sel.from, to: sel.to, insert: '\t' }, selection: { anchor: sel.from + 1 }, userEvent: 'input' });
    }
    return true;
  };

  const backspaceKey = (v) => {
    const sel = v.state.selection.main;
    if (!sel.empty || v.composing) return false;
    if (p.editorCompleteMatchingCharacters) {
      const around = v.state.doc.sliceString(Math.max(0, sel.head - 1), Math.min(v.state.doc.length, sel.head + 1));
      const r = Smart.deleteMatching(around, around.length === 2 ? 1 : -1);
      if (r) {
        const base = Math.max(0, sel.head - 1);
        v.dispatch({
          changes: r.changes.map((c) => ({ from: c.from + base, to: c.to + base, insert: c.insert })),
          selection: { anchor: r.cursor + base },
          userEvent: 'delete.backward',
        });
        return true;
      }
    }
    if (p.editorConvertTabs) {
      const line = v.state.doc.lineAt(sel.head);
      const r = Smart.unindentSpaces(line.text, sel.head - line.from);
      if (r) {
        v.dispatch({
          changes: r.changes.map((c) => ({ from: c.from + line.from, to: c.to + line.from, insert: c.insert })),
          selection: { anchor: r.cursor + line.from },
          userEvent: 'delete.backward',
        });
        return true;
      }
    }
    return false;
  };

  const homeKey = (v) => {
    if (!p.editorSmartHome) return false;
    const sel = v.state.selection.main;
    const line = v.state.doc.lineAt(sel.head);
    const block = v.lineBlockAt(sel.head);
    if (block.height > (parseFloat(getComputedStyle(v.contentDOM).lineHeight) || 20) * 1.6) return false; // ligne repliée
    const target = Smart.smartHomeTarget(line.text, sel.head - line.from);
    if (target === null) return false;
    v.dispatch({ selection: { anchor: line.from + target }, scrollIntoView: true });
    return true;
  };

  const inputHandler = EditorView.inputHandler.of((v, from, to, input) => {
    if (!p.editorCompleteMatchingCharacters || v.composing || input.length !== 1) return false;
    const start = Math.max(0, from - 1);
    const end = Math.min(v.state.doc.length, to + 1);
    const local = v.state.doc.sliceString(start, end);
    const r = Smart.completeChar(local, from - start, to - start, input, { strikethrough: p.extStrikethrough });
    if (!r) return false;
    v.dispatch({
      changes: r.changes.map((c) => ({ from: c.from + start, to: c.to + start, insert: c.insert })),
      selection: EditorSelection.single(r.anchor + start, r.head + start),
      userEvent: 'input.type',
    });
    return true;
  });

  const dropHandler = EditorView.domEventHandlers({
    drop(event, v) {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length && onDropFiles) {
        event.preventDefault();
        const pos = v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? v.state.selection.main.head;
        onDropFiles([...files], pos);
        return true;
      }
      return false;
    },
    dragover(event) {
      if (event.dataTransfer && [...event.dataTransfer.types].includes('Files')) event.preventDefault();
    },
  });

  const makeExtensions = () => [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    markdown({ base: markdownLanguage }),
    markupDecorations,
    EditorView.lineWrapping,
    attrsComp.of(EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'off', lang: curLang === 'en' ? 'en' : 'fr' })),
    search.search({ top: true }),
    search.highlightSelectionMatches(),
    phrasesComp.of(EditorState.phrases.of(curLang === 'fr' ? SEARCH_PHRASES_FR : {})),
    themeComp.of(makeTheme(curTheme, p)),
    inputHandler,
    dropHandler,
    Prec.high(
      keymap.of([
        { key: 'Enter', run: enterKey },
        { key: 'Tab', run: tabKey },
        { key: 'Shift-Tab', run: () => runFormat(Fmt.unindentLines) },
        { key: 'Backspace', run: backspaceKey },
        { key: 'Home', run: homeKey },
      ])
    ),
    keymap.of([...search.searchKeymap.filter((k) => k.key !== 'Mod-f' && k.key !== 'Mod-g'), ...historyKeymap, ...defaultKeymap]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && onChange) onChange();
    }),
  ];

  const view = new EditorView({ state: EditorState.create({ doc, extensions: makeExtensions() }), parent });
  if (onScroll) view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

  /* -- Commandes -------------------------------------------------- */

  const commands = {
    undo: () => undo(view),
    redo: () => redo(view),
    find: () => search.openSearchPanel(view),
    findReplace: () => search.openSearchPanel(view),
    findNext: () => search.findNext(view),
    findPrevious: () => search.findPrevious(view),
    useSelectionForFind: () => {
      const s = view.state.selection.main;
      if (s.empty) return false;
      const q = new search.SearchQuery({ search: view.state.sliceDoc(s.from, s.to) });
      view.dispatch({ effects: search.setSearchQuery.of(q) });
      return true;
    },
    jumpToSelection: () => {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main, { y: 'center' }) });
      return true;
    },
    strong: () => runFormat(Fmt.toggleStrong),
    emphasis: () => runFormat(Fmt.toggleEmphasis),
    underline: () => runFormat(Fmt.toggleUnderline),
    strikethrough: () => runFormat(Fmt.toggleStrikethrough),
    highlight: () => runFormat(Fmt.toggleHighlight),
    inlineCode: () => runFormat(Fmt.toggleInlineCode),
    comment: () => runFormat(Fmt.toggleComment),
    heading: (n) => runFormat(Fmt.convertToHeading, Number(n)),
    orderedList: () => runFormat(Fmt.toggleList, true),
    unorderedList: () => runFormat(Fmt.toggleList, false, LIST_MARKERS[p.editorUnorderedListMarkerType] || '* '),
    blockquote: () => runFormat(Fmt.toggleBlockquote),
    shiftRight: () => runFormat(Fmt.indentLines, indentUnit()),
    shiftLeft: () => runFormat(Fmt.unindentLines),
    link: () => runFormat(Fmt.insertLink, 'link'),
    image: () => runFormat(Fmt.insertLink, 'image'),
    newParagraph: () => runFormat(Fmt.newParagraph),
    upperCase: () => runFormat(Fmt.transformCase, 'upper'),
    lowerCase: () => runFormat(Fmt.transformCase, 'lower'),
    capitalize: () => runFormat(Fmt.transformCase, 'capitalize'),
  };

  return {
    view,
    getText: text,
    state,
    focus: () => view.focus(),
    /** Remplace tout le document et efface l'historique d'annulation. */
    load(newText) {
      view.setState(EditorState.create({ doc: newText, extensions: makeExtensions() }));
    },
    insertAt(pos, str) {
      view.dispatch({ changes: { from: pos, insert: str }, selection: { anchor: pos + str.length }, userEvent: 'input.drop' });
    },
    command(name, arg) {
      const fn = commands[name];
      if (!fn) return false;
      const r = fn(arg);
      if (name !== 'find' && name !== 'findReplace') view.focus();
      return r;
    },
    applyPrefs(newPrefs, newTheme) {
      p = newPrefs;
      curTheme = newTheme || curTheme;
      view.dispatch({ effects: themeComp.reconfigure(makeTheme(curTheme, p)) });
    },
    applyLang(newLang) {
      curLang = newLang;
      view.dispatch({
        effects: [
          phrasesComp.reconfigure(EditorState.phrases.of(newLang === 'fr' ? SEARCH_PHRASES_FR : {})),
          attrsComp.reconfigure(EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'off', lang: newLang })),
        ],
      });
    },
    /** Ligne (0-based, fractionnaire) en haut de la zone visible. */
    topLine() {
      const top = view.scrollDOM.scrollTop - view.documentPadding.top;
      const block = view.lineBlockAtHeight(Math.max(0, top));
      const lineNo = view.state.doc.lineAt(block.from).number - 1;
      const frac = block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
      return lineNo + frac;
    },
    atBottom() {
      const s = view.scrollDOM;
      return s.scrollHeight - s.scrollTop - s.clientHeight < 2 && s.scrollTop > 0;
    },
  };
}

module.exports = { createEditor, makeTheme };
