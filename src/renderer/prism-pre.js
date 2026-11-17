'use strict';
// Doit être évalué avant `prismjs` : empêche Prism de colorer la page tout seul
// et de brancher son gestionnaire de messages de worker.
self.Prism = { manual: true, disableWorkerMessageHandler: true };
