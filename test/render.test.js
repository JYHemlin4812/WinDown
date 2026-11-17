'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Prism = require('prismjs');
const { renderMarkdown, extractFrontMatter, countText, slugify } = require('../src/shared/render.js');

const r = (md, o) => renderMarkdown(md, o).html;

test('Markdown de base : titres, gras, italique, liens, listes', () => {
  const html = r('# Titre\n\n**gras** et *italique* [lien](http://x.y "t")\n\n* a\n* b\n');
  assert.match(html, /<h1[^>]*>Titre<\/h1>/);
  assert.match(html, /<strong>gras<\/strong>/);
  assert.match(html, /<em>italique<\/em>/);
  assert.match(html, /<a href="http:\/\/x\.y" title="t">lien<\/a>/);
  assert.match(html, /<ul[^>]*>\s*<li[^>]*>a<\/li>/);
});

test('HTML brut conservé (MathML, ancres)', () => {
  const html = r('<a name="x"></a>\n\n<math><mn>1</mn></math>\n');
  assert.match(html, /<a name="x"><\/a>/);
  assert.match(html, /<math><mn>1<\/mn><\/math>/);
});

test('Italique dans un mot : activé par défaut, désactivable', () => {
  assert.match(r('So A*maz*ing'), /A<em>maz<\/em>ing/);
  assert.match(r('foo_bar_baz'), /foo<em>bar<\/em>baz/);
  assert.doesNotMatch(r('foo_bar_baz', { intraEmphasis: false }), /<em>/);
});

test('Tableaux : activés ou non', () => {
  const t = '| a | b |\n|:--|--:|\n| 1 | 2 |\n';
  assert.match(r(t), /<table/);
  assert.match(r(t), /text-align:left/);
  assert.doesNotMatch(r(t, { tables: false }), /<table/);
});

test('Barré, surligné, souligné, citation, exposant', () => {
  assert.doesNotMatch(r('~~x~~'), /<del>/);
  assert.match(r('~~x~~', { strikethrough: true }), /<del>x<\/del>/);
  assert.doesNotMatch(r('==x=='), /<mark>/);
  assert.match(r('==x==', { highlight: true }), /<mark>x<\/mark>/);
  assert.match(r('_x_'), /<em>x<\/em>/);
  assert.match(r('_x_', { underline: true }), /<u>x<\/u>/);
  assert.match(r('*x*', { underline: true }), /<em>x<\/em>/);
  assert.match(r('__x__', { underline: true }), /<strong>x<\/strong>/);
  assert.match(r('"x"', { quote: true }), /<q>x<\/q>/);
  assert.match(r('hoge^(fuga) et a^b', { superscript: true }), /hoge<sup>fuga<\/sup> et a<sup>b<\/sup>/);
  assert.doesNotMatch(r('hoge^(fuga)'), /<sup>/);
});

test('Citation non fermée reste littérale', () => {
  const html = r('un " seul', { quote: true });
  assert.match(html, /un &quot; seul/);
  assert.doesNotMatch(html, /<q>/);
});

test('Lien automatique', () => {
  assert.doesNotMatch(r('http://t.co'), /<a /);
  assert.match(r('http://t.co', { autolink: true }), /<a href="http:\/\/t\.co">/);
});

test('Smartypants', () => {
  assert.match(r('"x" -- ok...', { smartypants: true }), /“x”/);
  assert.match(r('"x"'), /&quot;x&quot;/);
});

test('Quote a priorité sur Smartypants', () => {
  assert.match(r('"x"', { quote: true, smartypants: true }), /<q>x<\/q>/);
});

test('Notes de bas de page', () => {
  const md = 'Texte[^a]\n\n[^a]: La note.\n';
  assert.match(r(md), /class="footnote-ref"/);
  assert.match(r(md), /La note\./);
  assert.doesNotMatch(r(md, { footnotes: false }), /footnote-ref/);
});

test('Blocs de code : désactivables', () => {
  assert.match(r('```\nx\n```'), /<pre[^>]*><code>x\n<\/code><\/pre>/);
  assert.doesNotMatch(r('```\nx\n```', { fencedCode: false }), /<pre/);
  assert.match(r('~~~\nx\n~~~'), /<pre/);
});

test('Liste de tâches', () => {
  const md = '- [x] fait\n- [ ] à faire\n';
  assert.doesNotMatch(r(md), /checkbox/);
  const html = r(md, { taskList: true });
  assert.match(html, /task-list-item/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /disabled/);
  assert.match(html, /checked/);
});

test('Retours à la ligne littéraux', () => {
  assert.doesNotMatch(r('a\nb'), /<br/);
  assert.match(r('a\nb', { hardWrap: true }), /a<br>\s*b/);
});

test('Front-matter Jekyll : tableau, lignes conservées', () => {
  const src = '---\ntitle: "WinDown"\ndate: 2026-01-01\n---\n# Bonjour\n';
  const out = renderMarkdown(src, { frontMatter: true });
  assert.match(out.html, /<th>title<\/th>/);
  assert.match(out.html, /<td>WinDown<\/td>/);
  assert.match(out.html, /data-line="4"/, 'le titre garde le numéro de ligne 4 (index 0)');
  assert.doesNotMatch(r(src), /<table/);
  assert.equal(extractFrontMatter('# x').table, '');
});

test('Table des matières [TOC]', () => {
  const md = '[TOC]\n\n# A\n\n## B\n\n## C\n\n# D\n';
  const html = r(md, { toc: true });
  assert.match(html, /<a href="#a">A<\/a>/);
  assert.match(html, /<a href="#b">B<\/a>/);
  assert.match(html, /<h2[^>]*id="c"/);
  assert.doesNotMatch(html, /\[TOC\]/);
  assert.match(r(md), /\[TOC\]/);
});

test('Identifiants de titres uniques', () => {
  const html = r('# Même\n\n# Même\n');
  assert.match(html, /id="même"/);
  assert.match(html, /id="même-1"/);
  assert.equal(slugify('Hello, World!'), 'hello-world');
});

test('Mathématiques : protégées du Markdown, uniquement si activées', () => {
  const md = 'En ligne \\\\( 1 + a_b^c \\\\) puis\n\n\\\\[\n  A^T_S = B\n\\\\]\n\n$$x_1*y_2$$\n';
  const html = r(md, { mathjax: true, superscript: true, underline: true });
  assert.match(html, /\\\( 1 \+ a_b\^c \\\)/);
  assert.match(html, /\\\[\n {2}A\^T_S = B\n\\\]/);
  assert.match(html, /\$\$x_1\*y_2\$\$/);
  assert.doesNotMatch(html, /<em>|<sup>|<u>/);
});

test('Math : dollar simple seulement avec l’option', () => {
  const on = { mathjax: true, mathInlineDollar: true, underline: false };
  const html = r('prix $a_b_c$ ok', on);
  assert.match(html, /\$a_b_c\$/);
  assert.doesNotMatch(html, /<em>/);
  assert.match(r('prix $a_b_c$ ok', { mathjax: true }), /<em>b<\/em>/);
  // Deux montants ne sont pas des maths : le Markdown s'applique entre les $.
  assert.match(r('coûte $5_a_ et $6', on), /<em>a<\/em>/);
});

test('Coloration syntaxique, numéros de ligne, accessoires', () => {
  const highlighter = (code, lang) =>
    Prism.languages[lang] ? Prism.highlight(code, Prism.languages[lang], lang) : null;
  const base = { syntaxHighlighting: true, highlighter };
  const html = r('```js\nconst a = 1;\n```', base);
  assert.match(html, /<pre[^>]*class="language-javascript"/);
  assert.match(html, /<span class="token keyword">const<\/span>/);
  assert.doesNotMatch(html, /line-numbers/);
  assert.match(r('```py\nx=1\n```', { ...base, lineNumbers: true }), /line-numbers-rows/);
  assert.match(r('```py\nx=1\n```', { ...base, codeBlockAccessory: 'language' }), /data-language="python"/);
  assert.match(
    r('```py:main.py\nx=1\n```', { ...base, codeBlockAccessory: 'custom' }),
    /data-information="main\.py"/
  );
  // Sans coloration : classe seulement, contenu échappé.
  const plain = r('```js\n<b>\n```');
  assert.match(plain, /<code class="language-javascript">&lt;b&gt;/);
});

test('Mermaid et Graphviz exigent la coloration et leur option', () => {
  const on = { syntaxHighlighting: true };
  const m = renderMarkdown('```mermaid\ngraph TD; A-->B\n```', { ...on, mermaid: true });
  assert.equal(m.mermaid, true);
  assert.match(m.html, /language-mermaid/);
  const g = renderMarkdown('```graphviz\ndigraph{a->b}\n```', { ...on, graphviz: true });
  assert.equal(g.graphviz, true);
  assert.match(g.html, /language-dot/);
  assert.equal(renderMarkdown('```mermaid\nx\n```', { mermaid: true }).mermaid, false);
  assert.equal(renderMarkdown('```mermaid\nx\n```', { ...on }).mermaid, false);
});

test('Repères de ligne pour la synchronisation du défilement', () => {
  const html = r('# T\n\npara\n\n- a\n- b\n');
  assert.match(html, /<h1[^>]* data-line="0"/);
  assert.match(html, /<p data-line="2"/);
  assert.match(html, /<ul data-line="4"/);
});

test('Réécriture des URL d’images', () => {
  const html = r('![a](img.png)', { rewriteUrl: (u) => 'x://' + u });
  assert.match(html, /src="x:\/\/img\.png"/);
});

test('countText', () => {
  assert.deepEqual(countText('un deux  trois\nquatre'), { words: 4, characters: 21, charactersNoSpaces: 17 });
  assert.deepEqual(countText(''), { words: 0, characters: 0, charactersNoSpaces: 0 });
});

test('Aide de MacDown : rend sans erreur avec toutes les options', () => {
  const help = fs.readFileSync(path.join(__dirname, 'fixtures', 'help.md'), 'utf8');
  const all = {
    autolink: true, strikethrough: true, underline: true, superscript: true, highlight: true,
    quote: false, smartypants: true, taskList: true, frontMatter: true, toc: true, footnotes: true,
    mathjax: true, syntaxHighlighting: true, lineNumbers: true, codeBlockAccessory: 'language',
    highlighter: () => null,
  };
  const out = renderMarkdown(help, all);
  assert.ok(out.html.length > 5000);
  assert.match(out.html, /<table/);
  assert.match(out.html, /<sup>fuga<\/sup>/);
  assert.match(out.html, /<mark>So good<\/mark>/);
  assert.match(out.html, /<u>So doge<\/u>/);
  assert.match(out.html, /task-list-item/);
  assert.match(out.html, /footnotes/);
  assert.match(out.html, /\\\( 1 \+ 1 \\\)/);
  assert.ok(out.headings.length > 10);
});

test('Images : chemin Windows absolu avec antislashs, encodé par markdown-it', () => {
  const { toDocUrl, toFileUrl, absoluteWindowsPath } = require('../src/shared/paths.js');
  const md = '![abs](C:\\Users\\Alice\\IA\\pic.png)\n\n![fwd](C:/Users/x/pic.png)\n\n![net](\\\\serveur\\partage\\x.png)\n\n![web](https://exemple.com/a.png)\n';
  const base = 'windown-doc://w3/';
  const html = r(md, { rewriteUrl: (u) => toDocUrl(u, base) });
  assert.match(html, /src="windown-doc:\/\/w3\/__abs__\/C%3A%2FUsers%2FAlice%2FIA%2Fpic\.png"/);
  assert.match(html, /src="windown-doc:\/\/w3\/__abs__\/C%3A%2FUsers%2Fx%2Fpic\.png"/);
  assert.match(html, /src="https:\/\/exemple\.com\/a\.png"/);
  assert.doesNotMatch(html, /__abs__\/%5C|__abs__\/\/\//, 'jamais de chemin réseau vers le protocole');
  assert.equal(absoluteWindowsPath('\\\\serveur\\partage\\x.png'), null);
  assert.equal(absoluteWindowsPath('%5C%5Cserveur%5Cx.png'), null);
  assert.equal(toFileUrl('C:\\Users\\a b\\p.png'), 'file:///C:/Users/a%20b/p.png');
  assert.equal(toFileUrl('img/p.png'), 'img/p.png');
});

test('Parité : TOC avec la classe toc, liens www avec Lien automatique', () => {
  assert.match(r('[TOC]\n\n# A\n', { toc: true }), /<ul class="toc">/);
  assert.match(r('voir www.exemple.com', { autolink: true }), /<a href="http:\/\/www\.exemple\.com">www\.exemple\.com<\/a>/);
  assert.doesNotMatch(r('voir www.exemple.com'), /<a /);
});
