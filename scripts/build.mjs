// Construit dist/ : bundles du renderer (esbuild), page d'aperçu, bibliothèques fournies
// (Mermaid, Viz, MathJax), thèmes Prism et grammaires Prism dans l'ordre des dépendances.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const rel = (...p) => path.join(root, ...p);

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/** Chemin d'un fichier d'un paquet de premier niveau (liens pnpm), sans passer par `exports`. */
function resolvePackageFile(pkg, file) {
  const p = path.join(root, 'node_modules', ...pkg.split('/'), file);
  if (!fs.existsSync(p)) throw new Error(`Fichier introuvable : ${p}`);
  return p;
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'gen'), { recursive: true });

/* 1. Grammaires Prism, triées par dépendances (require / optional / modify). */
{
  const componentsFile = resolvePackageFile('prismjs', 'components.json');
  const components = JSON.parse(fs.readFileSync(componentsFile, 'utf8')).languages;
  const names = Object.keys(components).filter((k) => k !== 'meta');
  const order = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name) || !components[name]) return;
    seen.add(name);
    const deps = [].concat(components[name].require || []);
    for (const d of deps) visit(d);
    // `modify` : doit venir après la langue modifiée ; `optional` : idem, si présente.
    for (const d of [].concat(components[name].modify || [], components[name].optional || [])) visit(d);
    order.push(name);
  };
  names.forEach(visit);
  const prismDir = path.dirname(componentsFile);
  const lines = order
    .filter((n) => fs.existsSync(path.join(prismDir, 'components', `prism-${n}.js`)))
    .map((n) => `try { require(${JSON.stringify(`prismjs/components/prism-${n}.js`)}); } catch (e) { /* grammaire optionnelle */ }`);
  fs.writeFileSync(path.join(dist, 'gen', 'prism-languages.js'), `${lines.join('\n')}\n`);
  console.log(`Prism : ${lines.length} grammaires`);
}

/* 2. Renderer. */
const common = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome140',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [rel('node_modules')],
};
await build({ ...common, entryPoints: [rel('src/renderer/app.js')], outfile: path.join(dist, 'renderer', 'app.js') });
await build({ ...common, entryPoints: [rel('src/renderer/prefs.js')], outfile: path.join(dist, 'renderer', 'prefs.js') });
for (const f of ['index.html', 'app.css', 'prefs.html', 'prefs.css']) {
  copy(rel('src/renderer', f), path.join(dist, 'renderer', f));
}

/* 3. Aperçu isolé. */
for (const f of ['frame.html', 'frame.js', 'post.js']) copy(rel('src/preview', f), path.join(dist, 'preview', f));
const vendorDir = path.join(dist, 'preview', 'vendor');
copy(resolvePackageFile('mermaid', 'dist/mermaid.min.js'), path.join(vendorDir, 'mermaid.min.js'));
copy(resolvePackageFile('@viz-js/viz', 'dist/viz-global.js'), path.join(vendorDir, 'viz-global.js'));
copy(resolvePackageFile('mathjax', 'tex-mml-svg.js'), path.join(vendorDir, 'tex-mml-svg.js'));

/* 4. CSS complémentaire de l'aperçu (numéros de ligne, accessoires de bloc de code, diagrammes). */
{
  const lineNumbers = fs.readFileSync(resolvePackageFile('prismjs', 'plugins/line-numbers/prism-line-numbers.css'), 'utf8');
  const accessory = `
pre[class*='language-'] { position: relative; }
pre[class*='language-'][data-information]::before,
pre[class*='language-'][data-language]::before {
  color: black; background-color: #CFCFCF; display: inline-block; position: absolute; top: 0; right: 0;
  font-size: 0.9em; border-radius: 0 0 0 5px; padding: 0 0.5em; text-shadow: none;
}
pre[class*='language-'][data-information]::before { content: attr(data-information); }
pre[class*='language-'][data-language]:not([data-information])::before { content: attr(data-language); }
:not(pre) > code { white-space: normal; overflow-wrap: anywhere; }
.mermaid-diagram, .graphviz-diagram { text-align: center; margin: 1em 0; overflow-x: auto; }
.mermaid-diagram svg, .graphviz-diagram svg { max-width: 100%; height: auto; }
pre.diagram-error { outline: 1px solid #c0392b; }
ul.contains-task-list, li.task-list-item { list-style-type: none; }
li.task-list-item > input.task-list-item-checkbox { margin: 0 0.5em 0 -1.3em; }
sup.footnote-ref a { text-decoration: none; }
section.footnotes { font-size: 0.9em; }
`;
  fs.writeFileSync(path.join(dist, 'preview', 'extra.css'), `${lineNumbers}\n${accessory}`);
}

/* 5. Thèmes Prism (liste « Thème » du volet Compilation). */
{
  const themesDir = path.dirname(resolvePackageFile('prismjs', 'themes/prism.css'));
  for (const f of fs.readdirSync(themesDir)) {
    if (f.endsWith('.css') && !f.endsWith('.min.css')) copy(path.join(themesDir, f), path.join(dist, 'vendor', 'prism-themes', f));
  }
}

const size = (p) => (fs.statSync(p).size / 1024).toFixed(0);
console.log(`Renderer : app.js ${size(path.join(dist, 'renderer/app.js'))} Ko, prefs.js ${size(path.join(dist, 'renderer/prefs.js'))} Ko`);
console.log('Build terminé :', dist);
