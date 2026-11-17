# HANDOFF — WinDown

## Identity
- **Project**: WinDown
- **Current version**: v0.1.0
- **Last updated**: 2026-11-17 by Claude Code (Fable 5.2)
- **Tier**: minimal

## Where things stand
Recréation de MacDown 0.7.3 pour Windows (Electron 45, CodeMirror 6, markdown-it). Fonctions de
MacDown reprises : fenêtre éditeur + aperçu, cinq volets de préférences, 15 thèmes d'éditeur, 6 CSS,
coloration (≈ 300 langages), MathJax, Mermaid, Graphviz, exports HTML/PDF, interface fr/en.
Preuves : 68 tests Node ; essai de fumée de la vraie application 42/42, en développement et sur
`out/WinDown-win32-x64/WinDown.exe`. Revue qualité indépendante : VALIDÉE après correctifs (STATE.md).
Aucun commit, aucune publication.

## Next 3 actions
1. JYH : lancer l'application (`pnpm start`, ou `out\WinDown-win32-x64\WinDown.exe`) et l'essayer avec un vrai document ; noter ce qui diffère de MacDown.
2. JYH : volet Terminal > Installer (modifie le PATH de son compte) — jamais essayé pour de vrai, seulement avec un registre simulé.
3. Avant toute diffusion publique, de l'avenir des thèmes et CSS issus de Mou (`THIRD-PARTY.md`).

## Known pitfalls
- `pnpm install` bloque les scripts de build : `package.json` autorise `electron` et `esbuild`. Si `electron.exe` manque : `node node_modules/electron/install.js`.
- Dans un chemin d'image Markdown, `\_` et `\.` sont des échappements : utiliser des `/`.
- Ne pas utiliser Ctrl+Alt comme raccourci (AltGr sur claviers canadiens-français).
- L'aperçu n'exécute pas les `<script>` du document (CSP) : choix de sécurité, pas un bogue.
- `pnpm smoke` ouvre de vraies fenêtres pendant 1 à 2 minutes ; ne pas toucher à la souris pendant l'essai.

## Pending decisions
- Installeur et association des `.md` : non faits.
- Signature de l'exécutable : non faite (SmartScreen).
- Redistribution des thèmes Mou : à régler avant toute diffusion publique.

## Technical metadata
- **Current SDLC phase**: v0.1.0 livrée localement, revue qualité VALIDÉE (Mathilde)
- **Last P### done**: P017
- **Next P### to run**: aucune ; essais par JYH puis décision de commit
- **Last AQ Gate exit code**: AQ PASS (release v0.1.0, 2026-11-17)
- **Last clean commit**: aucun (pas de commit)
