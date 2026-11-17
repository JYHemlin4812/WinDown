// Lance l'application réelle en profil jetable et vérifie son comportement (src/main/smoke.js).
// Sortie : .smoke/<horodatage>/ (captures PNG, export.pdf, export.html, result.json).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = require(path.join(root, 'node_modules', 'electron'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(root, '.smoke', stamp);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'windown-profile-'));
fs.mkdirSync(out, { recursive: true });

// Document de départ : l'aide française, dans un dossier à part (pour les images relatives).
const docDir = path.join(out, 'doc');
fs.mkdirSync(docDir, { recursive: true });
const doc = path.join(docDir, 'aide.md');
fs.copyFileSync(path.join(root, 'resources', 'help.fr.md'), doc);

const env = { ...process.env, WINDOWN_SMOKE_OUT: out, WINDOWN_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
// --packaged : essaie l'exécutable produit par `pnpm package` au lieu d'Electron en développement.
const packaged = process.argv.includes('--packaged');
const exe = packaged ? path.join(root, 'out', 'WinDown-win32-x64', 'WinDown.exe') : electron;
if (!fs.existsSync(exe)) throw new Error(`Exécutable introuvable : ${exe}`);
const r = spawnSync(exe, packaged ? [doc] : ['.', doc], { cwd: root, env, stdio: 'inherit', timeout: 240000 });

const resultFile = path.join(out, 'result.json');
fs.rmSync(profile, { recursive: true, force: true });
if (!fs.existsSync(resultFile)) {
  console.error(`Pas de result.json (code ${r.status}, signal ${r.signal}).`);
  process.exit(2);
}
const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
const ko = result.checks.filter((c) => !c.ok);
console.log(`\n${result.checks.length - ko.length}/${result.checks.length} vérifications réussies. Sortie : ${out}`);
if (ko.length) {
  for (const c of ko) console.log(`  ÉCHEC : ${c.name} — ${c.detail}`);
  process.exit(1);
}
