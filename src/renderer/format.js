'use strict';
/**
 * Transformations de texte de la barre d'outils et du menu Format.
 *
 * Fonctions pures : entrée { text, from, to } (sélection en positions de
 * caractères), sortie { changes: [{from, to, insert}], anchor, head } où
 * anchor/head sont les positions dans le texte APRÈS application des
 * changements. Aucune dépendance à CodeMirror, donc testables sous Node.
 */

const WORD = /[\p{L}\p{N}_]/u;

function lineStart(text, pos) {
  return text.lastIndexOf('\n', pos - 1) + 1;
}
function lineEnd(text, pos) {
  const i = text.indexOf('\n', pos);
  return i < 0 ? text.length : i;
}

/** Lignes touchées par la sélection : [{start, end, text}] ; une sélection qui finit en début de ligne n'inclut pas cette ligne. */
function selectedLines(text, from, to) {
  const start = lineStart(text, from);
  const effectiveTo = to > from && text[to - 1] === '\n' ? to - 1 : to;
  const end = lineEnd(text, effectiveTo);
  const lines = [];
  let pos = start;
  for (;;) {
    const e = lineEnd(text, pos);
    lines.push({ start: pos, end: e, text: text.slice(pos, e) });
    if (e >= end) break;
    pos = e + 1;
  }
  return lines;
}

function replaceRange(text, from, to, insert) {
  return {
    changes: [{ from, to, insert }],
    anchor: from + insert.length,
    head: from + insert.length,
  };
}

/** Applique un résultat de transformation à un texte (utilisé par les tests et l'éditeur). */
function applyEdit(text, edit) {
  const sorted = [...edit.changes].sort((a, b) => b.from - a.from);
  let out = text;
  for (const c of sorted) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
}

/** Applique des remplacements ligne par ligne et recalcule la sélection. */
function mapLines(ctx, fn) {
  const { text, from, to } = ctx;
  const lines = selectedLines(text, from, to);
  const results = lines.map((line, i) => {
    const out = fn(line, i);
    return out === null || out === undefined ? line.text : out;
  });
  const changes = [];
  lines.forEach((line, i) => {
    if (results[i] !== line.text) changes.push({ from: line.start, to: line.end, insert: results[i] });
  });

  // Positions après changement : début et fin des lignes touchées.
  const newStarts = [];
  let shift = 0;
  lines.forEach((line, i) => {
    newStarts.push(line.start + shift);
    shift += results[i].length - line.text.length;
  });

  if (from !== to) {
    const last = lines.length - 1;
    return { changes, anchor: newStarts[0], head: newStarts[last] + results[last].length };
  }
  // Curseur : reste dans sa ligne, décalé de la variation de longueur de celle-ci.
  const line = lines[0];
  const diff = results[0].length - line.text.length;
  const col = from - line.start;
  const pos = newStarts[0] + Math.max(0, Math.min(col + diff, results[0].length));
  return { changes, anchor: pos, head: pos };
}

/* -- Balises en ligne (**gras**, *emphase*, …) ---------------------- */

function surroundedBy(text, from, to, open, close) {
  if (from < open.length || to + close.length > text.length) return false;
  if (text.slice(from - open.length, from) !== open || text.slice(to, to + close.length) !== close) return false;
  if (open === '*' && close === '*') {
    // `*` seul ne doit pas défaire un `**` (mais accepte `***`).
    const tri = text.slice(from - 3, from) === '***' && text.slice(to, to + 3) === '***';
    if (tri) return true;
    const dbl = text.slice(from - 2, from) === '**' && text.slice(to, to + 2) === '**';
    if (dbl) return false;
  }
  return true;
}

function wordBounds(text, pos) {
  let a = pos;
  let b = pos;
  while (a > 0 && WORD.test(text[a - 1])) a--;
  while (b < text.length && WORD.test(text[b])) b++;
  return a === b ? null : [a, b];
}

function toggleInline(ctx, open, close = open) {
  let { text, from, to } = ctx;
  if (from === to) {
    const w = wordBounds(text, from);
    if (w) [from, to] = w;
  }
  const sel = text.slice(from, to);

  // Texte sélectionné contenant déjà les balises : on les retire.
  if (sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close)) {
    const inner = sel.slice(open.length, sel.length - close.length);
    if (!(open === '*' && (sel.startsWith('**') && !sel.startsWith('***')))) {
      return { changes: [{ from, to, insert: inner }], anchor: from, head: from + inner.length };
    }
  }
  // Balises juste autour de la sélection : on les retire.
  if (surroundedBy(text, from, to, open, close)) {
    return {
      changes: [
        { from: from - open.length, to: from, insert: '' },
        { from: to, to: to + close.length, insert: '' },
      ],
      anchor: from - open.length,
      head: to - open.length,
    };
  }
  if (from === to) {
    return { changes: [{ from, to, insert: open + close }], anchor: from + open.length, head: from + open.length };
  }
  return {
    changes: [{ from, to, insert: open + sel + close }],
    anchor: from + open.length,
    head: from + open.length + sel.length,
  };
}

const toggleStrong = (c) => toggleInline(c, '**');
const toggleEmphasis = (c) => toggleInline(c, '*');
const toggleUnderline = (c) => toggleInline(c, '_');
const toggleStrikethrough = (c) => toggleInline(c, '~~');
const toggleHighlight = (c) => toggleInline(c, '==');
const toggleInlineCode = (c) => toggleInline(c, '`');

/** Commentaire HTML : sur la sélection, ou sur la ligne si rien n'est sélectionné. */
function toggleComment(ctx) {
  let { text, from, to } = ctx;
  if (from === to) {
    from = lineStart(text, from);
    to = lineEnd(text, from);
  }
  const sel = text.slice(from, to);
  const m = /^<!--\s?([\s\S]*?)\s?-->$/.exec(sel); // asvs-ignore: RegExp.exec, aucune exécution de code.
  if (m) return { changes: [{ from, to, insert: m[1] }], anchor: from, head: from + m[1].length };
  const out = `<!-- ${sel} -->`;
  return { changes: [{ from, to, insert: out }], anchor: from + 5, head: from + 5 + sel.length };
}

/* -- Blocs ---------------------------------------------------------- */

const HEADING_PREFIX = /^(\s{0,3})#{1,6}\s+/;

function convertToHeading(ctx, level) {
  return mapLines(ctx, (line) => {
    const bare = line.text.replace(HEADING_PREFIX, '$1');
    if (level === 0) return bare;
    if (!bare.trim()) return '#'.repeat(level) + ' ';
    return `${'#'.repeat(level)} ${bare.replace(/^\s+/, '')}`;
  });
}

const UL = /^(\s*)[*+-]\s+/;
const OL = /^(\s*)\d+[.)]\s+/;

function toggleList(ctx, ordered, marker = '* ') {
  const lines = selectedLines(ctx.text, ctx.from, ctx.to);
  const re = ordered ? OL : UL;
  const content = lines.filter((l) => l.text.trim());
  const allHave = content.length > 0 && content.every((l) => re.test(l.text) && !/^(\s*)([*-])\2{2,}\s*$/.test(l.text));
  let n = 0;
  return mapLines(ctx, (line) => {
    if (!line.text.trim()) return line.text;
    if (allHave) return line.text.replace(re, '$1');
    n++;
    const stripped = line.text.replace(UL, '$1').replace(OL, '$1');
    const indent = /^\s*/.exec(stripped)[0]; // asvs-ignore: RegExp.exec, aucune exécution de code.
    return `${indent}${ordered ? `${n}. ` : marker}${stripped.slice(indent.length)}`;
  });
}

function toggleBlockquote(ctx) {
  const lines = selectedLines(ctx.text, ctx.from, ctx.to);
  const allQuoted = lines.every((l) => /^\s*>/.test(l.text));
  return mapLines(ctx, (line) => {
    if (allQuoted) return line.text.replace(/^(\s*)>\s?/, '$1');
    return line.text ? `> ${line.text}` : '>';
  });
}

function indentLines(ctx, unit = '\t') {
  return mapLines(ctx, (line) => (line.text ? unit + line.text : line.text));
}

function unindentLines(ctx) {
  return mapLines(ctx, (line) => line.text.replace(/^(?:\t| {1,4})/, ''));
}

/* -- Liens et images ------------------------------------------------ */

function insertLink(ctx, kind = 'link') {
  const { text, from, to } = ctx;
  const sel = text.slice(from, to);
  const bang = kind === 'image' ? '!' : '';
  const label = sel || (kind === 'image' ? 'alt text' : 'link text');
  const url = kind === 'image' ? 'path/or/url/to.jpg' : 'http://url';
  const out = `${bang}[${label}](${url})`;
  if (sel) {
    // Texte existant : on sélectionne l'URL à remplacer.
    const s = from + bang.length + 1 + label.length + 2;
    return { changes: [{ from, to, insert: out }], anchor: s, head: s + url.length };
  }
  const s = from + bang.length + 1;
  return { changes: [{ from, to, insert: out }], anchor: s, head: s + label.length };
}

function newParagraph(ctx) {
  const end = lineEnd(ctx.text, ctx.to);
  return { changes: [{ from: end, to: end, insert: '\n\n' }], anchor: end + 2, head: end + 2 };
}

/* -- Casse ---------------------------------------------------------- */

function transformCase(ctx, mode) {
  let { text, from, to } = ctx;
  if (from === to) {
    const w = wordBounds(text, from);
    if (!w) return { changes: [], anchor: from, head: to };
    [from, to] = w;
  }
  const sel = text.slice(from, to);
  let out = sel;
  if (mode === 'upper') out = sel.toLocaleUpperCase();
  else if (mode === 'lower') out = sel.toLocaleLowerCase();
  else if (mode === 'capitalize') out = sel.replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase());
  return { changes: [{ from, to, insert: out }], anchor: from, head: from + out.length };
}

module.exports = {
  applyEdit,
  selectedLines,
  toggleInline,
  toggleStrong,
  toggleEmphasis,
  toggleUnderline,
  toggleStrikethrough,
  toggleHighlight,
  toggleInlineCode,
  toggleComment,
  convertToHeading,
  toggleList,
  toggleBlockquote,
  indentLines,
  unindentLines,
  insertLink,
  newParagraph,
  transformCase,
  lineStart,
  lineEnd,
  replaceRange,
};
