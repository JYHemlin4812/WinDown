'use strict';
/**
 * Essai de fumée de l'application réelle (chargé seulement si WINDOWN_SMOKE_OUT est défini).
 * Pilote la vraie fenêtre : rendu, aperçu isolé, saisie, fonctions activables, protocoles,
 * enregistrement, export PDF, préférences ; écrit des captures PNG et result.json, puis quitte.
 */
const fs = require('node:fs');
const path = require('node:path');
const { net } = require('electron');
const { renderPdf } = require('./export.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 20000, step = 100) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* on réessaie */
    }
    if (Date.now() - start > timeoutMs) return null;
    await sleep(step);
  }
}

/** Exécute une vraie fonction dans une page ou une frame : evalIn(target, (a, b) => …, a, b). */
function evalIn(target, fn, ...args) {
  return target.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
}

function previewFrame(win) {
  return win.webContents.mainFrame.framesInSubtree.find((f) => f.url.startsWith('windown-preview://'));
}

const FEATURE_DOC = [
  '---',
  'titre: Essai',
  'auteur: JYH',
  '---',
  '[TOC]',
  '',
  '# Première partie',
  '',
  'Du ~~barré~~, du _souligné_, du ==surligné==, x^(2), http://exemple.com et "guillemets".',
  '',
  '- [x] fait',
  '- [ ] à faire',
  '',
  'Formule \\\\( a^2 + b^2 = c^2 \\\\) et bloc :',
  '',
  '\\\\[',
  '  \\int_0^1 x\\,dx',
  '\\\\]',
  '',
  '## Code',
  '',
  '```javascript',
  'const a = 1;',
  'function f(x) { return x * 2; }',
  'console.log(f(a));',
  '```',
  '',
  '```mermaid',
  'graph LR',
  '  A --> B',
  '```',
  '',
  '```graphviz',
  'digraph { a -> b }',
  '```',
  '',
].join('\n');

async function run(ctx) {
  const outDir = process.env.WINDOWN_SMOKE_OUT;
  fs.mkdirSync(outDir, { recursive: true });
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
    console.log(`${ok ? 'OK ' : 'KO '} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ''}`);
  };
  const shot = async (win, name) => {
    const img = await win.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
  };
  const finish = () => {
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2));
  };

  try {
    const st = await waitFor(() => [...ctx.docs.values()][0]);
    check('fenêtre de document créée', Boolean(st));
    const win = st.win;
    const wc = win.webContents;
    const original = fs.readFileSync(st.filePath, 'utf8');
    const dir = path.dirname(st.filePath);
    const loadDoc = async (text) => {
      await evalIn(wc, (t) => { window.windownApp.editor.load(t); window.windownApp.run('render'); }, text);
      await sleep(250);
    };

    /* 1. Chargement et rendu initial */
    const ready = await waitFor(() => evalIn(wc, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 30000);
    check('premier rendu confirmé par l’aperçu', ready);
    const frame = await waitFor(() => previewFrame(win));
    check('iframe d’aperçu isolée trouvée', Boolean(frame), frame && frame.url);
    const facts = await evalIn(frame, () => ({
      h1: document.querySelectorAll('h1').length,
      h2: document.querySelectorAll('h2').length,
      tables: document.querySelectorAll('table').length,
      links: document.querySelectorAll('a').length,
      css: getComputedStyle(document.body).fontFamily,
      sup: document.querySelectorAll('sup').length,
    }));
    check('aperçu : titres, tableaux, liens', facts.h1 >= 1 && facts.h2 >= 3 && facts.tables >= 2 && facts.links >= 5, JSON.stringify(facts));
    check('aperçu : feuille de style appliquée (GitHub2)', /Helvetica|arial|sans-serif/i.test(facts.css), facts.css);

    // Un titre « # WinDown » crée window.windown (id d'élément) : on vérifie donc qu'aucune fonction du pont n'existe.
    const iso = await evalIn(frame, () => ({
      node: typeof require,
      proc: typeof process,
      bridgeFunctions: Object.values(window.windown || {}).filter((v) => typeof v === 'function').length,
      ipc: typeof window.electron,
      origin: location.origin,
      parentAccess: (() => { try { return typeof parent.document; } catch (e) { return 'bloqué'; } })(),
    }));
    check('isolation : pas de Node ni de pont dans l’aperçu', iso.node === 'undefined' && iso.proc === 'undefined' && iso.bridgeFunctions === 0 && iso.ipc === 'undefined' && iso.parentAccess === 'bloqué', JSON.stringify(iso));
    await shot(win, '01-aide-defaut');

    /* 2. Pas de débordement horizontal */
    const overflow = await evalIn(frame, () => {
      const w = document.documentElement.clientWidth;
      const bad = [...document.body.querySelectorAll('*')]
        .filter((e) => e.getBoundingClientRect().right > w + 1)
        .slice(0, 3)
        .map((e) => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().right)}`);
      return { w, sw: document.documentElement.scrollWidth, bad };
    });
    check('aperçu : pas de débordement horizontal', overflow.sw <= overflow.w + 1, JSON.stringify(overflow));

    /* 3. Défilement synchronisé */
    await evalIn(wc, () => {
      const s = window.windownApp.editor.view.scrollDOM;
      s.scrollTop = (s.scrollHeight - s.clientHeight) * 0.5;
      s.dispatchEvent(new Event('scroll'));
    });
    const synced = await waitFor(async () => {
      const r = await evalIn(frame, () => ({ y: document.scrollingElement.scrollTop, max: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight }));
      return r.y > r.max * 0.2 && r.y < r.max * 0.8 ? r : null;
    }, 5000);
    check('défilement synchronisé éditeur → aperçu', Boolean(synced), JSON.stringify(synced));
    await evalIn(wc, () => {
      const s = window.windownApp.editor.view.scrollDOM;
      s.scrollTop = 0;
      s.dispatchEvent(new Event('scroll'));
    });
    await sleep(300);

    /* 4. Lien interne (ancre) */
    const anchor = await evalIn(frame, () => {
      const a = document.querySelector('a[href^="#"]');
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const target = document.getElementById(id) || document.getElementsByName(id)[0];
      a.click();
      return new Promise((r) => setTimeout(() => r({ id, found: Boolean(target), top: target ? Math.round(target.getBoundingClientRect().top) : null }), 300));
    });
    check('clic sur une ancre : défilement vers la cible', anchor.found && Math.abs(anchor.top) < 5, JSON.stringify(anchor));

    /* 5. Saisie intelligente avec de vraies touches */
    const keys = await evalIn(wc, () => {
      const app = window.windownApp;
      const v = app.editor.view;
      const press = (key) => v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      const setDoc = (text, pos) => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: pos === undefined ? text.length : pos } });
      const out = {};
      v.focus();
      setDoc('- item'); press('Enter'); out.list = v.state.doc.toString();
      setDoc('1. un'); press('Enter'); out.ordered = v.state.doc.toString();
      setDoc('> cite'); press('Enter'); out.quote = v.state.doc.toString();
      setDoc('- '); press('Enter'); out.exit = v.state.doc.toString();
      setDoc('un mot ici'); v.dispatch({ selection: { anchor: 3, head: 6 } }); app.run('strong'); out.strong = v.state.doc.toString();
      app.run('strong'); out.unstrong = v.state.doc.toString();
      setDoc('titre'); app.run('heading', 2); out.h2 = v.state.doc.toString();
      setDoc('a\nb'); v.dispatch({ selection: { anchor: 0, head: 3 } }); app.run('unorderedList'); out.ul = v.state.doc.toString();
      app.run('undo'); out.undo = v.state.doc.toString();
      return out;
    });
    check('saisie : continuation de liste, numérotation, citation, sortie de liste', keys.list === '- item\n- ' && keys.ordered === '1. un\n2. ' && keys.quote === '> cite\n> ' && keys.exit === '', JSON.stringify(keys));
    check('format : gras, retrait du gras, titre, liste, annulation', keys.strong === 'un **mot** ici' && keys.unstrong === 'un mot ici' && keys.h2 === '## titre' && keys.ul === '* a\n* b' && keys.undo === 'a\nb', JSON.stringify(keys));

    /* 6. Images et protocole de document */
    fs.copyFileSync(path.join(__dirname, '..', '..', 'resources', 'icon.png'), path.join(dir, 'pic.png'));
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'secret');
    const absPic = path.join(dir, 'pic.png');
    // Barres obliques : en Markdown, « \_ » et « \. » d'un chemin à antislashs seraient des échappements.
    await loadDoc(`![rel](pic.png)\n\n![abs](${absPic.replace(/\\/g, '/')})\n\n![nope](manquante.png)\n`);
    const imgs = await waitFor(async () => {
      const r = await evalIn(frame, () => [...document.images].map((i) => `${i.alt}:${i.complete ? i.naturalWidth : -1}`));
      return r.length === 3 && r.every((x) => !x.endsWith(':-1')) ? r : null;
    }, 8000);
    const srcs = await evalIn(frame, () => [...document.images].map((i) => i.src));
    check('images : relative et chemin absolu affichées, manquante signalée', Boolean(imgs) && imgs.includes('rel:256') && imgs.includes('abs:256') && imgs.includes('nope:0'), JSON.stringify(imgs) + ' ' + JSON.stringify(srcs));
    const base = `windown-doc://w${win.id}/`;
    const statusOf = async (u) => (await net.fetch(u)).status;
    check('protocole de document : route des chemins absolus', (await statusOf(`${base}__abs__/${encodeURIComponent(absPic.replace(/\\/g, '/'))}`)) === 200);
    const st200 = await statusOf(`${base}pic.png`);
    const st403 = await statusOf(`${base}secret.txt`);
    const stUnc = await statusOf(`${base}__abs__/${encodeURIComponent('//serveur/partage/x.png')}`);
    const stPrev = await statusOf('windown-preview://frame/..%2F..%2Fpackage.json');
    check('protocoles : image servie ; texte, chemin réseau et évasion refusés', st200 === 200 && st403 === 403 && stUnc === 403 && stPrev === 404, [st200, st403, stUnc, stPrev].join('/'));

    /* 6b. Correctifs de la revue : UNC encodé, file://serveur, encodage, modification externe, script à l'impression */
    {
      const { dialog, BrowserWindow } = require('electron');
      const encUnc = await statusOf(`${base}%5C%5Chote%5Cpartage%5Cx.png`);
      check('aperçu : UNC encodé via un chemin relatif refusé (403)', encUnc === 403, String(encUnc));

      // Vrai export PDF d'une page qui référence trois images réseau (balise brute, Markdown relatif au
      // protocole résolu par la base file:///, file://hôte) : le compteur prouve que la session
      // d'impression les a interceptées et refusées, une image locale passant normalement.
      const exportMod = require('./export.js');
      const beforeBlocked = exportMod.stats.blockedNetworkFiles;
      await loadDoc('![loc](pic.png)\n\n![rel](//hote/partage/a.png)\n\n<img src="file://hote/partage/b.png">\n\n<img src="file:////hote/partage/c.png">\n');
      const htmlUnc = await evalIn(wc, () => window.windownApp.buildStandalone({ mode: 'print', includeStyles: true, includeHighlighting: false }));
      const pdfUnc = await renderPdf(htmlUnc, { tempDir: outDir });
      const blocked = exportMod.stats.blockedNetworkFiles - beforeBlocked;
      check('export PDF : les 3 images réseau sont interceptées et refusées par la session d’impression', blocked >= 3 && pdfUnc.length > 1000, `refusées=${blocked}`);
      await loadDoc(original);

      const realSync = dialog.showMessageBoxSync;
      let shown = '';
      dialog.showMessageBoxSync = (_w, o) => { shown = (o && o.message) || String(_w && _w.message); return 0; };
      const cp = path.join(dir, 'ansi.md');
      const ansiBytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
      fs.writeFileSync(cp, ansiBytes);
      const countA = ctx.docs.size;
      const res = ctx.openPath(cp);
      dialog.showMessageBoxSync = realSync;
      check('fichier Windows-1252 refusé avec message, jamais réécrit', res === null && ctx.docs.size === countA && /UTF-8/.test(shown) && fs.readFileSync(cp).equals(ansiBytes), shown.slice(0, 80));

      const extFile = path.join(dir, 'externe.md');
      fs.writeFileSync(extFile, 'v1\n');
      const sx = ctx.openPath(extFile);
      await waitFor(() => evalIn(sx.win.webContents, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 20000);
      await evalIn(sx.win.webContents, () => { const v = window.windownApp.editor.view; v.dispatch({ changes: { from: v.state.doc.length, insert: 'local\n' } }); });
      await sleep(50);
      fs.writeFileSync(extFile, 'modifié ailleurs\n');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(extFile, future, future);
      const realBox = dialog.showMessageBox;
      let asked = '';
      dialog.showMessageBox = async (_w, o) => { asked = o.message; return { response: 1 }; };
      const savedX = await ctx.saveDocument(sx, false);
      dialog.showMessageBox = realBox;
      check('modification externe détectée : Annuler n’écrase pas le fichier', savedX === false && /autre application|another application/.test(asked) && fs.readFileSync(extFile, 'utf8') === 'modifié ailleurs\n', asked);
      sx.forceClose = true;
      sx.win.destroy();

      const { withCsp } = require('./export.js');
      const htmlPrint0 = await evalIn(wc, () => window.windownApp.buildStandalone({ mode: 'print', includeStyles: true, includeHighlighting: false }));
      const evil = htmlPrint0.replace('</body>', '<script>document.title = "PIRATE"; window.__windownReady = true;</script></body>');
      const pf = path.join(outDir, 'print-test.html');
      fs.writeFileSync(pf, withCsp(evil));
      const pw0 = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      await pw0.loadFile(pf);
      const ok0 = await waitFor(() => pw0.webContents.executeJavaScript('window.__windownReady === true'), 15000);
      const title0 = await pw0.webContents.executeJavaScript('document.title');
      pw0.destroy();
      check('impression : le <script> du document ne s’exécute pas, ceux de WinDown oui', ok0 && title0 !== 'PIRATE', `titre=${title0}`);
    }

    /* 7. Lien relatif vers un autre document */
    fs.writeFileSync(path.join(dir, 'autre.md'), '# Autre\n');
    const before = ctx.docs.size;
    await evalIn(wc, () => window.windown.openLink('autre.md'));
    const opened = await waitFor(() => ctx.docs.size === before + 1, 8000);
    check('lien relatif .md : ouvre le document dans une nouvelle fenêtre', Boolean(opened));
    for (const other of ctx.docs.values()) if (other !== st && other.filePath && /autre\.md$/.test(other.filePath)) other.win.destroy();

    /* 8. Frappe : le texte inséré se retrouve dans l’aperçu */
    await loadDoc(original);
    await evalIn(wc, () => {
      const v = window.windownApp.editor.view;
      v.dispatch({ changes: { from: v.state.doc.length, insert: '\n\nZZ **gras-test** fin\n' } });
    });
    const typed = await waitFor(async () => /<strong>gras-test<\/strong>/.test(await evalIn(frame, () => document.body.innerHTML)), 8000);
    check('frappe dans l’éditeur → aperçu mis à jour', typed);
    check('document marqué modifié', (await evalIn(wc, () => window.windownApp.debug().dirty)) === true && st.dirty === true && /●/.test(win.getTitle()), win.getTitle());

    /* 9. Fonctions activables par les préférences */
    ctx.prefs.set({
      htmlSyntaxHighlighting: true, htmlLineNumbers: true, htmlCodeBlockAccessory: 'language',
      htmlMathJax: true, htmlMermaid: true, htmlGraphviz: true, htmlRendersTOC: true, htmlTaskList: true,
      extStrikethrough: true, extUnderline: true, extHighlight: true, extSuperscript: true, extAutolink: true, extSmartyPants: true,
      htmlDetectFrontMatter: true, htmlHighlightingThemeName: 'prism-okaidia',
    });
    await loadDoc(FEATURE_DOC);
    const probe = () =>
      evalIn(frame, () => ({
        mermaid: Boolean(document.querySelector('.mermaid-diagram svg')),
        graphviz: Boolean(document.querySelector('.graphviz-diagram svg')),
        math: document.querySelectorAll('mjx-container').length,
        mathError: document.querySelectorAll('mjx-container [data-mjx-error]').length,
        token: document.querySelectorAll('pre code .token').length,
        lines: document.querySelectorAll('.line-numbers-rows').length,
        toc: Boolean(document.querySelector('a[href^="#premi"]')),
        task: Boolean(document.querySelector('li.task-list-item input[type=checkbox][disabled]')),
        del: Boolean(document.querySelector('del')),
        u: Boolean(document.querySelector('u')),
        mark: Boolean(document.querySelector('mark')),
        sup: Boolean(document.querySelector('sup')),
        fm: Boolean(document.querySelector('table th')),
        dataLang: Boolean(document.querySelector('pre[data-language]')),
      }));
    let rf = null;
    await waitFor(async () => {
      rf = await probe();
      return rf.mermaid && rf.graphviz && rf.math >= 2;
    }, 45000, 300);
    check('Mermaid, Graphviz et MathJax rendus', rf && rf.mermaid && rf.graphviz && rf.math >= 2 && rf.mathError === 0, JSON.stringify(rf));
    check('coloration, numéros de ligne, accessoire', rf && rf.token > 5 && rf.lines >= 1 && rf.dataLang, JSON.stringify(rf));
    check('TOC, tâches, barré, souligné, surligné, exposant, front-matter', rf && rf.toc && rf.task && rf.del && rf.u && rf.mark && rf.sup && rf.fm, JSON.stringify(rf));
    await shot(win, '02-fonctions');

    /* 10. Exports : HTML autonome et PDF réel */
    const htmlFile = await evalIn(wc, () => window.windownApp.buildStandalone({ mode: 'file', includeStyles: true, includeHighlighting: true }));
    check('export HTML autonome', /^<!DOCTYPE html>/.test(htmlFile) && /<style>/.test(htmlFile) && /token/.test(htmlFile) && /cdn\.jsdelivr\.net\/npm\/mathjax/.test(htmlFile), `${htmlFile.length} octets`);
    fs.writeFileSync(path.join(outDir, 'export.html'), htmlFile);
    const htmlPrint = await evalIn(wc, () => window.windownApp.buildStandalone({ mode: 'print', includeStyles: true, includeHighlighting: true }));
    const pdf = await renderPdf(htmlPrint, { tempDir: outDir });
    check('export PDF réel', pdf.length > 20000 && pdf.subarray(0, 4).toString() === '%PDF', `${pdf.length} octets`);
    fs.writeFileSync(path.join(outDir, 'export.pdf'), pdf);
    // Capture de la page d'impression (même HTML que le PDF) pour contrôle visuel.
    try {
      const { BrowserWindow } = require('electron');
      const printFile = path.join(outDir, 'print.html');
      fs.writeFileSync(printFile, htmlPrint);
      const viewer = new BrowserWindow({ width: 900, height: 1100, show: false, webPreferences: { sandbox: true } });
      await viewer.loadFile(printFile);
      await waitFor(() => viewer.webContents.executeJavaScript('window.__windownReady === true'), 30000);
      viewer.show();
      await sleep(1500);
      await shot(viewer, '04-page-impression');
      viewer.destroy();
    } catch (err) {
      console.log('Capture de la page d’impression impossible :', err.message);
    }

    /* 11. Enregistrement : BOM et CRLF conservés */
    const crlfFile = path.join(outDir, 'crlf.md');
    fs.writeFileSync(crlfFile, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Titre\r\n\r\nTexte é\r\n', 'utf8')]));
    const st2 = ctx.openPath(crlfFile);
    await waitFor(() => evalIn(st2.win.webContents, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 20000);
    await evalIn(st2.win.webContents, () => {
      const v = window.windownApp.editor.view;
      v.dispatch({ changes: { from: v.state.doc.length, insert: 'ajout\n' } });
    });
    const saved = await ctx.saveDocument(st2, false);
    const bytes = fs.readFileSync(crlfFile);
    const text = bytes.toString('utf8');
    check('enregistrement : BOM et CRLF conservés', saved && bytes[0] === 0xef && text.includes('Texte é\r\najout\r\n') && !/[^\r]\n/.test(text), JSON.stringify(text));
    await sleep(300);
    check('document propre après enregistrement', st2.dirty === false && !/●/.test(st2.win.getTitle()), st2.win.getTitle());

    /* 11b. Fermeture avec modifications : annuler, ne pas enregistrer, enregistrer */
    const { dialog, Menu } = require('electron');
    const realBox = dialog.showMessageBox;
    const realSave = dialog.showSaveDialog;
    const edit = (s, text) =>
      evalIn(s.win.webContents, (t) => { const v = window.windownApp.editor.view; v.dispatch({ changes: { from: v.state.doc.length, insert: t } }); }, text);
    const openAndWait = async (file) => {
      const s = ctx.openPath(file);
      await waitFor(() => evalIn(s.win.webContents, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 20000);
      return s;
    };
    try {
      let answer = 2;
      let asked = 0;
      dialog.showMessageBox = async () => { asked += 1; return { response: answer }; };
      const closeFile = path.join(outDir, 'close.md');
      fs.writeFileSync(closeFile, 'origine\n');
      const s3 = await openAndWait(closeFile);
      await edit(s3, 'perdu\n');
      await waitFor(() => s3.dirty, 3000);
      const id3 = s3.win.id;
      s3.win.close();
      await sleep(600);
      check('fermeture + Annuler : la fenêtre reste ouverte, rien d’écrit', ctx.docs.has(id3) && asked === 1 && fs.readFileSync(closeFile, 'utf8') === 'origine\n', `questions=${asked}`);
      answer = 1;
      s3.win.close();
      await waitFor(() => !ctx.docs.has(id3), 5000);
      check('fermeture + Ne pas enregistrer : fenêtre fermée, fichier intact', !ctx.docs.has(id3) && fs.readFileSync(closeFile, 'utf8') === 'origine\n');
      answer = 0;
      const s3b = await openAndWait(closeFile);
      await edit(s3b, 'gardé\n');
      await waitFor(() => s3b.dirty, 3000);
      const id3b = s3b.win.id;
      s3b.win.close();
      await waitFor(() => !ctx.docs.has(id3b), 8000);
      check('fermeture + Enregistrer : fichier écrit puis fenêtre fermée', !ctx.docs.has(id3b) && fs.readFileSync(closeFile, 'utf8') === 'origine\ngardé\n', JSON.stringify(fs.readFileSync(closeFile, 'utf8')));

      // Document sans titre : Enregistrer sous.
      const untitled = ctx.createDocumentWindow();
      await waitFor(() => evalIn(untitled.win.webContents, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 20000);
      await edit(untitled, 'nouveau document é\n');
      const savedAs = path.join(outDir, 'sans-titre.md');
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedAs });
      const okSave = await ctx.saveDocument(untitled, false);
      check('document sans titre : Enregistrer sous écrit le fichier et nomme la fenêtre', okSave && fs.readFileSync(savedAs, 'utf8') === 'nouveau document é\n' && /sans-titre\.md/.test(untitled.win.getTitle()) && untitled.dirty === false, untitled.win.getTitle());
      dialog.showSaveDialog = async () => ({ canceled: true });
      const untitled2 = ctx.createDocumentWindow();
      await waitFor(() => evalIn(untitled2.win.webContents, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 20000);
      await edit(untitled2, 'abandon\n');
      check('Enregistrer sous annulé : rien n’est écrit', (await ctx.saveDocument(untitled2, false)) === false && untitled2.filePath === null);
      untitled.win.destroy();
      untitled2.win.destroy();

      // Une fenêtre vierge est réutilisée à l'ouverture d'un fichier.
      // Fenêtre vierge pas encore prête : on n'y envoie rien (éviter un éditeur vide lié au fichier).
      const early = ctx.createDocumentWindow();
      const countEarly = ctx.docs.size;
      const other = ctx.openPath(closeFile);
      check('fenêtre vierge pas encore prête : fichier ouvert dans une nouvelle fenêtre', other !== early && ctx.docs.size === countEarly + 1 && early.filePath === null, `${ctx.docs.size}/${countEarly}`);
      await waitFor(() => evalIn(other.win.webContents, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 20000);
      const otherText = await evalIn(other.win.webContents, () => window.windownApp.snapshot().text);
      check('… et ce document affiche bien le contenu du fichier', otherText === fs.readFileSync(closeFile, 'utf8'), JSON.stringify(otherText));
      other.win.destroy();
      early.win.destroy();
      await sleep(200);

      const blank = ctx.createDocumentWindow();
      await waitFor(() => evalIn(blank.win.webContents, () => window.windownApp && window.windownApp.debug().renderedCount >= 1), 20000);
      blank.win.focus();
      const countBefore = ctx.docs.size;
      const reopened = ctx.openPath(closeFile);
      await sleep(400);
      const blankText = await evalIn(blank.win.webContents, () => window.windownApp.snapshot().text);
      check('fenêtre vierge prête : réutilisée, avec le contenu du fichier', reopened === blank && ctx.docs.size === countBefore && blank.filePath === closeFile && blankText === fs.readFileSync(closeFile, 'utf8'), `${ctx.docs.size}/${countBefore}`);
      blank.win.destroy();
    } finally {
      dialog.showMessageBox = realBox;
      dialog.showSaveDialog = realSave;
    }

    /* 11b'. Bouton plein écran de la barre d'outils, à droite des boutons Masquer éditeur / aperçu */
    const order = await evalIn(wc, () => [...document.querySelectorAll('#toolbar button')].map((b) => b.dataset.cmd).slice(-3));
    await evalIn(wc, () => document.querySelector('#toolbar button[data-cmd="fullscreen"]').click());
    const fsOn = await waitFor(async () => win.isFullScreen() && (await evalIn(wc, () => document.querySelector('#toolbar button[data-cmd="fullscreen"]').classList.contains('on'))), 8000);
    await evalIn(wc, () => document.querySelector('#toolbar button[data-cmd="fullscreen"]').click());
    const fsOff = await waitFor(async () => !win.isFullScreen() && !(await evalIn(wc, () => document.querySelector('#toolbar button[data-cmd="fullscreen"]').classList.contains('on'))), 8000);
    check('bouton plein écran : à droite des boutons éditeur/aperçu, entre et sort du plein écran', order.join() === 'toggleEditor,togglePreview,fullscreen' && fsOn && fsOff, `${order.join()} on=${Boolean(fsOn)} off=${Boolean(fsOff)}`);

    /* 11c. Fichiers récents (menu) et zoom du texte */
    await sleep(150);
    const fileMenu = Menu.getApplicationMenu().items[0].submenu.items;
    const recent = fileMenu.find((i) => i.submenu && i.submenu.items.some((s) => /close\.md/.test(s.label)));
    check('menu Fichier : « Ouvrir un fichier récent » liste les documents ouverts', Boolean(recent), fileMenu.map((i) => i.label).slice(0, 4).join(' | '));
    await evalIn(wc, () => window.windownApp.run('zoom', 2));
    await sleep(300);
    const zoomed = ctx.prefs.get('editorBaseFontSize');
    await evalIn(wc, () => window.windownApp.run('zoom', 0));
    await sleep(300);
    check('zoom du texte de l’éditeur (+2 puis taille normale)', zoomed === 16 && ctx.prefs.get('editorBaseFontSize') === 14, `${zoomed} puis ${ctx.prefs.get('editorBaseFontSize')}`);

    /* 12. Fenêtre de préférences */
    ctx.openPreferences();
    const pw = await waitFor(() => ctx.getPrefsWindow(), 10000);
    await waitFor(async () => (await evalIn(pw.webContents, () => document.querySelectorAll('#tabs button').length)) === 5, 10000);
    const tabs = [];
    for (let i = 0; i < 5; i++) {
      await evalIn(pw.webContents, (n) => document.querySelectorAll('#tabs button')[n].click(), i);
      await sleep(400);
      const info = await evalIn(pw.webContents, (n) => ({ ctl: document.querySelectorAll('#content input, #content select').length, label: document.querySelectorAll('#tabs button')[n].textContent }), i);
      tabs.push(`${info.label}:${info.ctl}`);
      await shot(pw, `03-prefs-${i}`);
    }
    check('préférences : 5 volets avec leurs contrôles', tabs.every((x) => /:\d+$/.test(x)) && !tabs.some((x) => x.endsWith(':0') && !/^(Terminal)/.test(x)), tabs.join(' | '));

    /* 13. Langue en direct */
    ctx.prefs.set({ language: 'en' });
    await sleep(600);
    const label = await evalIn(pw.webContents, () => document.querySelectorAll('#tabs button')[0].textContent);
    check('changement de langue en direct (préférences)', label === 'General', label);
    ctx.prefs.set({ language: 'fr' });

    /* 14. Persistance */
    ctx.prefs.flush();
    const persisted = JSON.parse(fs.readFileSync(path.join(ctx.app.getPath('userData'), 'preferences.json'), 'utf8'));
    check('préférences enregistrées sur disque', persisted.htmlSyntaxHighlighting === true && persisted.htmlMermaid === true && persisted.language === 'fr', `${Object.keys(persisted).length} clés`);
  } catch (err) {
    check('exécution sans exception', false, err && err.stack);
  }
  finish();
  ctx.app.exit(checks.every((c) => c.ok) ? 0 : 1);
}

module.exports = { run };
