// Télécharge le binaire d'Electron s'il manque (pnpm peut sauter le script d'installation d'Electron).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = path.join(root, 'node_modules', 'electron');
if (!fs.existsSync(path.join(electronDir, 'dist', 'electron.exe')) && fs.existsSync(path.join(electronDir, 'install.js'))) {
  console.log("Binaire d'Electron absent : téléchargement…");
  const r = spawnSync(process.execPath, [path.join(electronDir, 'install.js')], { stdio: 'inherit', cwd: electronDir });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
