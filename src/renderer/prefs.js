'use strict';
/** Fenêtre de préférences : cinq volets comme MacDown (Général, Markdown, Compilation, Éditeur, Terminal). */
const { translate } = require('../shared/i18n.js');

const api = window.windownPrefs;
const PANES = ['general', 'markdown', 'rendering', 'editor', 'terminal'];
let data = null;
let lang = 'fr';
let current = 'general';
let shellState = null;
let shellError = '';
let fontNames = null;

const t = (key, params) => translate(lang, key, params);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c) node.append(c);
  return node;
}

function set(patch) {
  Object.assign(data.prefs, patch);
  api.set(patch);
}

/* ---------------- Contrôles ---------------- */

function check(key, labelKey, { disabled = false, indent = false } = {}) {
  const input = el('input', { type: 'checkbox', disabled });
  input.checked = Boolean(data.prefs[key]);
  input.addEventListener('change', () => {
    set({ [key]: input.checked });
    render(); // les options dépendantes se grisent
  });
  return el('label', { class: `check${indent ? ' indent' : ''}${disabled ? ' disabled' : ''}` }, input, el('span', { text: t(labelKey) }));
}

function select(key, labelKey, options, { onChange } = {}) {
  const s = el('select', { 'aria-label': t(labelKey) });
  for (const [value, label] of options) {
    const o = el('option', { value: String(value), text: label });
    if (String(data.prefs[key]) === String(value)) o.selected = true;
    s.append(o);
  }
  s.addEventListener('change', () => {
    const raw = s.value;
    const isNum = typeof data.defaults[key] === 'number';
    set({ [key]: isNum ? Number(raw) : raw });
    if (onChange) onChange();
    else render();
  });
  return el('div', { class: 'row' }, el('label', { class: 'lead', text: t(labelKey) }), s);
}

function number(key, { min, max, step = 1, ariaKey } = {}) {
  const input = el('input', { type: 'number', min, max, step, 'aria-label': ariaKey ? t(ariaKey) : key });
  input.value = String(data.prefs[key]);
  input.addEventListener('change', () => {
    let v = Number(input.value);
    if (!Number.isFinite(v)) v = data.defaults[key];
    v = Math.min(max, Math.max(min, v));
    input.value = String(v);
    set({ [key]: v });
  });
  return input;
}

function group(titleKey, ...children) {
  return el('fieldset', {}, el('legend', { text: t(titleKey) }), ...children);
}

/* ---------------- Volets ---------------- */

function paneGeneral() {
  return [
    group(
      'prefs.general.behavior',
      select('language', 'prefs.general.language', [
        ['auto', t('prefs.general.languageAuto')],
        ['fr', 'Français'],
        ['en', 'English'],
      ]),
      check('ensureOpenDocument', 'prefs.general.ensureOpen'),
      check('createFileForLinkTarget', 'prefs.general.createFiles'),
      check('autoRender', 'prefs.general.autoRender'),
      check('syncScrolling', 'prefs.general.syncScroll'),
      check('editorOnRight', 'prefs.general.editorRight'),
      check('showWordCount', 'prefs.general.wordCount')
    ),
  ];
}

function paneMarkdown() {
  return [
    group('prefs.md.document', check('extSmartyPants', 'prefs.md.smartypants')),
    group('prefs.md.block', check('extTables', 'prefs.md.tables'), check('extFencedCode', 'prefs.md.fenced')),
    group(
      'prefs.md.inline',
      check('extIntraEmphasis', 'prefs.md.intra'),
      check('extStrikethrough', 'prefs.md.strike'),
      check('extUnderline', 'prefs.md.underline'),
      check('extQuote', 'prefs.md.quote'),
      check('extHighlight', 'prefs.md.highlight'),
      check('extSuperscript', 'prefs.md.superscript'),
      check('extAutolink', 'prefs.md.autolink'),
      check('extFootnotes', 'prefs.md.footnote')
    ),
  ];
}

function reloadLists() {
  api.get().then((d) => {
    data = d;
    render();
  });
}

function paneRendering() {
  const p = data.prefs;
  const cssSelect = el('select', { 'aria-label': t('prefs.html.css') });
  for (const s of data.styles) {
    const o = el('option', { value: s.name, text: s.name });
    if (p.htmlStyleName === s.name) o.selected = true;
    cssSelect.append(o);
  }
  const custom = el('option', { value: '__custom__', text: t('prefs.html.custom') });
  if (p.htmlStyleName === '__custom__') custom.selected = true;
  cssSelect.append(custom);
  cssSelect.addEventListener('change', () => {
    set({ htmlStyleName: cssSelect.value });
    render();
  });

  const cssRow = el(
    'div',
    { class: 'row' },
    el('label', { class: 'lead', text: t('prefs.html.css') }),
    cssSelect,
    el('button', { class: 'btn', type: 'button', text: t('prefs.html.reveal'), onclick: () => api.reveal('styles') }),
    el('button', { class: 'btn', type: 'button', text: t('prefs.html.reload'), onclick: reloadLists })
  );
  const parts = [cssRow];
  if (p.htmlStyleName === '__custom__') {
    const path = el('input', { type: 'text', class: 'wide', value: p.htmlCustomCssPath, 'aria-label': t('prefs.html.customPath'), readonly: true });
    parts.push(
      el(
        'div',
        { class: 'row' },
        el('label', { class: 'lead', text: t('prefs.html.customPath') }),
        path,
        el('button', {
          class: 'btn',
          type: 'button',
          text: t('prefs.html.choose'),
          onclick: async () => {
            const f = await api.choose('css');
            if (f) {
              set({ htmlCustomCssPath: f });
              render();
            }
          },
        })
      )
    );
  }

  const hl = p.htmlSyntaxHighlighting;
  const themeSelect = el('select', { 'aria-label': t('prefs.html.theme'), disabled: !hl });
  const def = el('option', { value: '', text: t('prefs.html.themeDefault') });
  themeSelect.append(def);
  for (const th of data.prismThemes.filter((x) => x.name !== 'prism')) {
    const o = el('option', { value: th.name, text: th.name.replace(/^prism-/, '') });
    if (p.htmlHighlightingThemeName === th.name) o.selected = true;
    themeSelect.append(o);
  }
  if (!p.htmlHighlightingThemeName) def.selected = true;
  themeSelect.addEventListener('change', () => set({ htmlHighlightingThemeName: themeSelect.value }));

  const accessory = el('select', { 'aria-label': t('prefs.html.accessory'), disabled: !hl });
  for (const [v, k] of [['none', 'prefs.html.accNone'], ['language', 'prefs.html.accLanguage'], ['custom', 'prefs.html.accCustom']]) {
    const o = el('option', { value: v, text: t(k) });
    if (p.htmlCodeBlockAccessory === v) o.selected = true;
    accessory.append(o);
  }
  accessory.addEventListener('change', () => set({ htmlCodeBlockAccessory: accessory.value }));

  const dir = el('input', { type: 'text', class: 'wide', value: p.htmlDefaultDirectory, placeholder: '%USERPROFILE%', 'aria-label': t('prefs.html.defaultDir'), readonly: true });

  return [
    group('prefs.html.styleGroup', ...parts),
    group(
      'prefs.html.codeGroup',
      check('htmlSyntaxHighlighting', 'prefs.html.highlighting'),
      el('div', { class: 'row' }, el('label', { class: 'lead', text: t('prefs.html.theme') }), themeSelect),
      check('htmlLineNumbers', 'prefs.html.lineNumbers', { disabled: !hl, indent: true }),
      el('div', { class: 'row' }, el('label', { class: 'lead', text: t('prefs.html.accessory') }), accessory),
      check('htmlMermaid', 'prefs.html.mermaid', { disabled: !hl, indent: true }),
      check('htmlGraphviz', 'prefs.html.graphviz', { disabled: !hl, indent: true })
    ),
    group(
      'prefs.html.mathGroup',
      check('htmlMathJax', 'prefs.html.math'),
      check('htmlMathJaxInlineDollar', 'prefs.html.mathDollar', { disabled: !p.htmlMathJax, indent: true })
    ),
    group(
      'prefs.html.optionsGroup',
      check('htmlTaskList', 'prefs.html.taskList'),
      check('htmlDetectFrontMatter', 'prefs.html.frontMatter'),
      check('htmlRendersTOC', 'prefs.html.toc'),
      check('htmlHardWrap', 'prefs.html.hardWrap'),
      check('previewZoomRelativeToBaseFontSize', 'prefs.html.scale')
    ),
    el(
      'div',
      { class: 'row' },
      el('label', { class: 'lead', text: t('prefs.html.defaultDir') }),
      dir,
      el('button', {
        class: 'btn',
        type: 'button',
        text: t('prefs.html.choose'),
        onclick: async () => {
          const f = await api.choose('directory');
          if (f) {
            set({ htmlDefaultDirectory: f });
            render();
          }
        },
      })
    ),
  ];
}

async function loadFonts() {
  if (fontNames) return fontNames;
  let names = [];
  try {
    const list = await window.queryLocalFonts();
    names = [...new Set(list.map((f) => f.family))];
  } catch {
    names = [];
  }
  if (!names.length) names = await api.fontsFallback();
  fontNames = names.sort((a, b) => a.localeCompare(b));
  return fontNames;
}

function paneEditor() {
  const p = data.prefs;
  const datalist = el('datalist', { id: 'fontList' });
  const font = el('input', { type: 'text', list: 'fontList', value: p.editorBaseFontName, 'aria-label': t('prefs.editor.font') });
  font.addEventListener('focus', async () => {
    const names = await loadFonts();
    if (!datalist.childElementCount) for (const n of names) datalist.append(el('option', { value: n }));
  });
  font.addEventListener('change', () => {
    const v = font.value.trim();
    if (v) set({ editorBaseFontName: v });
  });

  const themeSelect = el('select', { 'aria-label': t('prefs.editor.theme') });
  for (const th of data.editorThemes) {
    const o = el('option', { value: th.name, text: th.name });
    if (p.editorStyleName === th.name) o.selected = true;
    themeSelect.append(o);
  }
  themeSelect.addEventListener('change', () => set({ editorStyleName: themeSelect.value }));

  return [
    group(
      'prefs.editor.styling',
      el('div', { class: 'row' }, el('label', { class: 'lead', text: t('prefs.editor.font') }), font, number('editorBaseFontSize', { min: 6, max: 96, ariaKey: 'prefs.editor.font' }), datalist),
      el(
        'div',
        { class: 'row' },
        el('label', { class: 'lead', text: t('prefs.editor.theme') }),
        themeSelect,
        el('button', { class: 'btn', type: 'button', text: t('prefs.html.reveal'), onclick: () => api.reveal('themes') }),
        el('button', { class: 'btn', type: 'button', text: t('prefs.html.reload'), onclick: reloadLists })
      ),
      el('div', { class: 'row' }, el('label', { class: 'lead', text: t('prefs.editor.lineSpacing') }), number('editorLineSpacing', { min: 0, max: 40, ariaKey: 'prefs.editor.lineSpacing' })),
      el(
        'div',
        { class: 'row' },
        el('label', { class: 'lead', text: t('prefs.editor.insets') }),
        number('editorHorizontalInset', { min: 0, max: 200, ariaKey: 'prefs.editor.insets' }),
        el('span', { text: '×' }),
        number('editorVerticalInset', { min: 0, max: 200, ariaKey: 'prefs.editor.insets' })
      ),
      el('div', { class: 'row' }, check('editorWidthLimited', 'prefs.editor.limitWidth'), number('editorMaximumWidth', { min: 200, max: 5000, step: 10, ariaKey: 'prefs.editor.limitWidth' })),
      check('editorScrollsPastEnd', 'prefs.editor.scrollPast')
    ),
    group(
      'prefs.editor.behavior',
      check('editorConvertTabs', 'prefs.editor.spaces'),
      check('editorCompleteMatchingCharacters', 'prefs.editor.autoComplete'),
      check('editorAutoIncrementNumberedLists', 'prefs.editor.autoIncrement'),
      check('editorInsertPrefixInBlock', 'prefs.editor.prefix'),
      check('editorSmartHome', 'prefs.editor.smartHome'),
      check('editorEnsuresNewlineAtEndOfFile', 'prefs.editor.newline'),
      select(
        'editorUnorderedListMarkerType',
        'prefs.editor.marker',
        [
          [0, t('prefs.editor.markerAsterisk')],
          [1, t('prefs.editor.markerPlus')],
          [2, t('prefs.editor.markerMinus')],
        ],
        { onChange: () => {} }
      )
    ),
  ];
}

function paneTerminal() {
  const s = shellState;
  const installed = Boolean(s && s.installed);
  const btn = el('button', {
    class: 'btn',
    type: 'button',
    text: installed ? t('prefs.term.uninstall') : t('prefs.term.install'),
    onclick: async () => {
      shellError = '';
      const r = installed ? await api.shellUninstall() : await api.shellInstall();
      if (r && r.ok) shellState = r.status;
      else shellError = t('prefs.term.error', { error: (r && r.error) || '?' });
      render();
    },
  });
  return [
    el('p', { class: 'note', text: t('prefs.term.intro') }),
    group(
      'prefs.terminal',
      el(
        'div',
        { class: 'row' },
        el('span', { class: `dot${installed ? ' ok' : ''}`, 'aria-hidden': 'true' }),
        el('strong', { text: installed ? t('prefs.term.installed') : t('prefs.term.notInstalled') }),
        btn
      ),
      el('div', { class: 'row' }, el('span', { class: 'note', text: `${t('prefs.term.location')} ` }), el('code', { text: s ? s.location : '…' })),
      el('p', { class: 'note', text: t('prefs.term.pathNote') }),
      shellError ? el('p', { class: 'error', role: 'alert', text: shellError }) : null
    ),
  ];
}

/* ---------------- Assemblage ---------------- */

function render() {
  const content = document.getElementById('content');
  const scroll = content.scrollTop;
  const tabs = document.getElementById('tabs');
  tabs.textContent = '';
  for (const id of PANES) {
    tabs.append(
      el('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(id === current),
        text: t(`prefs.${id}`),
        onclick: async () => {
          current = id;
          if (id === 'terminal') shellState = await api.shellStatus();
          render();
        },
      })
    );
  }
  document.title = `${t('prefs.title')} — WinDown`;
  document.documentElement.lang = lang;
  const builders = { general: paneGeneral, markdown: paneMarkdown, rendering: paneRendering, editor: paneEditor, terminal: paneTerminal };
  content.textContent = '';
  content.append(...builders[current]());
  content.scrollTop = scroll;
}

async function start() {
  data = await api.get();
  lang = data.lang;
  render();
  api.onChanged((changed, prefs, newLang) => {
    const langChanged = newLang !== lang;
    const same = JSON.stringify(prefs) === JSON.stringify(data.prefs);
    data.prefs = prefs;
    lang = newLang;
    if (langChanged || !same) render();
  });
}

start();
