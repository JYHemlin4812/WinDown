// Produit une application Windows autonome : out/WinDown-win32-x64/WinDown.exe (+ archive .zip).
// Seuls le code du processus principal, les ressources et dist/ sont embarqués (aucun node_modules :
// le renderer et les bibliothèques sont déjà regroupés dans dist/ par scripts/build.mjs).
import { packager } from '@electron/packager';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const KEEP = /^\/(package\.json|src$|src\/(main|preload|shared)(\/|$)|resources(\/|$)|dist(\/|$))/;

const out = path.join(root, 'out');
const appPaths = await packager({
  dir: root,
  out,
  overwrite: true,
  name: 'WinDown',
  platform: 'win32',
  arch: 'x64',
  asar: true,
  prune: false,
  icon: path.join(root, 'resources', 'icon.ico'),
  appVersion: pkg.version,
  appCopyright: 'WinDown Version Windows JYH 2026 — inspiré de MacDown © 2014 Tzu-ping Chung (MIT)',
  win32metadata: { FileDescription: 'WinDown — Version Windows JYH 2026', ProductName: 'WinDown', OriginalFilename: 'WinDown.exe', CompanyName: 'JYH' },
  ignore: (p) => p !== '' && !KEEP.test(p),
  quiet: false,
});
const dir = appPaths[0];
// Licences : celle du projet, celle de MacDown et les mentions des composants repris.
for (const f of ['LICENSE', 'THIRD-PARTY.md']) fs.copyFileSync(path.join(root, f), path.join(dir, f));
fs.copyFileSync(path.join(root, 'resources', 'LICENSE-MacDown.txt'), path.join(dir, 'LICENSE-MacDown.txt'));
const exe = path.join(dir, 'WinDown.exe');
console.log('Application :', exe, `${(fs.statSync(exe).size / 1048576).toFixed(0)} Mo`);

// Archive .zip seulement sur demande : `pnpm package -- --zip` (≈ 370 Mo : c'est la taille d'Electron).
if (!process.argv.includes('--zip')) process.exit(0);
const zip = path.join(out, `WinDown-${pkg.version}-win32-x64.zip`);
fs.rmSync(zip, { force: true });
// bsdtar (livré avec Windows 10+) écrit directement un .zip ; Compress-Archive n'est pas toujours disponible.
const r = spawnSync('tar.exe', ['-a', '-c', '-f', zip, '-C', out, path.basename(dir)], { stdio: 'inherit' });
if (r.status === 0) console.log('Archive :', zip, `${(fs.statSync(zip).size / 1048576).toFixed(0)} Mo`);
else console.log('Archive .zip non créée (tar indisponible) ; le dossier est utilisable tel quel.');
