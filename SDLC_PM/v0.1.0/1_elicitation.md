# Elicitation

## Metadata

- **Project** : WinDown (recréation de MacDown 0.7.3 pour Windows)
- **Version** : v0.1.0
- **Author** : Claude Code (Fable 5.2), pour JYH
- **Date** : 2026-11-17
- **Niveau SDLC** : allégé, choix de JYH le 2026-11-17

## Context

Demande de JYH, le 2026-11-17 : examiner `Downloads\MacDown.app.zip` (éditeur Markdown macOS) et le recréer pour Windows, dans `Dev/_actifs/`. Décisions de JYH : Electron ; nom et dossier `WinDown` ; parité fonctionnelle complète ; interface français + anglais ; SDLC allégé ; aucun commit sans son approbation.

Méthode d'inventaire : lecture de `Info.plist`, des ressources de l'archive (styles, thèmes, Prism, chaînes `fr.lproj`) et du code source amont v0.7.3 (`MPPreferences.m`, `MPRenderer.m`, `MPDocument.m`, `MainMenu.xib`) pour les valeurs par défaut, les options de rendu, les menus et les raccourcis. L'exécutable macOS n'a pas été lancé (impossible sous Windows) : le comportement vient du code source.

## Actors and use cases

| Actor | Role | Main use cases |
|---|---|---|
| JYH | Utilisateur unique, poste Windows 11, clavier canadien-français | Écrire et relire des documents Markdown avec aperçu ; exporter en HTML ou PDF ; régler l'éditeur |

## Non-goals (écarts assumés, listés dans le README)

Mise à jour automatique Sparkle et versions bêta, AppleScript, mise en page d'impression, services macOS, menu Plug-ins, interfaces dans les 13 autres langues de MacDown.

## Requirements

### E001 — MUST — Éditeur et aperçu en direct côte à côte
Given un document ouvert, When je tape, Then l'aperçu se met à jour ; When l'éditeur défile, Then l'aperçu suit.

### E002 — MUST — Rendu Markdown avec les options de MacDown
Given chaque option du volet Markdown, When je l'active ou la désactive, Then la sortie change comme dans hoedown (italique dans un mot, `_x_`, `"x"`, `^(x)`, `==x==`, `~~x~~`, liens automatiques, Smartypants, notes, tableaux, blocs de code).

### E003 — MUST — Ouvrir, enregistrer, fermer sans perte de données
Given un fichier avec BOM et CRLF, When je l'enregistre, Then BOM et CRLF sont conservés ; Given des modifications, When je ferme, Then on me propose Enregistrer, Ne pas enregistrer ou Annuler.

### E004 — MUST — Options de compilation
Given le volet Compilation, When j'active coloration, numéros de ligne, accessoire, MathJax, Mermaid, Graphviz, tâches, front-matter, table des matières ou sauts de ligne, Then l'aperçu les applique.

### E005 — MUST — Éditeur configurable et assisté
Given 15 thèmes Mou, police, marges, interligne et largeur, When je saisis, Then listes, citations, caractères appariés, tabulations et début de ligne se comportent comme dans MacDown.

### E006 — MUST — Menus, raccourcis et barre d'outils de MacDown
Given le menu Format, When j'utilise un raccourci ou un bouton, Then la mise en forme s'applique à la sélection ; les raccourcis n'utilisent pas Ctrl+Alt (AltGr).

### E007 — MUST — Cinq volets de préférences avec les valeurs par défaut de MacDown
Given une première installation, Then les valeurs par défaut sont celles de `MPPreferences.m` ; When je change un réglage, Then il s'applique en direct à toutes les fenêtres.

### E008 — MUST — Exports
Given un document, When j'exporte, Then HTML autonome, PDF réel, impression et « Copier le HTML » fonctionnent.

### E009 — MUST — Interface en français et en anglais
Given la langue du système ou le réglage, Then menus, dialogues et préférences sont traduits, avec changement en direct.

### E010 — MUST — Aperçu isolé
Given un document contenant du HTML brut ou des scripts, Then l'aperçu n'a accès ni à Node ni au pont IPC ; les chemins réseau et les fichiers qui ne sont pas des médias sont refusés.

### E011 — SHOULD — Support du terminal
Given le volet Terminal, When j'installe, Then `windown.cmd` existe et son dossier est dans le PATH de l'utilisateur ; When je désinstalle, Then les deux sont retirés.

### E012 — SHOULD — Application autonome
Given `pnpm package`, Then `WinDown.exe` démarre sans Node installé.

### E013 — MUST — Fonctionnement hors connexion
Given aucun accès réseau, Then formules, diagrammes et coloration fonctionnent.

## Open questions and risks

1. Ressources **Mou** (thèmes et CSS) reprises de MacDown : conditions de redistribution non précisées ; à régler avant toute diffusion publique (`THIRD-PARTY.md`).
2. Exécutable non signé (SmartScreen).
3. Essais limités à un poste Windows 11, un clavier, une densité d'affichage.
