'use strict';
/**
 * Coloration syntaxique des blocs de code avec Prism, exécutée dans la fenêtre
 * hôte (le HTML coloré est ensuite envoyé à l'aperçu). Les grammaires sont
 * générées au build (`scripts/build.mjs`, dans l'ordre des dépendances).
 */
require('./prism-pre.js');
const Prism = require('prismjs');
globalThis.Prism = Prism;
require('../../dist/gen/prism-languages.js');

function highlight(code, lang) {
  const grammar = Prism.languages[lang];
  if (!grammar) return null;
  return Prism.highlight(code, grammar, lang);
}

module.exports = { highlight };
