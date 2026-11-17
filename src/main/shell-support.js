'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

/**
 * « Support du terminal » (volet Terminal des préférences) : équivalent Windows
 * de l'utilitaire `macdown`. Installer écrit `windown.cmd` dans
 * `%LOCALAPPDATA%\WinDown\bin` et ajoute ce dossier au PATH de l'utilisateur
 * (clé HKCU\Environment, valeur conservée en REG_EXPAND_SZ). Rien n'est modifié
 * tant que l'utilisateur ne clique pas sur « Installer ».
 */

function splitPath(value) {
  return String(value || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

const norm = (p) => p.replace(/[\\/]+$/, '').toLowerCase();

function pathContains(value, dir) {
  return splitPath(value).some((e) => norm(e) === norm(dir));
}

function addToPath(value, dir) {
  return pathContains(value, dir) ? value : [...splitPath(value), dir].join(';');
}

function removeFromPath(value, dir) {
  return splitPath(value)
    .filter((e) => norm(e) !== norm(dir))
    .join(';');
}

function parseRegQuery(stdout) {
  const m = /^\s*Path\s+(REG_\w+)\s+(.*)$/im.exec(String(stdout)); // asvs-ignore: RegExp.exec, aucune exécution de code.
  return m ? m[2].trim() : '';
}

function defaultRun(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }));
      else resolve({ stdout: String(stdout) });
    });
  });
}

const BROADCAST_SCRIPT = [
  "Add-Type -Namespace WD -Name Native -MemberDefinition '[DllImport(\"user32.dll\", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, string l, uint f, uint t, out UIntPtr r);'",
  '$r=[UIntPtr]::Zero',
  "[void][WD.Native]::SendMessageTimeout([IntPtr]0xffff,0x1A,[UIntPtr]::Zero,'Environment',2,5000,[ref]$r)",
].join(';');

function createShellSupport({ localAppData, exePath, appPath, isPackaged, run = defaultRun }) {
  const binDir = path.join(localAppData, 'WinDown', 'bin');
  const cmdFile = path.join(binDir, 'windown.cmd');

  function cmdContent() {
    const launch = isPackaged ? `"${exePath}"` : `"${exePath}" "${appPath}"`;
    return `@echo off\r\nrem Lanceur WinDown (créé par les préférences > Terminal)\r\nstart "" ${launch} %*\r\n`;
  }

  async function readUserPath() {
    try {
      const { stdout } = await run('reg.exe', ['query', 'HKCU\\Environment', '/v', 'Path']);
      return parseRegQuery(stdout);
    } catch {
      return '';
    }
  }

  async function writeUserPath(value) {
    await run('reg.exe', ['add', 'HKCU\\Environment', '/v', 'Path', '/t', 'REG_EXPAND_SZ', '/d', value, '/f']);
    try {
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', BROADCAST_SCRIPT]);
    } catch {
      /* la diffusion est un confort : les nouveaux terminaux lisent la clé de toute façon */
    }
  }

  async function status() {
    const installed = fs.existsSync(cmdFile);
    const onPath = pathContains(await readUserPath(), binDir);
    return { installed: installed && onPath, fileExists: installed, onPath, location: cmdFile, binDir };
  }

  async function install() {
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(cmdFile, cmdContent(), 'utf8');
    const current = await readUserPath();
    if (!pathContains(current, binDir)) await writeUserPath(addToPath(current, binDir));
    return status();
  }

  async function uninstall() {
    fs.rmSync(cmdFile, { force: true });
    const current = await readUserPath();
    if (pathContains(current, binDir)) await writeUserPath(removeFromPath(current, binDir));
    return status();
  }

  return { status, install, uninstall, binDir, cmdFile, cmdContent };
}

module.exports = { createShellSupport, addToPath, removeFromPath, pathContains, parseRegQuery };
