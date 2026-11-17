'use strict';
/**
 * Assemblage des pages HTML autonomes (export HTML, export PDF, impression).
 * Fonctions pures : les ressources (CSS, scripts) sont fournies par l'appelant.
 */
const { escapeHtml } = require('../shared/render.js');

/** Contenu de <script> : neutralise toute séquence qui fermerait la balise. */
function inlineScript(code) {
  return String(code).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

function inlineStyle(css) {
  return String(css).replace(/<\/(style)/gi, '<\\/$1');
}

/**
 * parts = {
 *   title, lang, baseHref?, styles: string[], body: string,
 *   libraries: string[]   // code JS intégré (Mermaid, Viz…) ou balises déjà formées via {src}
 *   libraryUrls: string[] // <script src>
 *   post: string          // contenu de post.js
 *   postOptions: object   // options passées à WinDownPost.run
 * }
 */
function assembleHtml(parts) {
  const nonce = parts.nonce && /^[A-Za-z0-9_-]{16,}$/.test(parts.nonce) ? parts.nonce : null;
  const na = nonce ? ` nonce="${nonce}"` : '';
  const head = [
    // Premier élément de <head> : la page d'impression n'autorise que les scripts portant ce nonce.
    nonce ? `<meta name="windown-nonce" content="${nonce}">` : '',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">',
    parts.title ? `<title>${escapeHtml(parts.title)}</title>` : '',
    parts.baseHref ? `<base href="${escapeHtml(parts.baseHref)}">` : '',
    ...(parts.styles || []).filter(Boolean).map((css) => `<style>\n${inlineStyle(css)}\n</style>`),
  ]
    .filter(Boolean)
    .join('\n');

  const scripts = [];
  for (const lib of parts.libraries || []) scripts.push(`<script${na}>${inlineScript(lib)}</script>`);
  for (const url of parts.libraryUrls || []) scripts.push(`<script${na} src="${escapeHtml(url)}"></script>`);
  if (parts.post) {
    scripts.push(`<script${na}>${inlineScript(parts.post)}</script>`);
    const opts = JSON.stringify(parts.postOptions || {}).replace(/</g, '\\u003c');
    scripts.push(
      `<script${na}>(function(){var o=${opts};o.isCurrent=function(){return true};` +
        `WinDownPost.run(o,document.body).then(function(){window.__windownReady=true;});})();</script>`
    );
  }

  return `<!DOCTYPE html>\n<html lang="${escapeHtml(parts.lang || 'fr')}">\n<head>\n${head}\n</head>\n<body>\n${parts.body}\n${scripts.join('\n')}\n</body>\n</html>\n`;
}

module.exports = { assembleHtml, inlineScript };
