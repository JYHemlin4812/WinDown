'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DEFAULTS, sanitize, renderOptionsFromPrefs } = require('../src/shared/prefs.js');
const { parseMouTheme, toEditorTheme, cssColor } = require('../src/shared/mou-theme.js');
const { DICTS, translate, resolveLanguage } = require('../src/shared/i18n.js');
const { decodeDocument, encodeDocument, readDocument, writeDocument, isMarkdownFile } = require('../src/main/files.js');
const shell = require('../src/main/shell-support.js');
const { safeJoin, isNetworkPath, isAllowedLocalTarget } = require('../src/main/protocols.js');
const { buildMenuTemplate } = require('../src/main/menu.js');
const { PrefsStore } = require('../src/main/prefs-store.js');
const { assembleHtml, inlineScript } = require('../src/renderer/export-html.js');

/* ------------------------------ préférences ------------------------------ */

test('Préférences : valeurs par défaut de MacDown', () => {
  assert.equal(DEFAULTS.editorStyleName, 'Tomorrow+');
  assert.equal(DEFAULTS.htmlStyleName, 'GitHub2');
  assert.equal(DEFAULTS.editorBaseFontSize, 14);
  assert.equal(DEFAULTS.editorHorizontalInset, 15);
  assert.equal(DEFAULTS.editorVerticalInset, 30);
  assert.equal(DEFAULTS.editorLineSpacing, 3);
  assert.equal(DEFAULTS.editorMaximumWidth, 1000);
  assert.equal(DEFAULTS.extIntraEmphasis && DEFAULTS.extTables && DEFAULTS.extFencedCode && DEFAULTS.extFootnotes, true);
  assert.equal(DEFAULTS.extUnderline || DEFAULTS.extQuote || DEFAULTS.extSmartyPants, false);
});

test('Préférences : sanitize rejette types et bornes invalides', () => {
  const s = sanitize({ editorBaseFontSize: 9999, editorLineSpacing: 'abc', extTables: 'oui', language: 'xx', htmlCodeBlockAccessory: 'bizarre', inconnue: 1, recentFiles: ['a', 3, 'b'] });
  assert.equal(s.editorBaseFontSize, 96);
  assert.equal(s.editorLineSpacing, DEFAULTS.editorLineSpacing);
  assert.equal(s.extTables, true);
  assert.equal(s.language, 'auto');
  assert.equal(s.htmlCodeBlockAccessory, 'none');
  assert.equal('inconnue' in s, false);
  assert.deepEqual(s.recentFiles, ['a', 'b']);
  assert.deepEqual(sanitize(null), sanitize({}));
});

test('Préférences : options de rendu déduites', () => {
  const o = renderOptionsFromPrefs({ ...DEFAULTS, htmlSyntaxHighlighting: false, htmlLineNumbers: true, htmlCodeBlockAccessory: 'language' });
  assert.equal(o.lineNumbers, false, 'numéros de ligne seulement avec la coloration');
  assert.equal(o.codeBlockAccessory, 'none');
  assert.equal(renderOptionsFromPrefs({ ...DEFAULTS, htmlSyntaxHighlighting: true, htmlLineNumbers: true }).lineNumbers, true);
});

test('PrefsStore : écriture atomique, relecture, notification', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prefs-'));
  const file = path.join(dir, 'p.json');
  const store = new PrefsStore(file);
  const seen = [];
  store.onChange((keys) => seen.push(keys.join()));
  assert.deepEqual(store.set({ editorBaseFontSize: 18, extTables: true, bidon: 1 }), ['editorBaseFontSize']);
  assert.equal(store.set({ editorBaseFontSize: 18 }).length, 0, 'pas de notification si inchangé');
  store.addRecent('C:\\a.md');
  store.addRecent('C:\\b.md');
  store.addRecent('C:\\a.md');
  assert.deepEqual(store.get('recentFiles'), ['C:\\a.md', 'C:\\b.md']);
  store.flush();
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).editorBaseFontSize, 18);
  assert.equal(new PrefsStore(file).get('editorBaseFontSize'), 18);
  assert.equal(fs.readdirSync(dir).length, 1, 'aucun fichier temporaire laissé');
  fs.writeFileSync(file, '{ pas du json');
  assert.equal(new PrefsStore(file).get('editorBaseFontSize'), 14, 'fichier corrompu : valeurs par défaut');
  assert.deepEqual(seen, ['editorBaseFontSize', 'recentFiles', 'recentFiles', 'recentFiles'].slice(0, seen.length));
});

/* ------------------------------ thèmes Mou ------------------------------ */

test('Thèmes Mou : tous les thèmes présents sont lus', () => {
  const dir = path.join(__dirname, '..', 'resources', 'Themes');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.style'));
  assert.ok(files.length >= 9, `au moins les 9 thèmes sans restriction (trouvés : ${files.length})`);
  assert.ok(files.includes("Tomorrow+.style"));
  for (const f of files) {
    const theme = toEditorTheme(parseMouTheme(fs.readFileSync(path.join(dir, f), 'utf8')));
    assert.match(theme.background, /^#[0-9a-f]{6}$/, f);
    assert.match(theme.foreground, /^#[0-9a-f]{6}$/, f);
    assert.ok(theme.colors.H1 && theme.colors.EMPH && theme.colors.LINK, f);
  }
});

test('Thème Tomorrow+ : valeurs connues', () => {
  const t = toEditorTheme(parseMouTheme(fs.readFileSync(path.join(__dirname, '..', 'resources', 'Themes', 'Tomorrow+.style'), 'utf8')));
  assert.equal(t.dark, true);
  assert.equal(t.background, '#2d2d2d');
  assert.equal(t.caret, '#cc99cc');
  assert.equal(t.colors.H1.color, '#66cccc');
  assert.equal(t.colors.H1.bold, true);
  assert.equal(t.colors.H1.size, '24px');
  assert.equal(t.colors.EMPH.italic, true);
});

test('Thèmes Mou : couleurs invalides ignorées', () => {
  assert.equal(cssColor('zzzzzz'), undefined);
  assert.equal(cssColor('#ABC'), '#abc');
  const t = toEditorTheme(parseMouTheme('editor\nforeground: nope\n'));
  assert.match(t.foreground, /^#/);
});

/* ------------------------------ traductions ------------------------------ */

test('i18n : français et anglais ont les mêmes clés', () => {
  const fr = Object.keys(DICTS.fr).sort();
  const en = Object.keys(DICTS.en).sort();
  assert.deepEqual(fr.filter((k) => !en.includes(k)), [], 'clés absentes en anglais');
  assert.deepEqual(en.filter((k) => !fr.includes(k)), [], 'clés absentes en français');
});

test('i18n : pluriels, paramètres, langue du système', () => {
  assert.equal(translate('fr', 'status.words', { n: 0 }), '0 mot');
  assert.equal(translate('fr', 'status.words', { n: 1 }), '1 mot');
  assert.equal(translate('fr', 'status.words', { n: 2 }), '2 mots');
  assert.equal(translate('en', 'status.words', { n: 1 }), '1 word');
  assert.equal(translate('en', 'status.words', { n: 0 }), '0 words');
  assert.equal(translate('fr', 'dlg.fileNotFound', { path: 'C:\\x' }), 'Fichier introuvable :\nC:\\x');
  assert.equal(translate('fr', 'inconnue'), 'inconnue');
  assert.equal(resolveLanguage('auto', 'fr-CA'), 'fr');
  assert.equal(resolveLanguage('auto', 'en-US'), 'en');
  assert.equal(resolveLanguage('auto', 'de-DE'), 'fr');
  assert.equal(resolveLanguage('en', 'fr-CA'), 'en');
});

/* ------------------------------ fichiers ------------------------------ */

test('Fichiers : BOM, fin de ligne, aller-retour', () => {
  const d = decodeDocument(Buffer.from('\ufeffa\r\nb\r\n', 'utf8'));
  assert.deepEqual(d, { text: 'a\nb\n', bom: true, eol: '\r\n' });
  assert.equal(decodeDocument(Buffer.from('a\nb\r\nc\n')).eol, '\n', 'majorité LF');
  assert.equal(decodeDocument(Buffer.from('a\rb')).text, 'a\nb', 'CR seul normalisé');
  const out = encodeDocument('a\nb', { bom: true, eol: '\r\n', ensureNewline: true });
  assert.deepEqual([...out.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(out.subarray(3).toString(), 'a\r\nb\r\n');
  assert.equal(encodeDocument('x', { ensureNewline: false }).toString(), 'x');
});

test('Fichiers : tout encodage autre que UTF-8 est refusé (jamais réécrit en silence)', () => {
  const cp1252 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]); // « café » en Windows-1252
  assert.throws(() => decodeDocument(cp1252), { code: 'WD_NOT_UTF8' });
  assert.throws(() => decodeDocument(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hé', 'utf16le')])), { code: 'WD_NOT_UTF8' });
  assert.throws(() => decodeDocument(Buffer.from([0xfe, 0xff, 0x00, 0x68])), { code: 'WD_NOT_UTF8' });
  assert.throws(() => decodeDocument(Buffer.from([0xef, 0xbb, 0xbf, 0xe9])), { code: 'WD_NOT_UTF8' }, 'BOM puis octet invalide');
  assert.equal(decodeDocument(Buffer.from('café', 'utf8')).text, 'café');
  assert.equal(decodeDocument(Buffer.alloc(0)).text, '');
});

test('Fichiers : un échec d’écriture du fichier temporaire laisse l’original intact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-fail-'));
  const f = path.join(dir, 'x.md');
  fs.writeFileSync(f, 'original\n');
  // Un dossier au nom du fichier temporaire fait échouer son écriture (comme un disque plein).
  fs.mkdirSync(path.join(dir, `.x.md.${process.pid}.wd-tmp`));
  assert.throws(() => writeDocument(f, 'nouveau\n', {}));
  assert.equal(fs.readFileSync(f, 'utf8'), 'original\n');
});

test('Fichiers : écriture atomique sans résidu', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-files-'));
  const f = path.join(dir, 'x.md');
  writeDocument(f, '# é\n', {});
  writeDocument(f, '# é2\n', {});
  assert.equal(readDocument(f).text, '# é2\n');
  assert.deepEqual(fs.readdirSync(dir), ['x.md']);
  assert.equal(isMarkdownFile('A.MD'), true);
  assert.equal(isMarkdownFile('a.exe'), false);
});

/* ------------------------------ terminal ------------------------------ */

test('Support du terminal : manipulation du PATH', () => {
  const dir = 'C:\\Users\\X\\AppData\\Local\\WinDown\\bin';
  assert.equal(shell.addToPath('C:\\a;C:\\b', dir), `C:\\a;C:\\b;${dir}`);
  assert.equal(shell.addToPath(`C:\\a;${dir.toLowerCase()}\\`, dir), `C:\\a;${dir.toLowerCase()}\\`, 'déjà présent (casse, barre finale)');
  assert.equal(shell.removeFromPath(`C:\\a;${dir};C:\\b`, dir), 'C:\\a;C:\\b');
  assert.equal(shell.addToPath('', dir), dir);
  assert.equal(shell.parseRegQuery('\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %USERPROFILE%\\bin;C:\\x\r\n'), '%USERPROFILE%\\bin;C:\\x');
  assert.equal(shell.parseRegQuery('ERREUR'), '');
});

test('Support du terminal : installation et désinstallation (registre simulé)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-shell-'));
  let userPath = '%USERPROFILE%\\bin';
  const calls = [];
  const run = async (file, args) => {
    calls.push(`${file} ${args[0]}`);
    if (file === 'reg.exe' && args[0] === 'query') return { stdout: `    Path    REG_EXPAND_SZ    ${userPath}\r\n` };
    if (file === 'reg.exe' && args[0] === 'add') {
      assert.ok(args.includes('REG_EXPAND_SZ'), 'le type étendu est conservé');
      userPath = args[args.indexOf('/d') + 1];
    }
    return { stdout: '' };
  };
  const s = shell.createShellSupport({ localAppData: dir, exePath: 'C:\\WinDown\\WinDown.exe', appPath: 'C:\\app', isPackaged: true, run });
  assert.equal((await s.status()).installed, false);
  const st = await s.install();
  assert.equal(st.installed, true);
  assert.match(fs.readFileSync(s.cmdFile, 'utf8'), /start "" "C:\\WinDown\\WinDown\.exe" %\*/);
  assert.ok(userPath.startsWith('%USERPROFILE%\\bin;'), 'entrées existantes conservées telles quelles');
  await s.install();
  assert.equal(userPath.split(';').filter((e) => e === s.binDir).length, 1, 'pas de doublon');
  const after = await s.uninstall();
  assert.equal(after.installed, false);
  assert.equal(userPath, '%USERPROFILE%\\bin');
  assert.equal(fs.existsSync(s.cmdFile), false);
  const dev = shell.createShellSupport({ localAppData: dir, exePath: 'C:\\e\\electron.exe', appPath: 'C:\\proj', isPackaged: false, run });
  assert.match(dev.cmdContent(), /"C:\\e\\electron\.exe" "C:\\proj" %\*/);
});

/* ------------------------------ protocoles ------------------------------ */

test('safeJoin refuse toute sortie du dossier', () => {
  const base = path.resolve('C:\\app\\dist\\preview');
  assert.equal(safeJoin(base, 'frame.js'), path.join(base, 'frame.js'));
  assert.equal(safeJoin(base, 'vendor/x.js'), path.join(base, 'vendor', 'x.js'));
  assert.equal(safeJoin(base, '../secret.txt'), null);
  assert.equal(safeJoin(base, 'a/../../secret.txt'), null);
  assert.equal(safeJoin(base, 'C:\\Windows\\win.ini'), null);
});

test('Chemins réseau refusés : relatif encodé, absolu, périphérique ; partage du document permis', () => {
  const local = 'C:\\docs';
  // « %5C%5Chost%5Cshare%5Cx.png » décodé par le protocole, puis résolu depuis le dossier du document.
  const viaRelative = path.resolve(local, decodeURIComponent('%5C%5Chost%5Cshare%5Cx.png'));
  assert.equal(isNetworkPath(viaRelative), true);
  assert.equal(isAllowedLocalTarget(local, viaRelative), false);
  assert.equal(isAllowedLocalTarget(local, path.resolve(local, '//host/share/x.png')), false);
  assert.equal(isAllowedLocalTarget(local, '\\\\?\\C:\\x.png'), false);
  assert.equal(isAllowedLocalTarget(local, '\\\\.\\pipe\\x'), false);
  assert.equal(isAllowedLocalTarget(local, 'C:\\docs\\img\\a.png'), true);
  assert.equal(isAllowedLocalTarget(local, 'D:\\autre\\a.png'), true, 'les autres lecteurs locaux restent permis');
  const share = '\\\\nas\\equipe\\docs';
  assert.equal(isAllowedLocalTarget(share, '\\\\nas\\equipe\\docs\\img\\a.png'), true, 'document ouvert depuis ce partage');
  assert.equal(isAllowedLocalTarget(share, '\\\\autre\\x\\a.png'), false);
  assert.equal(isAllowedLocalTarget(share, '\\\\nas\\equipe\\secret.png'), false, 'hors du dossier du document');
});

test('Page d’impression : seuls les scripts de WinDown (nonce) s’exécutent', () => {
  const { withCsp, extractNonce, printCsp } = require('../src/main/export.js');
  const nonce = 'abcdef0123456789abcdef';
  const html = assembleHtml({ title: 't', body: '<p>x</p><script>alert(1)</script><meta name="windown-nonce" content="forgedforgedforged">', post: 'void 0', nonce });
  assert.equal(extractNonce(html), nonce, 'le nonce vient de <head>, jamais du corps');
  assert.match(html, new RegExp(`<script nonce="${nonce}">void 0</script>`));
  assert.match(html, /<p>x<\/p><script>alert\(1\)<\/script>/, 'le script du document n’a pas de nonce');
  const csp = withCsp(html);
  assert.match(csp, new RegExp(`script-src 'nonce-${nonce}' 'strict-dynamic'`));
  assert.doesNotMatch(printCsp(nonce), /unsafe-inline'[^;]*script|script-src[^;]*unsafe-inline/);
  assert.match(printCsp(null), /script-src 'none'/);
  assert.equal(extractNonce('<html><head></head><body><meta name="windown-nonce" content="forgedforgedforged"></body>'), null);
});

/* ------------------------------ menu ------------------------------ */

test('Menu : raccourcis uniques, libellés traduits, pas de Ctrl+Alt', () => {
  for (const lang of ['fr', 'en']) {
    const t = (k, p) => translate(lang, k, p);
    const noop = () => {};
    const actions = new Proxy({}, { get: () => noop });
    const tpl = buildMenuTemplate({ t, recent: ['C:\\a.md', 'C:\\b.md'], view: { editorVisible: true, previewVisible: true, toolbarVisible: true }, devTools: true, actions });
    const accels = [];
    const labels = [];
    (function walk(items) {
      for (const it of items) {
        if (it.accelerator) accels.push(it.accelerator);
        if (it.label) labels.push(it.label);
        if (it.submenu) walk(it.submenu);
      }
    })(tpl);
    const dup = accels.filter((a, i) => accels.indexOf(a) !== i);
    assert.deepEqual(dup, [], `raccourcis en double (${lang})`);
    assert.ok(!accels.some((a) => /Alt/i.test(a)), 'pas de Ctrl+Alt (AltGr)');
    assert.deepEqual(labels.filter((l) => /^menu\./.test(l)), [], `libellé non traduit (${lang})`);
    assert.ok(tpl.length === 5);
  }
});

/* ------------------------------ export HTML ------------------------------ */

test('Export HTML : assemblage, échappements, scripts neutralisés', () => {
  const html = assembleHtml({
    title: 'A <b> & "c"',
    lang: 'fr',
    styles: ['body{color:red}', ''],
    body: '<p>x</p>',
    libraries: ['var a="</script><script>alert(1)</script>";'],
    post: 'window.WinDownPost={run:function(){return Promise.resolve()}};',
    postOptions: { math: true, urls: { mathjax: 'https://x/</script>' } },
  });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<title>A &lt;b&gt; &amp; &quot;c&quot;<\/title>/);
  assert.match(html, /<style>\nbody\{color:red\}\n<\/style>/);
  assert.equal((html.match(/<\/script>/g) || []).length, 3, 'trois balises script réellement fermées');
  assert.match(html, /<\\\/script><script>alert\(1\)<\\\/script>/, 'le contenu reste inerte');
  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.match(html, /window\.__windownReady=true/);
  assert.doesNotMatch(html, /<\/script>['"]\}/, 'les URL ne referment pas le script');
  assert.equal(inlineScript('</SCRIPT>'), '<\\/SCRIPT>');
  const plain = assembleHtml({ title: '', body: '<p>x</p>', styles: [] });
  assert.doesNotMatch(plain, /<title>/);
  assert.doesNotMatch(plain, /<script>/);
});

/* ------------------------------ attributions ------------------------------ */

test('À propos : version Windows JYH 2026 et attribution à l’auteur de MacDown, fr et en', () => {
  for (const lang of ['fr', 'en']) {
    const about = translate(lang, 'dlg.aboutDetail', { version: '0.1.0' });
    assert.match(about, /Version Windows JYH 2026/);
    assert.match(about, /MacDown/);
    assert.match(about, /Tzu-ping Chung/);
    assert.match(about, /MIT/);
  }
});

test('Licences : texte MIT de MacDown intact, avis de copyright dans LICENSE, licences.md et le paquet', () => {
  const root = path.join(__dirname, '..');
  const upstream = fs.readFileSync(path.join(root, 'resources', 'LICENSE-MacDown.txt'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(upstream, /Copyright \(c\) 2014 Tzu-ping Chung/);
  assert.match(upstream, /The above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software\./);
  const licence = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(licence, /Version Windows JYH 2026/);
  assert.match(licence, /Copyright \(c\) 2014 Tzu-ping Chung/);
  const doc = fs.readFileSync(path.join(root, 'resources', 'licences.md'), 'utf8');
  assert.match(doc, /Copyright \(c\) 2014 Tzu-ping Chung/);
  assert.match(doc, /Version Windows JYH 2026/);
  assert.match(doc, /ni approuvé ni\naffilié/);
  assert.match(fs.readFileSync(path.join(root, 'scripts', 'package.mjs'), 'utf8'), /LICENSE-MacDown\.txt/);
});
