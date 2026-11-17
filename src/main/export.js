'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { BrowserWindow, session, net } = require('electron');

/**
 * Export PDF et impression : le HTML final (styles et scripts compris) est
 * écrit dans un fichier temporaire, chargé dans une fenêtre cachée sans accès
 * à Node, puis imprimé une fois les diagrammes et les formules terminés
 * (`window.__windownReady`). Imprimer la fenêtre principale imprimerait
 * aussi l'éditeur, d'où cette fenêtre dédiée.
 */

/**
 * Politique de la page d'impression : seuls les scripts portant le nonce de WinDown s'exécutent
 * (et ceux qu'ils créent, 'strict-dynamic') ; les <script> écrits dans le document sont bloqués.
 * Le nonce est lu dans <head>, que le document ne peut pas écrire (son HTML est dans <body>).
 */
function printCsp(nonce) {
  const scripts = nonce ? `'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'` : "'none'";
  return (
    `default-src 'none'; script-src ${scripts}; style-src 'unsafe-inline'; ` +
    "img-src data: blob: https: http: file:; font-src data: file:; connect-src data: blob:; base-uri file:; form-action 'none'"
  );
}

function extractNonce(html) {
  const head = String(html).slice(0, Math.max(0, String(html).search(/<body[\s>]/i)));
  const m = /<meta name="windown-nonce" content="([A-Za-z0-9_-]{16,})">/.exec(head); // asvs-ignore: RegExp.exec, aucune exécution de code.
  return m ? m[1] : null;
}

function withCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${printCsp(extractNonce(html))}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${meta}`) : meta + html;
}

/** executeJavaScript borné : une boucle infinie dans la page ne doit pas bloquer l'export. */
function evalWithTimeout(win, code, ms) {
  return Promise.race([
    win.webContents.executeJavaScript(code),
    new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), ms)),
  ]);
}

async function waitReady(win, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let ready = false;
    try {
      ready = await evalWithTimeout(win, 'window.__windownReady === true', 2000);
    } catch {
      ready = false;
    }
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** Compteur des accès réseau refusés par la session d'impression (contrôlé par l'essai de fumée). */
const stats = { blockedNetworkFiles: 0 };
let printSession = null;

/**
 * Session réservée aux fenêtres d'impression : son gestionnaire `file:` refuse tout hôte
 * (file://serveur/… = chemin UNC = connexion SMB et fuite du hachage NTLM). Ce blocage ne dépend
 * ni du HTML du document ni de webRequest : toute sous-ressource file: de la page passe par lui.
 */
function getPrintSession() {
  if (printSession) return printSession;
  printSession = session.fromPartition('windown-print');
  printSession.protocol.handle('file', (request) => {
    let host = 'invalide';
    try {
      host = new URL(request.url).host;
    } catch {
      /* URL illisible : refusée */
    }
    if (host !== '') {
      stats.blockedNetworkFiles += 1;
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(request.url, { bypassCustomProtocolHandlers: true });
  });
  printSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  return printSession;
}

async function withPrintWindow(html, tempDir, fn) {
  const file = path.join(tempDir || os.tmpdir(), `windown-${randomUUID()}.html`);
  fs.writeFileSync(file, withCsp(html), 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      session: getPrintSession(),
    },
  });
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.on('will-redirect', (e) => e.preventDefault());
    await win.loadFile(file);
    await waitReady(win);
    return await fn(win);
  } finally {
    if (!win.isDestroyed()) win.destroy();
    fs.rmSync(file, { force: true });
  }
}

/** @returns {Promise<Buffer>} */
function renderPdf(html, { tempDir, pageSize = 'Letter' } = {}) {
  return withPrintWindow(html, tempDir, (win) =>
    win.webContents.printToPDF({ printBackground: true, pageSize, margins: { marginType: 'default' } })
  );
}

/** Ouvre la boîte d'impression du système. */
function printHtml(html, { tempDir } = {}) {
  return withPrintWindow(
    html,
    tempDir,
    (win) =>
      new Promise((resolve) => {
        win.webContents.print({ silent: false, printBackground: true }, (success, reason) =>
          resolve({ success, reason })
        );
      })
  );
}

module.exports = { renderPdf, printHtml, withCsp, printCsp, extractNonce, stats };
