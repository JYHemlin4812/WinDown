# Conception

## Metadata

- **Project** : WinDown
- **Version** : v0.1.0
- **Phase status** : tâches P001 à P016, P018 et P019 terminées ; P017 (revue qualité) en cours
- **Author** : Claude Code (Fable 5.2), pour JYH
- **Date** : 2026-11-17
- **Input** : `1_elicitation.md` (E001 à E013), `2_architecture.md` (A001 à A015)

Les vagues se déduisent de **Depends on**. Statuts et preuves : `../STATE.md` et `4_tests.md`.

## Wave 1

#### P001:A005 — Moteur de rendu Markdown et options de MacDown
- **wave**: 1
- **Depends on**: none
- **Target files**: src/shared/render.js
- **Status**: ✅
- **Size**: L
Options de hoedown réimplémentées sur markdown-it ; mathématiques protégées ; TOC ; front-matter ; ids de titres ; repères de ligne ; blocs de code colorés par une fonction injectée.

#### P002:A006 — Préférences : défauts, schéma, stockage atomique
- **wave**: 1
- **Depends on**: none
- **Target files**: src/shared/prefs.js, src/main/prefs-store.js
- **Status**: ✅
- **Size**: M
Valeurs par défaut de `MPPreferences.m`, bornes, énumérations, écriture par fichier temporaire.

#### P003:A010 — Lecture et écriture de fichiers
- **wave**: 1
- **Depends on**: none
- **Target files**: src/main/files.js
- **Status**: ✅
- **Size**: S
BOM UTF-8, fin de ligne dominante, UTF-16 lu puis réécrit en UTF-8, écriture atomique avec repli.

#### P004:A004 — Thèmes d'éditeur Mou et styles CSS
- **wave**: 1
- **Depends on**: none
- **Target files**: src/shared/mou-theme.js, src/main/assets.js, resources/Themes, resources/Styles
- **Status**: ✅
- **Size**: M
Lecture du format `.style`, listes fournies et utilisateur, résolution par nom.

#### P012:A012 — Traductions fr et en, aide
- **wave**: 1
- **Depends on**: none
- **Target files**: src/shared/i18n.js, resources/help.fr.md, resources/help.en.md
- **Status**: ✅
- **Size**: M
Dictionnaires de clés identiques, pluriels, résolution de la langue.

#### P019:A015 — Bibliothèques fournies hors ligne
- **wave**: 1
- **Depends on**: none
- **Target files**: scripts/build.mjs
- **Status**: ✅
- **Size**: S
Copie de Mermaid, Viz.js, MathJax (SVG), thèmes Prism ; grammaires Prism triées par dépendances ; CSS complémentaire.

## Wave 2

#### P005:A004 — Éditeur CodeMirror, coloration, aides à la saisie
- **wave**: 2
- **Depends on**: P002, P004
- **Target files**: src/renderer/editor.js, src/renderer/format.js, src/renderer/smart-edit.js
- **Status**: ✅
- **Size**: L
Thème dérivé du format Mou, continuation de listes et citations, caractères appariés, tabulations, début de ligne, commandes de format, recherche.

#### P006:A003 — Aperçu isolé et protocoles
- **wave**: 2
- **Depends on**: P001
- **Target files**: src/preview/frame.html, src/preview/frame.js, src/main/protocols.js, src/renderer/preview-host.js
- **Status**: ✅
- **Size**: L
Iframe sandbox, handshake par postMessage, protocoles `windown-preview` et `windown-doc`, CSP, refus des chemins réseau et des fichiers non médias.

#### P009:A008 — Menus et raccourcis
- **wave**: 2
- **Depends on**: P012
- **Target files**: src/main/menu.js
- **Status**: ✅
- **Size**: M
Structure de `MainMenu.xib`, Ctrl à la place de ⌘, aucun Ctrl+Alt.

#### P013:A013 — Support du terminal
- **wave**: 2
- **Depends on**: P002
- **Target files**: src/main/shell-support.js
- **Status**: ✅
- **Size**: M
`windown.cmd`, PATH utilisateur en `REG_EXPAND_SZ`, installation et retrait sans doublon.

## Wave 3

#### P018:A014 — Post-traitements Mermaid, Graphviz et MathJax
- **wave**: 3
- **Depends on**: P006, P019
- **Target files**: src/preview/post.js
- **Status**: ✅
- **Size**: M
Chargement à la demande, cache des diagrammes, annulation si le texte change.

#### P007:A002 — Fenêtre de document
- **wave**: 3
- **Depends on**: P001, P005, P006
- **Target files**: src/renderer/app.js, src/renderer/toolbar.js, src/renderer/app.css, src/renderer/index.html
- **Status**: ✅
- **Size**: L
Mise en page, séparateur, barre d'outils, compteur de mots, défilement synchronisé, glisser-déposer, zoom.

#### P008:A010 — Processus principal
- **wave**: 3
- **Depends on**: P002, P003, P009
- **Target files**: src/main/main.js, src/preload/document.js
- **Status**: ✅
- **Size**: L
Fenêtres, fermeture sûre, ouverture, récents, instance unique, liens, IPC contrôlé.

#### P010:A006 — Fenêtre de préférences
- **wave**: 3
- **Depends on**: P002, P004, P013
- **Target files**: src/renderer/prefs.html, src/renderer/prefs.js, src/renderer/prefs.css, src/preload/prefs.js
- **Status**: ✅
- **Size**: M
Cinq volets, changement de langue en direct.

## Wave 4

#### P011:A011 — Exports HTML, PDF, impression, copier le HTML
- **wave**: 4
- **Depends on**: P001, P006, P018
- **Target files**: src/renderer/export-html.js, src/main/export.js
- **Status**: ✅
- **Size**: M
Page autonome, fenêtre d'impression dédiée, attente de la fin des diagrammes et formules.

## Wave 5

#### P014:A007 — Build, empaquetage, icône
- **wave**: 5
- **Depends on**: P007, P008, P010, P011, P019
- **Target files**: scripts/build.mjs, scripts/package.mjs, scripts/make-icon.mjs, package.json
- **Status**: ✅
- **Size**: M
Bundles esbuild, `WinDown.exe` sans `node_modules`, icône générée.

## Wave 6

#### P015:A009 — Essai de fumée de la vraie application
- **wave**: 6
- **Depends on**: P014
- **Target files**: src/main/smoke.js, scripts/smoke.mjs
- **Status**: ✅
- **Size**: L
Pilotage de la vraie fenêtre en profil jetable ; captures ; mode `--packaged`.

#### P016:A007 — Documentation, licences, attributions
- **wave**: 6
- **Depends on**: P014
- **Target files**: README.md, LICENSE, THIRD-PARTY.md
- **Status**: ✅
- **Size**: S
Écarts avec MacDown, limites, redistribution des ressources Mou.

## Wave 7

#### P017:A009 — Revue qualité indépendante et correctifs
- **wave**: 7
- **Depends on**: P015, P016
- **Target files**: SDLC_PM/STATE.md
- **Status**: ✅
- **Size**: M
Relecture indépendante (nestor-qualite) ; correctifs ; nouvelle exécution des tests et de l'essai de fumée.
