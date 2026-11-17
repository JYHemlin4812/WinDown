# WinDown

Éditeur Markdown avec aperçu en direct pour Windows, recréé à partir de **MacDown 0.7.3** (macOS) :
même disposition (éditeur d'un côté, aperçu de l'autre), mêmes options de rendu, mêmes thèmes,
mêmes raccourcis (⌘ devient Ctrl), mêmes valeurs par défaut. Interface en français et en anglais.

Base : Electron 45 + CodeMirror 6 (éditeur) + markdown-it (rendu). Aucune connexion internet requise,
y compris pour les formules (MathJax), les diagrammes (Mermaid, Graphviz) et la coloration du code (Prism).

## Démarrer

```powershell
cd Dev\_actifs\WinDown
pnpm install          # une fois (pnpm-workspace.yaml autorise les scripts d'Electron et d'esbuild ; pnpm 10 ou plus récent)
pnpm start            # construit dist/ puis ouvre WinDown
pnpm start -- chemin\vers\fichier.md
pnpm test             # 68 tests unitaires (Node)
pnpm smoke            # essai de la vraie application, profil jetable, captures dans .smoke/
pnpm package          # application autonome : out/WinDown-win32-x64/WinDown.exe (≈ 370 Mo)
```

`pnpm package -- --zip` crée en plus l'archive `.zip`. Si le binaire d'Electron manque après
`pnpm install` : `node node_modules/electron/install.js`.

## Ce qui est repris de MacDown

| Domaine | Contenu |
|---|---|
| Fenêtre | éditeur + aperçu, séparateur déplaçable (1:3, 1:1, 3:1), éditeur à gauche ou à droite, volets masquables, barre d'outils, compteur de mots (mots, caractères, sans espaces), défilement synchronisé, plein écran, une fenêtre par document |
| Fichiers | nouveau, ouvrir (glisser-déposer aussi), récents, enregistrer, enregistrer sous, revenir à la version enregistrée, exporter en HTML (styles et coloration facultatifs) et en PDF, imprimer, copier le HTML ; BOM UTF-8 et fins de ligne (CRLF/LF) conservés |
| Markdown | tableaux, blocs de code, notes de bas de page, italique dans un mot, barré, souligné `_x_`, citation `"x"`, surlignage `==x==`, exposant `^(x)`, liens automatiques, Smartypants |
| Compilation | 6 feuilles CSS d'aperçu (+ CSS personnalisé), coloration syntaxique (≈ 300 langages, 8 thèmes, numéros de ligne, nom du langage ou texte libre), MathJax (`\\( \\)`, `\\[ \\]`, `$$ $$`, `$ $` en option), Mermaid, Graphviz, listes de tâches, front-matter Jekyll, `[TOC]`, sauts de ligne littéraux, taille de l'aperçu liée à l'éditeur |
| Éditeur | 15 thèmes (format Mou `.style`, dossier `%APPDATA%\WinDown\Themes` pour les vôtres), police, interligne, marges, largeur limitée, défilement au-delà de la fin, continuation des listes et citations, numérotation automatique, caractères appariés, tabulations en espaces, début de ligne intelligent, puce de liste, fin de fichier |
| Menu Format | gras, emphase, souligné, barré, surligné, code, commentaire, titres 1-6, listes, citation, décalage, lien, image |
| Préférences | 5 volets : Général, Markdown, Compilation, Éditeur, Terminal (commande `windown`) |

## Raccourcis (extraits)

Les combinaisons Ctrl+Alt de MacDown sont évitées (Ctrl+Alt = AltGr sur les claviers canadiens-français).

| Action | Raccourci |
|---|---|
| Gras / emphase / souligné / barré / surligné | Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+- / Ctrl+= |
| Titres 1-6, paragraphe | Ctrl+1 … Ctrl+6, Ctrl+0 |
| Code, commentaire | Ctrl+K, Ctrl+/ |
| Lien, image | Ctrl+Maj+K, Ctrl+Maj+I |
| Liste numérotée, à puces, citation | Ctrl+Maj+O, Ctrl+Maj+U, Ctrl+Maj+B |
| Décaler à droite / à gauche | Ctrl+], Ctrl+[ |
| Générer l'aperçu (mode manuel) | Ctrl+R |
| Masquer l'aperçu / l'éditeur / la barre | Ctrl+Maj+H / Ctrl+Maj+E / Ctrl+Maj+T |
| Mise en page 1:1 | Ctrl+Maj+0 |
| Copier le HTML | Ctrl+Maj+C |
| Préférences, aide | Ctrl+, , F1 |

Exporter en HTML ou en PDF n'a pas de raccourci (menu Fichier > Exporter).

## Écarts connus avec MacDown

- **Non repris** : mise à jour automatique (Sparkle) et versions bêta, AppleScript, mise en page d'impression,
  services macOS, menu Plug-ins, substitutions de texte macOS, interfaces dans les 13 autres langues.
- **Moteur Markdown** : markdown-it (CommonMark) remplace hoedown. Le HTML produit n'est pas identique octet
  pour octet (par exemple, une liste peut interrompre un paragraphe sans ligne vide ; balisage des notes de
  bas de page). Les options propres à MacDown (italique dans un mot, `_x_` souligné, `"x"` en citation,
  `^(x)`) sont réimplémentées et couvertes par des tests.
- **MathJax 4 et Mermaid 12** (versions récentes) remplacent MathJax 2.7 et Mermaid d'origine : la syntaxe des
  diagrammes est celle de Mermaid 12. Les formules fonctionnent hors connexion.
- **Aperçu isolé** : le HTML brut d'un document s'affiche, mais ses balises `<script>` ne s'exécutent pas.
- **Chemins d'images** : relatifs au dossier du document, ou absolus avec des `/` (`C:/images/a.png`). Avec des
  antislashs, Markdown consomme les séquences `\_` et `\.` du chemin ; les chemins réseau (`\\serveur\…`) sont refusés.
- **Raccourcis** : voir ci-dessus (pas de Ctrl+Alt).
- **Encodage** : seuls les fichiers UTF-8 (avec ou sans BOM) s'ouvrent ; les autres (Windows-1252, UTF-16) sont
  refusés avec un message, comme dans MacDown, pour ne jamais abîmer leurs accents à l'enregistrement.
- **Fichier modifié ailleurs** : à l'enregistrement, WinDown demande avant d'écraser une version modifiée par une
  autre application (OneDrive, autre éditeur). Pas de surveillance en continu ni d'enregistrement automatique
  (MacDown s'appuyait sur les versions de macOS).
- **Écarts mineurs connus** : identifiants de titres en « slugs » (MacDown : `toc_0`, `toc_1`…), blocs de code
  sans enveloppe `<div>`, cases à cocher désactivées et `[X]` majuscule accepté, `macdown` lisant l'entrée
  standard non repris.
- **Ressources Mou** : les thèmes « Mou … », « Clearness » et la feuille « GitHub2 » ne sont pas dans le dépôt
  public (voir `THIRD-PARTY.md`). Un clone propre propose 9 thèmes d'éditeur et 3 feuilles CSS, et utilise
  `GitHub.css` par défaut ; mettez vos propres `.style` et `.css` dans `%APPDATA%\WinDown\Themes` et `Styles`.

## Organisation du code

```
src/main/       processus principal : fenêtres, menus, fichiers, protocoles, export, préférences, terminal
src/preload/    ponts minimaux entre l'interface et le système (contextBridge)
src/shared/     modules sans DOM ni disque : rendu Markdown, préférences, thèmes Mou, traductions
src/renderer/   fenêtre de document (CodeMirror, barre d'outils, export) et fenêtre de préférences
src/preview/    page d'aperçu isolée (iframe sandbox) et traitements Mermaid/Graphviz/MathJax
resources/      styles CSS, thèmes d'éditeur, aide (fr, en), icône
scripts/        build (esbuild), empaquetage, essai de fumée, génération de l'icône
test/           tests Node (rendu, édition, modules)
SDLC_PM/        dossier de pilotage SDLC allégé (exigences, architecture, tâches, preuves)
```

### Isolation de l'aperçu

Le Markdown peut contenir du HTML. Il est rendu dans la fenêtre hôte en une chaîne HTML, puis posté à une
`<iframe sandbox="allow-scripts">` d'origine opaque, servie par le protocole `windown-preview://` avec une
politique CSP sans `'unsafe-inline'` pour les scripts. Cette iframe n'a ni Node, ni pont IPC, ni accès au
parent. Les images relatives passent par `windown-doc://` qui ne sert que des types d'images et de médias.
Les liens `http(s)` et `mailto` s'ouvrent dans le navigateur ; un lien relatif vers un `.md` ouvre le document.

### Données de l'utilisateur

`%APPDATA%\WinDown\preferences.json`, `Styles\` et `Themes\` (vos CSS et thèmes), et, si vous cliquez sur
« Installer » dans le volet Terminal, `%LOCALAPPDATA%\WinDown\bin\windown.cmd` plus une entrée dans le PATH
de votre compte. Rien n'est modifié sans ce clic.

## Limites à connaître

- L'exécutable n'est **pas signé** : Windows SmartScreen peut afficher un avertissement au premier lancement.
- Pas d'installeur (`.exe`/`.msi`) ni d'association automatique des fichiers `.md` : à ajouter si besoin.
- Testé sur Windows 11 avec Electron 45 ; aucun essai sur Windows 10, sur écran à très haute densité de
  pixels ni avec une disposition de clavier autre que celle de cette machine.
- Le bouton « Installer » du volet Terminal n'a été essayé que contre un registre simulé (tests unitaires),
  jamais sur le vrai PATH de l'utilisateur.
