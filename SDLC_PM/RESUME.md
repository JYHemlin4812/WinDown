# RESUME — WinDown

## Identity
- **Project**: WinDown
- **Tier**: minimal
- **Last updated**: 2026-11-17 by Claude Code (Fable 5.2)

## In 30 seconds
Éditeur Markdown avec aperçu en direct pour Windows, recréé à partir de MacDown 0.7.3 (Electron, CodeMirror 6,
markdown-it). Interface français et anglais, cinq volets de préférences, 15 thèmes d'éditeur, MathJax, Mermaid,
Graphviz, exports HTML et PDF. 68 tests Node et 42 vérifications sur la vraie application passent.

## Machine prerequisites
Node 24 et pnpm 12 (observés). `pnpm install`, puis `pnpm start`. Si `electron.exe` manque :
`node node_modules/electron/install.js`. Python n'est utilisé que par le framework SDLC.

## Project layout
`src/main` processus principal ; `src/preload` ponts ; `src/shared` rendu, préférences, thèmes, traductions ;
`src/renderer` fenêtres ; `src/preview` aperçu isolé ; `resources` styles, thèmes, aide ; `scripts` build,
empaquetage, essai de fumée ; `test` tests Node ; `SDLC_PM` pilotage. Détails : `README.md`.
