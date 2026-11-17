'use strict';

/**
 * Chemin absolu Windows (`C:\dossier\a.png`), éventuellement déjà encodé par
 * markdown-it (`C:%5Cdossier%5Ca.png`). Retourne le chemin avec des « / », ou null.
 * Un chemin réseau (`\\serveur\partage`) n'est volontairement pas reconnu.
 */
function absoluteWindowsPath(url) {
  let raw = String(url);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* conserver tel quel */
  }
  return /^[a-zA-Z]:[\\/]/.test(raw) ? raw.replace(/\\/g, '/') : null;
}

/** URL `file:///` d'un chemin absolu Windows ; toute autre URL est rendue telle quelle. */
function toFileUrl(url) {
  const p = absoluteWindowsPath(url);
  return p ? `file:///${encodeURI(p)}` : url;
}

/** URL du protocole de document (aperçu) pour un chemin absolu Windows ; sinon l'URL telle quelle. */
function toDocUrl(url, docBase) {
  const p = absoluteWindowsPath(url);
  return p ? `${docBase}__abs__/${encodeURIComponent(p)}` : url;
}

module.exports = { absoluteWindowsPath, toFileUrl, toDocUrl };
