'use strict';
/**
 * Fenêtre de document : éditeur à gauche (ou à droite), aperçu isolé de l'autre côté,
 * barre d'outils, compteur de mots, exports. Le rendu Markdown a lieu ici ; l'aperçu
 * (iframe isolée) ne reçoit que du HTML déjà produit.
 */
const { renderMarkdown, countText } = require('../shared/render.js');
const { renderOptionsFromPrefs } = require('../shared/prefs.js');
const { translate } = require('../shared/i18n.js');
const { createEditor } = require('./editor.js');
const { PreviewHost } = require('./preview-host.js');
const { buildToolbar } = require('./toolbar.js');
const { highlight } = require('./highlight.js');
const { assembleHtml } = require('./export-html.js');
const { toFileUrl, toDocUrl } = require('../shared/paths.js');

const api = window.windown;
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const PREVIEW = 'windown-preview://frame';
const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-mml-svg.js';

async function main() {
  const init = await api.init();
  if (!init) return;

  let prefs = init.prefs;
  let lang = init.lang;
  let theme = init.editorTheme;
  let filePath = init.filePath;
  let fileName = init.fileName;
  const view = { ...init.view };
  const t = (key, params) => translate(lang, key, params);

  let rev = 0;
  let savedRev = 0;
  let dirty = false;
  let renderTimer = null;
  let renderCost = 60;
  let renderVersion = 0;
  let customCssVersion = 0;
  let renderedCount = 0;
  let lastOut = null;
  let countTimer = null;
  let scrollQueued = false;

  /* ------------------------------------------------------------ */
  /* Rendu                                                        */
  /* ------------------------------------------------------------ */

  /** Aperçu : chemins absolus Windows passent par le protocole de document. */
  const rewritePreviewUrl = (url) => toDocUrl(url, init.docBase);

  function styleHref() {
    if (prefs.htmlStyleName === '__custom__') return `${PREVIEW}/custom.css?v=${customCssVersion}`;
    return `${PREVIEW}/styles/${encodeURIComponent(prefs.htmlStyleName)}.css`;
  }

  function prismHref() {
    if (!prefs.htmlSyntaxHighlighting) return '';
    return `${PREVIEW}/prism/${encodeURIComponent(prefs.htmlHighlightingThemeName || 'prism')}.css`;
  }

  function renderNow() {
    clearTimeout(renderTimer);
    const t0 = performance.now();
    const opts = { ...renderOptionsFromPrefs(prefs), highlighter: highlight, rewriteUrl: rewritePreviewUrl };
    const out = renderMarkdown(editor.getText(), opts);
    lastOut = out;
    renderCost = performance.now() - t0;
    renderVersion += 1;
    preview.update({
      type: 'update',
      version: renderVersion,
      html: out.html,
      base: init.docBase,
      docCss: styleHref(),
      prismCss: prismHref(),
      zoom: prefs.previewZoomRelativeToBaseFontSize ? prefs.editorBaseFontSize / 14 : 1,
      features: { math: out.math, mathDollar: prefs.htmlMathJaxInlineDollar },
      syncScroll: prefs.syncScrolling,
      line: editor.topLine(),
      atBottom: editor.atBottom(),
    });
    if (prefs.showWordCount) scheduleCount();
  }

  function scheduleRender() {
    if (!prefs.autoRender) return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, clamp(renderCost * 1.5, 60, 700));
  }

  /* ------------------------------------------------------------ */
  /* Document, état « modifié »                                   */
  /* ------------------------------------------------------------ */

  function updateDirty(force) {
    // Comme MacDown : un document sans titre resté vide n'est pas « modifié ».
    const emptyUntitled = !filePath && editor.view.state.doc.length === 0;
    const d = rev !== savedRev && !emptyUntitled;
    if (d !== dirty || force) {
      dirty = d;
      api.setDirty(d);
    }
  }

  function onChange() {
    rev += 1;
    updateDirty(false);
    scheduleRender();
    scheduleCount();
  }

  function onEditorScroll() {
    if (!prefs.syncScrolling || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      preview.scroll(editor.topLine(), editor.atBottom());
    });
  }

  function relativePath(fromDir, to) {
    const split = (p) => p.replace(/\\/g, '/').split('/').filter((s) => s.length);
    const a = split(fromDir);
    const b = split(to);
    if (!a.length || a[0].toLowerCase() !== b[0].toLowerCase()) return to.replace(/\\/g, '/');
    let i = 0;
    while (i < a.length && i < b.length - 1 && a[i].toLowerCase() === b[i].toLowerCase()) i++;
    return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
  }

  function onDropFiles(files, pos) {
    const docs = [];
    const images = [];
    for (const f of files) {
      const p = api.pathForFile(f);
      if (!p) continue;
      if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(p)) images.push(p);
      else if (/\.(md|markdown|mdown|mkd|mkdn|txt)$/i.test(p)) docs.push(p);
    }
    if (docs.length) api.openPaths(docs);
    if (images.length) {
      const dir = filePath ? filePath.replace(/[\\/][^\\/]*$/, '') : null;
      const refs = images.map((p) => `![](${dir ? relativePath(dir, p) : p.replace(/\\/g, '/')})`);
      editor.insertAt(pos, refs.join('\n'));
    }
  }

  /* ------------------------------------------------------------ */
  /* Éditeur, aperçu, barre d'outils                              */
  /* ------------------------------------------------------------ */

  const editor = createEditor({
    parent: $('editor'),
    doc: init.text,
    prefs,
    theme,
    lang,
    onChange,
    onScroll: onEditorScroll,
    onDropFiles,
  });

  const preview = new PreviewHost($('preview'), {
    onLink: (href) => api.openLink(href),
    onRendered: () => {
      renderedCount += 1;
    },
  });

  const toolbar = buildToolbar($('toolbar'), { t, run: runCommand });

  function applyChromeTheme() {
    document.documentElement.classList.toggle('dark', Boolean(theme.dark));
  }

  function applyLayout() {
    if (!view.editorVisible && !view.previewVisible) view.editorVisible = true;
    $('editorPane').classList.toggle('hidden', !view.editorVisible);
    $('previewPane').classList.toggle('hidden', !view.previewVisible);
    $('panes').classList.toggle('only-one', !(view.editorVisible && view.previewVisible));
    $('panes').classList.toggle('editor-right', prefs.editorOnRight);
    document.documentElement.style.setProperty('--split', `${(prefs.splitRatio * 100).toFixed(2)}%`);
    $('toolbar').classList.toggle('hidden', !view.toolbarVisible);
    toolbar.setState(view);
    api.setView({ ...view });
  }

  function setRatio(ratio, persist = true) {
    prefs = { ...prefs, splitRatio: clamp(Number(ratio) || 0.5, 0.1, 0.9) };
    view.editorVisible = true;
    view.previewVisible = true;
    applyLayout();
    if (persist) api.setPrefs({ splitRatio: prefs.splitRatio });
  }

  /* Séparateur déplaçable */
  (function wireSplitter() {
    const splitter = $('splitter');
    const panes = $('panes');
    let dragging = false;
    splitter.addEventListener('pointerdown', (e) => {
      dragging = true;
      splitter.setPointerCapture(e.pointerId);
      panes.classList.add('dragging');
    });
    splitter.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = panes.getBoundingClientRect();
      let ratio = (e.clientX - r.left) / r.width;
      if (prefs.editorOnRight) ratio = 1 - ratio;
      prefs = { ...prefs, splitRatio: clamp(ratio, 0.1, 0.9) };
      applyLayout();
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      panes.classList.remove('dragging');
      api.setPrefs({ splitRatio: prefs.splitRatio });
    };
    splitter.addEventListener('pointerup', end);
    splitter.addEventListener('pointercancel', end);
  })();

  /* ------------------------------------------------------------ */
  /* Compteur de mots                                             */
  /* ------------------------------------------------------------ */

  function updateCount() {
    const el = $('wordCount');
    el.hidden = !prefs.showWordCount;
    if (!prefs.showWordCount) return;
    // Comme MacDown : on compte le texte rendu (sans la syntaxe Markdown), pas la source.
    let rendered = '';
    try {
      const html = lastOut ? lastOut.html : '';
      rendered = new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
    } catch {
      rendered = editor.getText();
    }
    const c = countText(rendered);
    const [key, n] =
      prefs.wordCountType === 1
        ? ['status.characters', c.characters]
        : prefs.wordCountType === 2
          ? ['status.charactersNoSpaces', c.charactersNoSpaces]
          : ['status.words', c.words];
    el.textContent = t(key, { n });
    el.title = t('status.clickToChange');
  }
  function scheduleCount() {
    if (!prefs.showWordCount) return;
    clearTimeout(countTimer);
    countTimer = setTimeout(updateCount, 200);
  }
  $('wordCount').addEventListener('click', () => {
    api.setPrefs({ wordCountType: (prefs.wordCountType + 1) % 3 });
  });

  /* ------------------------------------------------------------ */
  /* Exports                                                      */
  /* ------------------------------------------------------------ */

  function showExportOptions() {
    return new Promise((resolve) => {
      const root = $('modalRoot');
      root.innerHTML = '';
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      const box = document.createElement('div');
      box.className = 'modal';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.innerHTML = `<h2></h2>
        <label><input type="checkbox" id="xStyles" checked> <span></span></label>
        <label><input type="checkbox" id="xHl"> <span></span></label>
        <div class="actions"><button type="button" id="xCancel"></button><button type="button" class="primary" id="xOk"></button></div>`;
      box.querySelector('h2').textContent = t('dlg.exportOptions');
      box.querySelectorAll('label span')[0].textContent = t('dlg.includeStyles');
      box.querySelectorAll('label span')[1].textContent = t('dlg.includeHighlighting');
      const hl = box.querySelector('#xHl');
      hl.checked = prefs.htmlSyntaxHighlighting;
      hl.disabled = !prefs.htmlSyntaxHighlighting;
      box.querySelector('#xCancel').textContent = t('dlg.cancel');
      box.querySelector('#xOk').textContent = t('dlg.ok');
      backdrop.appendChild(box);
      root.appendChild(backdrop);
      const close = (value) => {
        document.removeEventListener('keydown', onKey, true);
        root.innerHTML = '';
        editor.focus();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(null);
        }
      };
      document.addEventListener('keydown', onKey, true);
      box.querySelector('#xCancel').addEventListener('click', () => close(null));
      box.querySelector('#xOk').addEventListener('click', () =>
        close({ includeStyles: box.querySelector('#xStyles').checked, includeHighlighting: hl.checked })
      );
      box.querySelector('#xOk').focus();
    });
  }

  function documentTitle(out) {
    const base = fileName ? fileName.replace(/\.[^.]+$/, '') : '';
    return base || (out.headings[0] && out.headings[0].text) || t('untitled');
  }

  function baseHrefForPrint() {
    const dir = filePath ? filePath.replace(/[\\/][^\\/]*$/, '') : init.defaultDir;
    return dir ? `${toFileUrl(`${dir}\\`)}` : undefined;
  }

  /** Page HTML autonome. mode : 'file' (export HTML) ou 'print' (PDF et impression, ressources locales). */
  async function buildStandalone({ mode, includeStyles, includeHighlighting }) {
    const printMode = mode === 'print';
    const hl = includeHighlighting && prefs.htmlSyntaxHighlighting;
    const opts = { ...renderOptionsFromPrefs(prefs), highlighter: highlight, rewriteUrl: toFileUrl };
    if (!hl) Object.assign(opts, { syntaxHighlighting: false, lineNumbers: false, codeBlockAccessory: 'none', mermaid: false, graphviz: false });
    const out = renderMarkdown(editor.getText(), opts);

    const styles = [];
    if (includeStyles) styles.push(await api.styleText(prefs.htmlStyleName));
    if (hl) {
      styles.push(await api.prismText(prefs.htmlHighlightingThemeName));
      styles.push(await api.vendorText('extra'));
    }
    const libraries = [];
    const urls = {};
    if (out.mermaid) {
      if (printMode) urls.mermaid = await api.vendorUrl('mermaid');
      else libraries.push(await api.vendorText('mermaid'));
    }
    if (out.graphviz) {
      if (printMode) urls.viz = await api.vendorUrl('viz');
      else libraries.push(await api.vendorText('viz'));
    }
    if (out.math) urls.mathjax = printMode ? await api.vendorUrl('mathjax') : MATHJAX_CDN;

    const needPost = out.mermaid || out.graphviz || out.math || printMode;
    return assembleHtml({
      title: documentTitle(out),
      lang,
      baseHref: printMode ? baseHrefForPrint() : undefined,
      nonce: printMode ? crypto.randomUUID().replace(/-/g, '') : undefined,
      styles,
      body: out.html,
      libraries,
      post: needPost ? await api.vendorText('post') : '',
      postOptions: { math: out.math, mathDollar: prefs.htmlMathJaxInlineDollar, urls },
    });
  }

  async function exportHtml() {
    const choice = await showExportOptions();
    if (!choice) return;
    const html = await buildStandalone({ mode: 'file', ...choice });
    await api.exportHtml({ html, name: fileName || t('untitled') });
  }

  async function exportPdf() {
    const html = await buildStandalone({ mode: 'print', includeStyles: true, includeHighlighting: true });
    await api.exportPdf({ html, name: fileName || t('untitled') });
  }

  async function printDoc() {
    const html = await buildStandalone({ mode: 'print', includeStyles: true, includeHighlighting: true });
    await api.print({ html });
  }

  async function copyHtml() {
    const opts = { ...renderOptionsFromPrefs(prefs), highlighter: highlight, rewriteUrl: null };
    await api.copyText(renderMarkdown(editor.getText(), opts).html);
  }

  /* ------------------------------------------------------------ */
  /* Commandes (menu, barre d'outils)                             */
  /* ------------------------------------------------------------ */

  function runCommand(name, arg) {
    switch (name) {
      case 'render':
        renderNow();
        break;
      case 'layout':
        setRatio(arg);
        break;
      case 'togglePreview':
        view.previewVisible = !view.previewVisible;
        applyLayout();
        break;
      case 'toggleEditor':
        view.editorVisible = !view.editorVisible;
        applyLayout();
        break;
      case 'toggleToolbar':
        view.toolbarVisible = !view.toolbarVisible;
        api.setPrefs({ toolbarVisible: view.toolbarVisible });
        applyLayout();
        break;
      case 'zoom': {
        const size = arg === 0 ? init.defaults.editorBaseFontSize : clamp(prefs.editorBaseFontSize + arg, 8, 48);
        api.setPrefs({ editorBaseFontSize: size });
        break;
      }
      case 'fullscreen':
        api.toggleFullscreen();
        break;
      case 'copyHtml':
        copyHtml();
        break;
      case 'exportHtml':
        exportHtml();
        break;
      case 'exportPdf':
        exportPdf();
        break;
      case 'print':
        printDoc();
        break;
      default:
        editor.command(name, arg);
    }
  }

  api.onCommand(runCommand);
  api.onFullscreen((on) => {
    view.fullscreen = Boolean(on);
    toolbar.setState(view);
  });

  /* ------------------------------------------------------------ */
  /* Événements venus du processus principal                      */
  /* ------------------------------------------------------------ */

  api.onLoad((payload) => {
    editor.load(payload.text);
    filePath = payload.filePath;
    fileName = payload.fileName;
    rev = 0;
    savedRev = 0;
    updateDirty(true);
    renderNow();
    updateCount();
  });

  api.onSaved((payload) => {
    savedRev = payload.rev;
    filePath = payload.filePath;
    fileName = payload.fileName;
    updateDirty(true);
  });

  const RENDER_KEYS = new Set([
    'extIntraEmphasis', 'extTables', 'extFencedCode', 'extFootnotes', 'extAutolink', 'extStrikethrough',
    'extUnderline', 'extSuperscript', 'extHighlight', 'extQuote', 'extSmartyPants', 'htmlStyleName',
    'htmlCustomCssPath', 'htmlHighlightingThemeName', 'htmlSyntaxHighlighting', 'htmlLineNumbers',
    'htmlCodeBlockAccessory', 'htmlMathJax', 'htmlMathJaxInlineDollar', 'htmlMermaid', 'htmlGraphviz',
    'htmlTaskList', 'htmlDetectFrontMatter', 'htmlRendersTOC', 'htmlHardWrap',
    'previewZoomRelativeToBaseFontSize', 'editorBaseFontSize', 'syncScrolling',
  ]);

  api.onPrefsChanged(async (changed, newPrefs, newLang) => {
    prefs = newPrefs;
    if (newLang !== lang) {
      lang = newLang;
      editor.applyLang(lang);
      buildToolbarAgain();
    }
    if (changed.includes('htmlCustomCssPath')) customCssVersion += 1;
    if (changed.includes('editorStyleName')) theme = await api.editorTheme(prefs.editorStyleName);
    editor.applyPrefs(prefs, theme);
    applyChromeTheme();
    view.toolbarVisible = prefs.toolbarVisible;
    applyLayout();
    updateCount();
    if (changed.some((k) => RENDER_KEYS.has(k))) renderNow();
  });

  function buildToolbarAgain() {
    const fresh = buildToolbar($('toolbar'), { t, run: runCommand });
    toolbar.setState = fresh.setState;
    toolbar.setState(view);
  }

  /* Clavier : Échap ferme la recherche (CodeMirror) ; Ctrl+molette = zoom du texte. */
  window.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      runCommand('zoom', e.deltaY < 0 ? 1 : -1);
    },
    { passive: false }
  );

  /* Outils pour les essais automatisés et pour la fermeture (appelés par le processus principal). */
  window.windownApp = {
    snapshot: () => ({ text: editor.getText(), rev }),
    debug: () => ({ rev, savedRev, dirty, renderedCount, renderVersion, lang, theme: theme.name, htmlLength: lastOut ? lastOut.html.length : 0 }),
    run: runCommand,
    buildStandalone,
    editor,
  };

  applyChromeTheme();
  applyLayout();
  updateCount();
  renderNow();
  editor.focus();
}

main().catch((err) => {
  document.body.textContent = `Erreur de démarrage : ${err && err.message}`;
});
