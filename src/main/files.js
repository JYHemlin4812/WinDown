'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Lecture et écriture de documents en conservant l'encodage visible :
 * BOM UTF-8 et style de fin de ligne (CRLF/LF). L'éditeur travaille en `\n`.
 */

class EncodingError extends Error {
  constructor(message) {
    super(message);
    this.code = 'WD_NOT_UTF8';
  }
}

/**
 * Décode un document UTF-8 (avec ou sans BOM). Tout autre encodage (Windows-1252, UTF-16…)
 * est REFUSÉ, comme dans MacDown : l'ouvrir puis le réenregistrer en UTF-8 corromprait
 * silencieusement les caractères accentués.
 */
function decodeDocument(buffer) {
  let bom = false;
  let body = buffer;
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    bom = true;
    body = buffer.subarray(3);
  } else if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) {
    throw new EncodingError('UTF-16');
  }
  let text;
  try {
    // ignoreBOM : un éventuel second BOM reste dans le texte (il serait sinon perdu à l'enregistrement).
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
  } catch {
    throw new EncodingError('not UTF-8');
  }
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  const eol = crlf > lf ? '\r\n' : '\n';
  return { text: text.replace(/\r\n?/g, '\n'), bom, eol };
}

function encodeDocument(text, { bom = false, eol = '\n', ensureNewline = false } = {}) {
  let out = String(text).replace(/\r\n?/g, '\n');
  if (ensureNewline && out.length && !out.endsWith('\n')) out += '\n';
  if (eol === '\r\n') out = out.replace(/\n/g, '\r\n');
  const body = Buffer.from(out, 'utf8');
  return bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
}

function readDocument(file) {
  return decodeDocument(fs.readFileSync(file));
}

/** Écriture atomique : fichier temporaire voisin puis renommage. */
function writeDocument(file, text, opts) {
  const data = encodeDocument(text, opts);
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.wd-tmp`);
  try {
    fs.writeFileSync(tmp, data);
  } catch (err) {
    // Échec AVANT de toucher l'original (disque plein, droits…) : l'original reste intact.
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Seul repli : certains dossiers synchronisés refusent le renommage sur un fichier ouvert.
    // Le contenu complet existe déjà dans le fichier temporaire.
    try {
      fs.copyFileSync(tmp, file);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}

const MARKDOWN_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.txt']);

function isMarkdownFile(file) {
  return MARKDOWN_EXT.has(path.extname(file).toLowerCase());
}

module.exports = { decodeDocument, encodeDocument, readDocument, writeDocument, isMarkdownFile, EncodingError };
