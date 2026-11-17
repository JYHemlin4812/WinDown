# 2 — Architecture (A###)

## Metadata

- **Project** : WinDown
- **Version** : v0.1.0
- **Phase status** : décisions prises avec JYH le 2026-11-17 (Electron, parité complète, fr + en)
- **Author** : Claude Code (Fable 5.2), pour JYH
- **Date** : 2026-11-17

---

## Architecture vision

Application Electron mono-utilisateur, sans serveur ni base de données. Le processus principal gère fenêtres, menus, fichiers, protocoles, exports et préférences. Chaque fenêtre de document (sandbox, pont minimal) contient l'éditeur CodeMirror et rend le Markdown ; le HTML obtenu est posté à une iframe d'aperçu isolée.

---

## ASCII diagram

```
 processus principal (Node)                 fenêtre de document (Chromium, sandbox, pont minimal)
 +----------------------------+   IPC     +-----------------------------------------------+
 | main.js  menus, fenêtres   |<--------->| app.js  CodeMirror, rendu markdown-it, export |
 | files.js  BOM/EOL, atomique|  preload  |   | postMessage (HTML déjà rendu)             |
 | protocols.js windown-*://  |           |   v                                           |
 | export.js  PDF/impression  |           | +-------------------------------------------+ |
 | prefs-store, assets, shell |<----------+-+ iframe sandbox (origine opaque, sans IPC) | |
 +----------------------------+ protocoles| | frame.js + post.js : Mermaid/Viz/MathJax  | |
                                          | +-------------------------------------------+ |
                                          +-----------------------------------------------+
```

---

## Architecture decisions

### A001:E001 — Electron 45 pour l'éditeur et l'aperçu

- **Context** : MacDown est un éditeur plus une WebView ; Node 24 et pnpm sont installés, aucun SDK .NET.
- **Options evaluated** :
  1. Electron (Chromium) — pro : rendu fidèle du CSS, de MathJax et de Mermaid ; con : application lourde (≈ 370 Mo).
  2. Python + pywebview — pro : léger ; con : éditeur et menus moins riches.
  3. WPF/.NET — pro : natif ; con : SDK à installer.
- **Decision** : option 1, confirmée par JYH.
- **Rationale** : parité du rendu avec la WebView de MacDown et outils déjà présents.
- **Consequences** :
  - Positive : un seul moteur pour l'éditeur, l'aperçu, le PDF.
  - Negative : taille de l'application.

### A002:E001 — Rendu Markdown dans la fenêtre hôte, module partagé sans DOM

- **Context** : le rendu sert l'aperçu, l'export, « Copier le HTML » et les tests.
- **Options evaluated** :
  1. Module `src/shared/render.js` appelé par le renderer — pro : pas de blocage du processus principal, testable sous Node.
  2. Rendu dans le processus principal — con : bloque les autres fenêtres.
- **Decision** : option 1.
- **Rationale** : un seul code, testé tel quel.
- **Consequences** :
  - Positive : 25 tests de rendu sans navigateur.

### A003:E010 — Aperçu dans une iframe isolée, protocoles dédiés, CSP stricte

- **Context** : le Markdown peut contenir du HTML et des scripts ; l'aperçu ne doit atteindre ni Node ni le pont IPC.
- **Options evaluated** :
  1. `<iframe sandbox="allow-scripts">` sans `allow-same-origin`, servie par `windown-preview://`, ressources de document par `windown-doc://` (images et médias seulement, chemins réseau refusés), CSP sans `'unsafe-inline'` pour les scripts.
  2. `<webview>` ou `file://` direct avec `webSecurity:false` — con : surface d'attaque plus grande.
- **Decision** : option 1.
- **Rationale** : isolation vérifiable depuis l'application réelle.
- **Consequences** :
  - Positive : isolation testée (aucun Node, aucun pont, parent inaccessible).
  - Negative : les `<script>` écrits dans un document ne s'exécutent pas ; différence assumée avec MacDown.

### A004:E005 — Éditeur CodeMirror 6, thèmes Mou, fonctions d'édition pures

- **Context** : 15 thèmes au format Mou, aides à la saisie propres à MacDown.
- **Options evaluated** :
  1. CodeMirror 6 avec `HighlightStyle` dérivé des thèmes, logique d'édition dans `format.js` et `smart-edit.js` (pures).
  2. Zone de texte simple — con : pas de coloration ni de recherche.
- **Decision** : option 1.
- **Rationale** : éditeur moderne et accessible ; logique testable sans navigateur.
- **Consequences** :
  - Positive : 22 tests d'édition sous Node.

### A005:E002 — markdown-it avec règles propres aux options de hoedown

- **Context** : hoedown (C) n'a pas d'équivalent maintenu en JavaScript.
- **Options evaluated** :
  1. markdown-it plus règles : italique dans un mot (`scanDelims`), `_x_` en `<u>`, `"x"` en `<q>`, `^(x)`, mathématiques protégées, TOC, front-matter.
  2. Hoedown compilé en WebAssembly — con : non maintenu, chaîne de build lourde.
- **Decision** : option 1.
- **Rationale** : parité des options ; écarts CommonMark documentés dans le README.
- **Consequences** :
  - Positive : options testées une à une.
  - Negative : HTML non identique octet pour octet.

### A006:E007 — Préférences en JSON, schéma et bornes, diffusion en direct

- **Context** : mêmes clés et valeurs par défaut que `MPPreferences.m`.
- **Options evaluated** :
  1. Fichier `%APPDATA%\WinDown\preferences.json`, écriture atomique, valeurs invalides ramenées aux défauts, diffusion à toutes les fenêtres.
  2. Registre Windows — con : peu lisible, difficile à sauvegarder.
- **Decision** : option 1.
- **Rationale** : simple, lisible, robuste à la corruption.
- **Consequences** :
  - Positive : fichier corrompu = défauts.

### A007:E012 — esbuild regroupe l'application ; aucun node_modules dans le paquet

- **Context** : démarrage rapide et paquet simple.
- **Options evaluated** :
  1. Bundles dans `dist/`, empaquetage de `src/main`, `src/preload`, `src/shared`, `resources`, `dist`.
  2. Embarquer `node_modules` — con : poids et surface inutiles.
- **Decision** : option 1.
- **Rationale** : tout ce que le renderer utilise est déjà regroupé.
- **Consequences** :
  - Positive : l'exécutable empaqueté passe le même essai de fumée que le mode développement.

### A008:E006 — Raccourcis de MacDown avec Ctrl, sans Ctrl+Alt

- **Context** : Ctrl+Alt = AltGr sur les claviers canadiens-français.
- **Options evaluated** :
  1. Ctrl+Maj pour remplacer chaque combinaison Alt de MacDown ; exports sans raccourci.
  2. Garder Ctrl+Alt — con : conflits avec la saisie de caractères.
- **Decision** : option 1.
- **Rationale** : éviter des raccourcis qui insèrent des caractères.
- **Consequences** :
  - Positive : test automatique d'unicité et d'absence de Alt.

### A009:E003 — Tests : fonctions pures sous Node, comportement réel par essai de fumée

- **Context** : les défauts graves (isolation, perte de données, protocoles) ne se voient que dans l'application.
- **Options evaluated** :
  1. Tests Node pour les fonctions pures plus un essai qui pilote la vraie application en profil jetable.
  2. Tests unitaires seuls — con : ne détectent ni l'isolation ni la perte de données.
- **Decision** : option 1.
- **Rationale** : preuve par comportement observé.
- **Consequences** :
  - Positive : 35 vérifications sur l'application réelle, en développement et empaquetée.

### A010:E003 — Enregistrement atomique, compteur de révisions, fin de ligne et BOM conservés

- **Context** : aucune perte quand on tape pendant une écriture ; compatibilité avec les fichiers existants.
- **Options evaluated** :
  1. Compteur `rev` / `savedRev` côté éditeur, écriture par fichier temporaire puis renommage, BOM et CRLF détectés à l'ouverture.
  2. Drapeau booléen « modifié » — con : perd les frappes faites pendant l'écriture.
- **Decision** : option 1.
- **Rationale** : intégrité des données.
- **Consequences** :
  - Positive : scénarios de fermeture testés (Annuler, Ne pas enregistrer, Enregistrer).

### A011:E008 — Exports par page HTML autonome et fenêtre d'impression dédiée

- **Context** : imprimer la fenêtre principale imprimerait aussi l'éditeur.
- **Options evaluated** :
  1. Page autonome assemblée par `export-html.js`, chargée dans une fenêtre cachée sans Node, puis `printToPDF` après la fin des diagrammes et formules.
  2. `printToPDF` de la fenêtre principale — con : imprime l'éditeur.
- **Decision** : option 1.
- **Rationale** : même HTML pour l'export HTML, le PDF et l'impression.
- **Consequences** :
  - Positive : PDF réel vérifié.

### A012:E009 — Traductions dans des dictionnaires partagés fr et en

- **Context** : changement de langue en direct, vocabulaire des traductions de MacDown.
- **Options evaluated** :
  1. Deux dictionnaires de clés identiques, pluriels « singulier|pluriel », langue du système par défaut.
  2. Fichiers de ressources par langue — con : lourd pour deux langues.
- **Decision** : option 1.
- **Rationale** : test automatique de parité des clés.
- **Consequences** :
  - Positive : aucune clé manquante.

### A013:E011 — Support du terminal par `windown.cmd` et la clé PATH de l'utilisateur

- **Context** : équivalent Windows de l'utilitaire `macdown`.
- **Options evaluated** :
  1. Script `windown.cmd` dans `%LOCALAPPDATA%\WinDown\bin` et ajout au PATH utilisateur par `reg.exe` en conservant `REG_EXPAND_SZ`, sur clic seulement.
  2. `setx` — con : tronque le PATH et le convertit en texte simple.
- **Decision** : option 1.
- **Rationale** : ne casse pas le PATH existant ; rien n'est modifié sans clic.
- **Consequences** :
  - Negative : essai réel sur le PATH à faire par JYH ; seul un registre simulé est testé.

### A014:E004 — Mermaid, Graphviz et MathJax traités après rendu par `post.js`

- **Context** : mêmes traitements dans l'aperçu et dans les pages exportées.
- **Options evaluated** :
  1. Script commun chargé à la demande, cache des diagrammes, annulation si le texte change.
  2. Rendu côté hôte — con : exige le DOM de l'iframe isolée.
- **Decision** : option 1.
- **Rationale** : un seul code pour l'aperçu et le PDF.
- **Consequences** :
  - Positive : pas de scintillement à la frappe.

### A015:E013 — Bibliothèques fournies dans `dist/`, aucun accès réseau

- **Context** : MacDown chargeait MathJax depuis un CDN ; WinDown doit fonctionner hors ligne.
- **Options evaluated** :
  1. Copier Mermaid, Viz.js, MathJax (sortie SVG), Prism et ses thèmes dans `dist/` au build.
  2. CDN — con : inutilisable hors ligne.
- **Decision** : option 1.
- **Rationale** : exigence E013.
- **Consequences** :
  - Positive : aperçu et PDF identiques hors connexion.
  - Negative : MathJax 4 et Mermaid 12 diffèrent des versions de MacDown.
