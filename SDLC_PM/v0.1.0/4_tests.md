# Tests

Convention : T### = numéro de la P### testée. Commandes : `pnpm test` (Node, 68 tests au dernier passage : 25 rendu, 22 édition, 16 modules) ; `pnpm smoke` (vraie application, profil jetable, 42 vérifications) ; `node scripts/smoke.mjs --packaged` (même essai sur `out/WinDown-win32-x64/WinDown.exe`).

### T001:P001 — Rendu Markdown et options
**Status**: ✅
**Level**: unitaires (`test/render.test.js`, 25 tests) + essai de fumée.
**RED**: characterization.
Chaque option du volet Markdown change la sortie ; Mermaid, Graphviz, math, TOC, front-matter, coloration, numéros de ligne, accessoires ; chemins d'images Windows ; l'aide de MacDown rendue avec toutes les options. Fumée : coloration, TOC, tâches, math, Mermaid, Graphviz dans l'aperçu réel.

### T002:P002 — Préférences
**Status**: ✅
**Level**: unitaires (`test/modules.test.js`) + fumée.
**RED**: characterization.
Défauts de `MPPreferences.m`, bornes et types, écriture atomique, relecture, fichier corrompu ; fumée : préférences sur disque.

### T003:P003 — Fichiers
**Status**: ✅
**Level**: unitaires + fumée.
**RED**: characterization.
BOM, CRLF/LF, CR seul, UTF-16, écriture sans résidu ; fumée : BOM et CRLF conservés à l'enregistrement.

### T004:P004 — Thèmes et styles
**Status**: ✅
**Level**: unitaires + captures.
**RED**: characterization.
15 thèmes Mou lus, valeurs de Tomorrow+, couleurs invalides ignorées ; captures de l'éditeur et de l'aperçu (GitHub2).

### T005:P005 — Éditeur et aides à la saisie
**Status**: ✅
**Level**: unitaires (`test/editing.test.js`, 22 tests) + fumée avec de vraies touches.
**RED**: observed : une attente erronée sur la complétion devant une ponctuation (conforme à MacDown, test corrigé).
Gras, emphase, titres, listes, citation, décalage, lien, image, casse ; Entrée en liste, numérotée, tâche, citation ; caractères appariés ; Tab, Retour arrière, Début.

### T006:P006 — Aperçu isolé et protocoles
**Status**: ✅
**Level**: fumée sur l'application réelle.
**RED**: observed : message « ready » perdu avant l'écoute de la fenêtre (aperçu vide) ; débordement horizontal par un `<code>` long ; chemin absolu d'image encodé.
Aucun Node ni pont dans l'aperçu, protocoles 200/403/403/404, images relatives et absolues, lien relatif `.md`, ancres, défilement synchronisé, pas de débordement horizontal.

### T007:P007 — Fenêtre de document
**Status**: ✅
**Level**: fumée + captures.
**RED**: characterization.
Mise en page, frappe → aperçu, état « modifié », zoom du texte.

### T008:P008 — Processus principal : fermeture et enregistrement
**Status**: ✅
**Level**: fumée (boîtes de dialogue remplacées par des réponses programmées).
**RED**: characterization.
Fermeture + Annuler, Ne pas enregistrer, Enregistrer ; Enregistrer sous (sans titre, annulé) ; fenêtre vierge réutilisée ; récents dans le menu.

### T009:P009 — Menus et raccourcis
**Status**: ✅
**Level**: unitaires (gabarit de menu en fr et en) + démarrage de l'application.
**RED**: characterization.
Raccourcis uniques, aucun Ctrl+Alt, aucun libellé non traduit ; Electron accepte tous les accélérateurs.

### T010:P010 — Fenêtre de préférences
**Status**: ✅
**Level**: fumée + captures `03-prefs-*.png`.
**RED**: characterization.
Cinq volets avec leurs contrôles ; changement de langue en direct.

### T011:P011 — Exports
**Status**: ✅
**Level**: unitaires (assemblage) + fumée.
**RED**: characterization.
HTML autonome, PDF réel (`%PDF`, plus de 20 Ko), page d'impression contrôlée visuellement (`04-page-impression.png`).

### T012:P012 — Traductions
**Status**: ✅
**Level**: unitaires.
**RED**: characterization.
Mêmes clés en fr et en en, pluriels, langue du système.

### T013:P013 — Support du terminal
**Status**: ✅
**Level**: unitaires avec registre simulé.
**RED**: characterization.
Ajout et retrait du PATH sans doublon, `REG_EXPAND_SZ` conservé, `windown.cmd`. Essai réel sur le PATH : non fait (action de JYH).

### T014:P014 — Build et empaquetage
**Status**: ✅
**Level**: intégration : `node scripts/smoke.mjs --packaged`.
**RED**: observed : `ignore` de l'empaqueteur excluait `src/` (point d'entrée introuvable), corrigé.
L'exécutable empaqueté passe 35/35.

### T015:P015 — Essai de fumée
**Status**: ✅
**Level**: l'essai lui-même, exécuté en développement et empaqueté.
**RED**: observed : 11/17 vérifications au premier passage (aperçu vide), puis 35/35.
`.smoke/<date>/result.json`.

### T016:P016 — Documentation et licences
**Status**: ✅
**Level**: relecture ; chiffres du README vérifiés (8 thèmes Prism, 6 CSS, 15 thèmes, 68 tests).
**RED**: characterization.
Les écarts avec MacDown et les ressources Mou sont signalés.

### T017:P017 — Revue qualité indépendante
**Status**: ✅
**Level**: relecture indépendante (nestor-qualite).
**RED**: characterization.
Résultat et correctifs consignés dans `../STATE.md`.

### T018:P018 — Post-traitements
**Status**: ✅
**Level**: fumée.
**RED**: characterization.
Mermaid et Graphviz rendus en SVG, deux formules MathJax sans erreur ; PDF avec les mêmes éléments.

### T019:P019 — Bibliothèques hors ligne
**Status**: ✅
**Level**: build + fumée.
**RED**: characterization.
Le build copie les bibliothèques ; l'aperçu les charge par `windown-preview://` sans réseau.

## Non couvert

- Boîte d'impression du système, sélecteur de polices système, Windows 10, écran très haute densité, autre disposition de clavier, lecteur d'écran, gros fichiers.
