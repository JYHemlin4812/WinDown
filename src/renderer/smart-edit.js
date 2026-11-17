'use strict';
/**
 * Aides à la saisie de MacDown, en fonctions pures (testables sous Node) :
 * continuation de listes et de citations, indentation, complétion des
 * caractères appariés, retour arrière intelligent, début de ligne intelligent.
 */

const { lineStart, lineEnd } = require('./format.js');

const PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['<', '>'],
  ["'", "'"],
  ['"', '"'],
  ['（', '）'],
  ['「', '」'],
  ['『', '』'],
  ['‘', '’'],
  ['“', '”'],
];
const MARKUP = ['*', '_', '`', '='];
const BOUNDARY = /[\s\p{P}]/u;
const isBoundary = (c) => c === undefined || c === '' || BOUNDARY.test(c);

const LIST_RE = /^(\s*)([*+-]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;
const QUOTE_RE = /^(\s*(?:>\s?)+)(.*)$/;

/**
 * Touche Entrée. Retourne { changes, cursor } ou null pour laisser le comportement par défaut.
 * options : { insertPrefixInBlock, autoIncrement }
 */
function continueLine(text, pos, options) {
  const start = lineStart(text, pos);
  const end = lineEnd(text, pos);
  const line = text.slice(start, end);
  const col = pos - start;
  const after = line.slice(col);

  if (options.insertPrefixInBlock) {
    const m = LIST_RE.exec(line); // asvs-ignore: RegExp.exec, aucune exécution de code.
    // Pas une règle horizontale (`* * *`, `---`).
    if (m && !/^(\s*)([*-])(\s*\2){2,}\s*$/.test(line)) {
      const markerEnd = m[1].length + m[2].length + m[3].length + (m[4] ? m[4].length : 0);
      if (col >= markerEnd) {
        const content = m[5];
        if (!content.trim()) {
          // Élément vide : on sort de la liste.
          return { changes: [{ from: start, to: end, insert: '' }], cursor: start };
        }
        let marker = m[2];
        if (/^\d/.test(marker) && options.autoIncrement) {
          const n = parseInt(marker, 10) + 1;
          marker = `${n}${marker.slice(String(parseInt(marker, 10)).length)}`;
        }
        const box = m[4] ? '[ ] ' : '';
        const prefix = `${m[1]}${marker}${m[3]}${box}`;
        const insert = `\n${prefix}`;
        return { changes: [{ from: pos, to: pos, insert }], cursor: pos + insert.length };
      }
    }
    const q = QUOTE_RE.exec(line); // asvs-ignore: RegExp.exec, aucune exécution de code.
    if (q && col >= q[1].length) {
      if (!q[2].trim()) return { changes: [{ from: start, to: end, insert: '' }], cursor: start };
      const insert = `\n${q[1]}`;
      return { changes: [{ from: pos, to: pos, insert }], cursor: pos + insert.length };
    }
  }
  // Indentation de la ligne précédente.
  const ind = /^([ \t]+)\S/.exec(line); // asvs-ignore: RegExp.exec, aucune exécution de code.
  if (ind && col >= ind[1].length) {
    const insert = `\n${ind[1]}`;
    return { changes: [{ from: pos, to: pos, insert }], cursor: pos + insert.length };
  }
  void after;
  return null;
}

/**
 * Saisie d'un caractère. Retourne { changes, anchor, head } ou null.
 * options : { strikethrough }
 */
function completeChar(text, from, to, input, options = {}) {
  if (input.length !== 1) return null;

  if (from === to) {
    const prev = from > 0 ? text[from - 1] : undefined;
    const next = from < text.length ? text[from] : undefined;
    for (const [open, close] of PAIRS) {
      if (isBoundary(next) && input === open && (isBoundary(prev) || open !== close)) {
        return { changes: [{ from, to, insert: open + close }], anchor: from + 1, head: from + 1 };
      }
      if (input === close && next === close) {
        return { changes: [], anchor: from + 1, head: from + 1 };
      }
    }
    return null;
  }

  for (const [open, close] of PAIRS) {
    if (input === open) return wrap(text, from, to, open, close);
  }
  if (MARKUP.includes(input) || (options.strikethrough && input === '~')) return wrap(text, from, to, input, input);
  return null;
}

function wrap(text, from, to, open, close) {
  const sel = text.slice(from, to);
  return {
    changes: [{ from, to, insert: open + sel + close }],
    anchor: from + open.length,
    head: from + open.length + sel.length,
  };
}

/** Retour arrière entre deux caractères appariés : supprime la paire. */
function deleteMatching(text, pos) {
  if (pos <= 0 || pos >= text.length) return null;
  const a = text[pos - 1];
  const b = text[pos];
  if (PAIRS.some(([o, c]) => o === a && c === b)) {
    return { changes: [{ from: pos - 1, to: pos + 1, insert: '' }], cursor: pos - 1 };
  }
  return null;
}

/** Tabulation convertie en espaces jusqu'au prochain multiple de 4. */
function tabToSpaces(text, pos, size = 4) {
  const col = pos - lineStart(text, pos);
  const n = size - (col % size);
  return ' '.repeat(n);
}

/** Retour arrière avec « espaces à la place des tabulations » : retire jusqu'au repère précédent. */
function unindentSpaces(text, pos, size = 4) {
  const start = lineStart(text, pos);
  const col = pos - start;
  if (col === 0) return null;
  const n = col % size === 0 ? size : col % size;
  if (col < n) return null;
  if (text.slice(pos - n, pos) !== ' '.repeat(n)) return null;
  return { changes: [{ from: pos - n, to: pos, insert: '' }], cursor: pos - n };
}

/** Début de ligne intelligent : premier caractère non blanc, puis début réel. Retourne la position cible ou null. */
function smartHomeTarget(text, pos) {
  const start = lineStart(text, pos);
  const m = /^[ \t]*/.exec(text.slice(start, lineEnd(text, pos))); // asvs-ignore: RegExp.exec, aucune exécution de code.
  const firstNonBlank = start + m[0].length;
  if (pos === firstNonBlank) return null;
  return firstNonBlank;
}

module.exports = { continueLine, completeChar, deleteMatching, tabToSpaces, unindentSpaces, smartHomeTarget, PAIRS };
