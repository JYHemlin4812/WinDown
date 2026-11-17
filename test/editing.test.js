'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/renderer/format.js');
const S = require('../src/renderer/smart-edit.js');

/** Applique une transformation sur un texte où `|` marque le curseur ou `[` `]` la sélection. */
function run(fn, marked, ...args) {
  let from;
  let to;
  let text;
  if (marked.includes('[')) {
    from = marked.indexOf('[');
    const without = marked.replace('[', '');
    to = without.indexOf(']');
    text = without.replace(']', '');
  } else {
    from = to = marked.indexOf('|');
    text = marked.replace('|', '');
  }
  const edit = fn({ text, from, to }, ...args);
  const out = F.applyEdit(text, edit);
  const withSel =
    edit.anchor === edit.head
      ? out.slice(0, edit.anchor) + '|' + out.slice(edit.anchor)
      : out.slice(0, edit.anchor) + '[' + out.slice(edit.anchor, edit.head) + ']' + out.slice(edit.head);
  return withSel;
}

test('Gras : entoure, retire, mot sous le curseur, curseur seul', () => {
  assert.equal(run(F.toggleStrong, 'un [mot] ici'), 'un **[mot]** ici');
  assert.equal(run(F.toggleStrong, 'un **[mot]** ici'), 'un [mot] ici');
  assert.equal(run(F.toggleStrong, '[**mot**]'), '[mot]');
  assert.equal(run(F.toggleStrong, 'un mo|t ici'), 'un **[mot]** ici');
  assert.equal(run(F.toggleStrong, 'a | b'), 'a **|** b');
});

test('Emphase : ne défait pas le gras, accepte le gras-italique', () => {
  assert.equal(run(F.toggleEmphasis, '*[x]*'), '[x]');
  assert.equal(run(F.toggleEmphasis, '**[x]**'), '***[x]***');
  assert.equal(run(F.toggleEmphasis, '***[x]***'), '**[x]**');
});

test('Souligné, barré, surligné, code', () => {
  assert.equal(run(F.toggleUnderline, '[a]'), '_[a]_');
  assert.equal(run(F.toggleStrikethrough, '[a]'), '~~[a]~~');
  assert.equal(run(F.toggleHighlight, '[a]'), '==[a]==');
  assert.equal(run(F.toggleInlineCode, '[a]'), '`[a]`');
  assert.equal(run(F.toggleInlineCode, '`[a]`'), '[a]');
});

test('Commentaire HTML : sélection, ligne, retrait', () => {
  assert.equal(run(F.toggleComment, 'x [note] y'), 'x <!-- [note] --> y');
  assert.equal(run(F.toggleComment, 'ligne|'), '<!-- [ligne] -->');
  assert.equal(run(F.toggleComment, '[<!-- a -->]'), '[a]');
});

test('Titres : conversion, remplacement, paragraphe', () => {
  assert.equal(run(F.convertToHeading, 'Titre|', 2), '## Titre|');
  assert.equal(F.applyEdit('Titre', F.convertToHeading({ text: 'Titre', from: 0, to: 0 }, 2)), '## Titre');
  assert.equal(F.applyEdit('# Titre', F.convertToHeading({ text: '# Titre', from: 3, to: 3 }, 3)), '### Titre');
  assert.equal(F.applyEdit('### Titre', F.convertToHeading({ text: '### Titre', from: 0, to: 0 }, 0)), 'Titre');
  assert.equal(F.applyEdit('a\nb', F.convertToHeading({ text: 'a\nb', from: 0, to: 3 }, 1)), '# a\n# b');
});

test('Listes : ajout, retrait, conversion entre types, numérotation', () => {
  const ed = (text, from, to, ordered, marker) =>
    F.applyEdit(text, F.toggleList({ text, from, to }, ordered, marker));
  assert.equal(ed('a\nb', 0, 3, false), '* a\n* b');
  assert.equal(ed('a\nb', 0, 3, false, '- '), '- a\n- b');
  assert.equal(ed('* a\n* b', 0, 7, false), 'a\nb');
  assert.equal(ed('a\n\nb', 0, 4, true), '1. a\n\n2. b');
  assert.equal(ed('* a\n* b', 0, 7, true), '1. a\n2. b');
  assert.equal(ed('1. a\n2. b', 0, 9, true), 'a\nb');
  assert.equal(ed('---', 0, 3, false), '* ---', 'une règle horizontale n’est pas un élément de liste');
});

test('Citation et indentation', () => {
  const run2 = (fn, text, from, to) => F.applyEdit(text, fn({ text, from, to }));
  assert.equal(run2(F.toggleBlockquote, 'a\nb', 0, 3), '> a\n> b');
  assert.equal(run2(F.toggleBlockquote, '> a\n> b', 0, 7), 'a\nb');
  assert.equal(run2((c) => F.indentLines(c, '    '), 'a\nb', 0, 3), '    a\n    b');
  assert.equal(run2(F.unindentLines, '\ta\n    b\n  c', 0, 12), 'a\nb\nc');
});

test('Sélection de lignes : une sélection qui finit en début de ligne exclut cette ligne', () => {
  assert.equal(F.selectedLines('a\nb\nc', 0, 2).length, 1);
  assert.equal(F.selectedLines('a\nb\nc', 0, 3).length, 2);
});

test('Lien et image', () => {
  assert.equal(run(F.insertLink, '[texte]', 'link'), '[texte](' + '[http://url]' + ')');
  assert.equal(run(F.insertLink, '|', 'link'), '[[link text]](http://url)');
  assert.equal(run(F.insertLink, '|', 'image'), '![[alt text]](path/or/url/to.jpg)');
});

test('Nouveau paragraphe et casse', () => {
  assert.equal(F.applyEdit('abc\ndef', F.newParagraph({ text: 'abc\ndef', from: 1, to: 1 })), 'abc\n\n\ndef');
  assert.equal(F.applyEdit('un deux', F.transformCase({ text: 'un deux', from: 0, to: 7 }, 'upper')), 'UN DEUX');
  assert.equal(F.applyEdit('UN DEUX', F.transformCase({ text: 'UN DEUX', from: 0, to: 7 }, 'lower')), 'un deux');
  assert.equal(F.applyEdit('un deux', F.transformCase({ text: 'un deux', from: 0, to: 7 }, 'capitalize')), 'Un Deux');
  assert.equal(F.applyEdit('été fini', F.transformCase({ text: 'été fini', from: 0, to: 8 }, 'capitalize')), 'Été Fini');
});

/* ------------------------------ saisie intelligente ------------------------------ */

const enter = (text, pos, o = {}) => {
  const r = S.continueLine(text, pos, { insertPrefixInBlock: true, autoIncrement: true, ...o });
  if (!r) return null;
  const out = F.applyEdit(text, { changes: r.changes });
  return out.slice(0, r.cursor) + '|' + out.slice(r.cursor);
};

test('Entrée : continue une liste à puces avec la même puce', () => {
  assert.equal(enter('- a', 3), '- a\n- |');
  assert.equal(enter('  * a', 5), '  * a\n  * |');
});

test('Entrée : liste numérotée, incrément activé ou non', () => {
  assert.equal(enter('1. a', 4), '1. a\n2. |');
  assert.equal(enter('9. a', 4), '9. a\n10. |');
  assert.equal(enter('3. a', 4, { autoIncrement: false }), '3. a\n3. |');
});

test('Entrée : liste de tâches', () => {
  assert.equal(enter('- [x] fait', 10), '- [x] fait\n- [ ] |');
});

test('Entrée : élément vide quitte la liste', () => {
  assert.equal(enter('- a\n- ', 6), '- a\n|');
  assert.equal(enter('1. ', 3), '|');
});

test('Entrée : curseur au milieu coupe la ligne', () => {
  const r = S.continueLine('- abc', 4, { insertPrefixInBlock: true, autoIncrement: true });
  assert.equal(F.applyEdit('- abc', { changes: r.changes }), '- ab\n- c');
});

test('Entrée : citation, imbriquée, vide', () => {
  assert.equal(enter('> a', 3), '> a\n> |');
  assert.equal(enter('> > a', 5), '> > a\n> > |');
  assert.equal(enter('> ', 2), '|');
});

test('Entrée : sans préfixe de bloc, seule l’indentation continue', () => {
  assert.equal(enter('- a', 3, { insertPrefixInBlock: false }), null);
  assert.equal(enter('    code', 8, { insertPrefixInBlock: false }), '    code\n    |');
});

test('Entrée : règle horizontale et texte simple → comportement par défaut', () => {
  assert.equal(enter('---', 3), null);
  assert.equal(enter('* * *', 5), null);
  assert.equal(enter('texte', 5), null);
});

test('Caractères appariés : insertion, saut, entourage', () => {
  const t = (text, from, to, ch, o) => {
    const r = S.completeChar(text, from, to, ch, o);
    if (!r) return null;
    const out = F.applyEdit(text, { changes: r.changes });
    return r.anchor === r.head ? out.slice(0, r.anchor) + '|' + out.slice(r.anchor) : out.slice(0, r.anchor) + '[' + out.slice(r.anchor, r.head) + ']' + out.slice(r.head);
  };
  assert.equal(t('', 0, 0, '('), '(|)');
  assert.equal(t('a ', 2, 2, '"'), 'a "|"');
  assert.equal(t('mot', 3, 3, '"'), null, 'pas de guillemet apparié contre un mot');
  assert.equal(t('()', 1, 1, ')'), '()|', 'on saute la parenthèse fermante existante');
  assert.equal(t('abc', 0, 3, '('), '([abc])');
  assert.equal(t('abc', 0, 3, '*'), '*[abc]*');
  assert.equal(t('abc', 0, 3, '~'), null);
  assert.equal(t('abc', 0, 3, '~', { strikethrough: true }), '~[abc]~');
  assert.equal(t('a', 0, 0, 'xy'), null);
  assert.equal(t('ab', 1, 1, '('), null, 'pas de complétion devant un mot');
});

test('Retour arrière entre caractères appariés', () => {
  const r = S.deleteMatching('a()b', 2);
  assert.equal(F.applyEdit('a()b', { changes: r.changes }), 'ab');
  assert.equal(r.cursor, 1);
  assert.equal(S.deleteMatching('a(x)b', 2), null);
});

test('Tabulation en espaces et retour arrière sur espaces', () => {
  assert.equal(S.tabToSpaces('ab', 2), '  ');
  assert.equal(S.tabToSpaces('', 0), '    ');
  const r = S.unindentSpaces('        x', 8);
  assert.equal(r.cursor, 4);
  assert.equal(S.unindentSpaces('  x', 3), null);
  assert.equal(S.unindentSpaces('ab    ', 6).cursor, 4);
});

test('Début de ligne intelligent', () => {
  assert.equal(S.smartHomeTarget('    abc', 7), 4);
  assert.equal(S.smartHomeTarget('    abc', 4), null);
  assert.equal(S.smartHomeTarget('abc', 2), 0, 'sans indentation, Début va au début de ligne');
});
