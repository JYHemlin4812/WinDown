'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { protocol } = require('electron');

/**
 * Deux protocoles servent l'aperçu, qui tourne dans une iframe isolée (sandbox,
 * origine opaque, sans pont vers Node) :
 *
 *  - windown-preview://frame/…  : page de l'aperçu, styles, scripts fournis
 *    (Mermaid, Viz, MathJax) et styles choisis dans les préférences ;
 *  - windown-doc://w<ID>/…      : ressources relatives au document ouvert
 *    (images, médias) — jamais d'autres types de fichiers.
 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

const DOC_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg',
  '.mp4', '.webm', '.ogv', '.mp3', '.wav', '.ogg', '.m4a',
]);

const PREVIEW_CSP = [
  "default-src 'none'",
  // Pas de 'unsafe-inline' : les <script> écrits dans un document Markdown ne s'exécutent pas dans l'aperçu.
  "script-src 'wasm-unsafe-eval' windown-preview:",
  "style-src 'unsafe-inline' windown-preview:",
  'img-src data: blob: https: http: windown-doc: windown-preview:',
  'media-src https: http: windown-doc:',
  'font-src data: windown-preview:',
  "connect-src windown-preview: data: blob:",
  "base-uri windown-doc:",
  "form-action 'none'",
].join('; ');

function registerSchemes() {
  const privileges = { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true };
  protocol.registerSchemesAsPrivileged([
    { scheme: 'windown-preview', privileges },
    { scheme: 'windown-doc', privileges },
  ]);
}

function notFound(msg = 'Not found') {
  return new Response(msg, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function fileResponse(file, extraHeaders = {}) {
  let data;
  try {
    data = fs.readFileSync(file);
  } catch {
    return notFound();
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return new Response(data, {
    status: 200,
    headers: { 'content-type': type, 'access-control-allow-origin': '*', ...extraHeaders },
  });
}

/** Résout `rel` sous `base` en refusant toute sortie du dossier. */
function safeJoin(base, rel) {
  const target = path.resolve(base, rel);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

/** Chemin réseau (UNC `\\hôte\…`) ou de périphérique (`\\?\…`, `\\.\…`). */
function isNetworkPath(p) {
  return /^[\\/]{2}/.test(String(p));
}

/**
 * Une cible locale est autorisée si elle n'est pas un chemin réseau, SAUF si le document
 * lui-même est sur ce partage réseau (choisi par l'utilisateur) et que la cible est dans son dossier.
 * Ouvrir un chemin réseau choisi par le document enverrait le hachage NTLM au serveur visé.
 */
function isAllowedLocalTarget(base, target) {
  if (!isNetworkPath(target)) return true;
  if (!base || !isNetworkPath(base) || /^[\\/]{2}[?.][\\/]/.test(target)) return false;
  const rel = path.relative(base, target);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function registerHandlers({ root, assets, getDocBaseDir, getCustomCss }) {
  const distDir = path.join(root, 'dist');

  protocol.handle('windown-preview', (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/frame.html';

    if (pathname === '/custom.css') {
      const file = getCustomCss();
      return file ? fileResponse(file) : notFound();
    }
    let m = /^\/styles\/(.+)\.css$/.exec(pathname); // asvs-ignore: RegExp.exec, aucune exécution de code.
    if (m) {
      const file = assets.styleFile(m[1]);
      return file ? fileResponse(file) : notFound();
    }
    m = /^\/prism\/(.+)\.css$/.exec(pathname); // asvs-ignore: RegExp.exec, aucune exécution de code.
    if (m) {
      const file = assets.prismFile(m[1]);
      return file ? fileResponse(file) : notFound();
    }
    const file = safeJoin(path.join(distDir, 'preview'), pathname.replace(/^\//, ''));
    if (!file) return notFound();
    const headers = file.endsWith('frame.html') ? { 'content-security-policy': PREVIEW_CSP } : {};
    return fileResponse(file, headers);
  });

  protocol.handle('windown-doc', (request) => {
    const url = new URL(request.url);
    const m = /^w(\d+)$/.exec(url.hostname); // asvs-ignore: RegExp.exec, aucune exécution de code.
    if (!m) return notFound();
    const pathname = decodeURIComponent(url.pathname);
    const base = getDocBaseDir(Number(m[1]));
    if (!base) return notFound();
    let target;
    const abs = /^\/__abs__\/(.+)$/.exec(pathname); // asvs-ignore: RegExp.exec, aucune exécution de code.
    if (abs) {
      target = path.normalize(abs[1]);
      if (!path.isAbsolute(target)) return notFound();
    } else {
      target = path.resolve(base, pathname.replace(/^\/+/, ''));
    }
    // Chemins réseau et de périphérique refusés dans les DEUX branches (le relatif peut résoudre vers « \\hôte\… »).
    if (!isAllowedLocalTarget(base, target)) return new Response('Forbidden', { status: 403 });
    if (!DOC_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      return new Response('Forbidden', { status: 403 });
    }
    return fileResponse(target);
  });
}

module.exports = { registerSchemes, registerHandlers, safeJoin, isNetworkPath, isAllowedLocalTarget, MIME, DOC_EXTENSIONS, PREVIEW_CSP };
