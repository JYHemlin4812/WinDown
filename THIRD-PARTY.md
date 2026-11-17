# Composants tiers et attributions

WinDown reprend le comportement de **MacDown 0.7.3** (© 2014 Tzu-ping Chung, licence MIT,
<https://github.com/MacDownApp/macdown>) : valeurs par défaut, structure des menus et raccourcis,
options de rendu, aide. Aucun code Objective-C de MacDown n'est repris : WinDown est réécrit en
JavaScript. Le texte de l'aide (`resources/help.en.md`) est adapté de `help.md` de MacDown.

## Ressources copiées depuis MacDown 0.7.3 — **à vérifier avant toute diffusion publique**

| Fichiers | Origine déclarée | Remarque |
|---|---|---|
| `resources/Themes/Mou *.style`, `resources/Styles/Clearness*.css`, `resources/Styles/GitHub2.css` | Extraits de **Mou** « avec l'aimable autorisation de Chen Luo » (README de MacDown) | Conditions de redistribution non précisées. **Ces fichiers ne sont PAS publiés dans le dépôt public** (ignorés par `.gitignore`) ; ils ne subsistent que dans la copie locale de JYH. Sans eux, WinDown utilise `GitHub.css` et le thème Tomorrow+. |
| `resources/Themes/Solarized*.style`, `resources/Themes/Tomorrow*.style`, `resources/Themes/Writer*.style`, `resources/Styles/Solarized*.css`, `resources/Styles/GitHub.css` | Fournis avec MacDown (MIT) ; palettes Solarized (MIT) et Tomorrow (MIT) | Licence d'origine de `Writer*` et `GitHub.css` non précisée dans MacDown. |

`Styles/GitHub-2017.css` fait 0 octet dans l'archive `MacDown.app.zip` examinée : il n'est pas repris.

## Bibliothèques (regroupées dans `dist/` au build)

| Composant | Licence |
|---|---|
| markdown-it, markdown-it-footnote, markdown-it-mark | MIT |
| markdown-it-task-lists | ISC |
| CodeMirror 6 (`@codemirror/*`, `@lezer/*`) | MIT |
| Prism (`prismjs`) et ses thèmes | MIT |
| Mermaid | MIT |
| Viz.js (`@viz-js/viz`, Graphviz compilé en WebAssembly) | MIT ; Graphviz : Eclipse Public License 1.0 |
| MathJax 4 | Apache-2.0 |
| Electron (Chromium, Node.js) | MIT, plus les licences de Chromium (voir `LICENSES.chromium.html` livré avec Electron) |

Pour l'exécutable empaqueté, les fichiers `LICENSE` d'Electron et `LICENSES.chromium.html` sont copiés par
l'outil d'empaquetage à côté de `WinDown.exe`.
