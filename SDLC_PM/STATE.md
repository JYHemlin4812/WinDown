# État SDLC — 2026-11-17

## v0.1.0 — première livraison (SDLC allégé)

| Tâche | État | Preuve |
|---|---|---|
| P001 | ✅ | `render.test.js` 25/25 dont l'aide de MacDown rendue avec toutes les options ; fumée : coloration, TOC, tâches, math, Mermaid, Graphviz |
| P002 | ✅ | `modules.test.js` : défauts de `MPPreferences.m`, bornes, écriture atomique, fichier corrompu ; fumée : préférences sur disque |
| P003 | ✅ | `modules.test.js` ; fumée : BOM + CRLF conservés à l'enregistrement |
| P004 | ✅ | 15 thèmes Mou lus (`modules.test.js`) ; captures `01-aide-defaut.png`, `02-fonctions.png` |
| P005 | ✅ | `editing.test.js` 22/22 ; fumée : vraies touches (Entrée en liste, numérotée, citation) et commandes de format dans CodeMirror |
| P006 | ✅ | fumée : aucun Node ni pont dans l'aperçu, protocoles 200/403/403/404, images relatives et absolues, lien `.md` |
| P007 | ✅ | fumée : défilement synchronisé, pas de débordement horizontal, zoom ; captures |
| P008 | ✅ | fumée : fermeture Annuler / Ne pas enregistrer / Enregistrer, Enregistrer sous, fenêtre vierge réutilisée |
| P009 | ✅ | `modules.test.js` (raccourcis uniques, sans Ctrl+Alt, fr et en) ; l'application démarre avec tous les accélérateurs |
| P010 | ✅ | fumée : 5 volets (captures `03-prefs-*.png`), changement de langue en direct |
| P011 | ✅ | fumée : HTML autonome, PDF réel (`%PDF`), page d'impression vue (`04-page-impression.png`) |
| P012 | ✅ | `modules.test.js` : mêmes clés fr / en, pluriels |
| P013 | ✅ (simulé) | `modules.test.js` : registre simulé. **Essai réel sur le PATH : non fait, action de JYH** |
| P014 | ✅ | `pnpm package` → `out/WinDown-win32-x64/WinDown.exe` ; fumée sur l'exécutable : 35/35 |
| P015 | ✅ | `scripts/smoke.mjs` : 35/35 en développement et empaqueté |
| P016 | ✅ | `README.md`, `LICENSE`, `THIRD-PARTY.md` |
| P017 | ✅ | Revue de Mathilde (2026-11-17) : VETO sur 2 bloquants, correctifs, contre-revue, puis **VALIDÉ, veto entièrement levé** (détail ci-dessous) |
| P018 | ✅ | fumée : Mermaid, Graphviz, MathJax rendus ; page d'impression |
| P019 | ✅ | build : bibliothèques copiées ; aperçu hors réseau |

## Revue qualité (Mathilde, 2026-11-17) : VETO, puis correctifs

| Constat | Gravité | Correctif | Preuve |
|---|---|---|---|
| 3.1 Chemin UNC encodé (`%5C%5Chôte…`) via la branche relative de `windown-doc` : fuite NTLM | bloquant | `isAllowedLocalTarget` dans les deux branches et aux liens ; `file://hôte` annulé par la session | `modules.test.js` ; fumée 403 / bloqué |
| 3.2 Fichiers non UTF-8 corrompus à l'enregistrement | bloquant | décodage UTF-8 strict, refus avec message | unitaires ; fumée cp1252 refusé, octets intacts |
| 4.1 Repli d'écriture destructeur | important | repli seulement si le renommage échoue | unitaire : original intact |
| 4.2 Fenêtre vierge réutilisée avant d'être prête | important | `rendererReady` ; `st.text` à jour | fumée : deux cas |
| 4.3 Modification externe écrasée | important | mtime + confirmation | fumée : Annuler n'écrase pas |
| 4.4 Scripts du document exécutés à l'impression ; attente sans délai | important | CSP par nonce + strict-dynamic, navigation bloquée, délai borné | unitaire + fumée |
| 5.1 Liens `file:///` et `C:/x.md` | mineur | `fileURLToPath`, chemin de lecteur | relecture |
| 6.2, 6.4, 6.7, 6.9 | parité | TOC `class="toc"`, liens www, compteur sur le texte rendu, sans titre vide non modifié | unitaires |
| 5.2, 6.1, 6.3, 6.5, 6.6, 6.8, 6.10 | mineur / parité | non corrigés, listés dans le README | — |

| Réserve : `file://hôte` à l'export PDF non prouvé | réserve | session d'impression dédiée, `protocol.handle('file')` refuse tout hôte | fumée : vrai PDF, 3 images réseau refusées |
| BOM doublé perdu (`TextDecoder`) | mineur | `ignoreBOM: true` | relecture |

Après correctifs : `pnpm test` 68/68 ; fumée 42/42 en développement et sur l'exécutable empaqueté ; gate AQ PASS. Verdict final de Mathilde : **VALIDÉ** (reste 5.2, assumé).

Aucun commit, aucune publication, aucune modification du PATH ou du registre de l'utilisateur.
