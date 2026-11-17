'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAssets } = require('../src/main/assets.js');

// Simule un clone du dépôt public : sans les ressources issues de Mou.
test('Clone public (sans ressources Mou) : repli sur GitHub.css et Tomorrow+, rien ne casse', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-clean-'));
  const src = path.join(__dirname, '..', 'resources');
  const MOU = /^(Mou .*\.style|Clearness.*\.css|GitHub2\.css)$/;
  for (const dir of ['Styles', 'Themes']) {
    fs.mkdirSync(path.join(root, 'resources', dir), { recursive: true });
    for (const f of fs.readdirSync(path.join(src, dir))) {
      if (!MOU.test(f)) fs.copyFileSync(path.join(src, dir, f), path.join(root, 'resources', dir, f));
    }
  }
  const a = createAssets({ root, userDir: path.join(root, 'user') });
  const styles = a.listStyles().map((s) => s.name);
  assert.deepEqual(styles.sort(), ['GitHub', 'Solarized (Dark)', 'Solarized (Light)']);
  assert.ok(a.listEditorThemes().length >= 9);
  assert.match(a.styleFile('GitHub2'), /GitHub\.css$/, 'GitHub2 absent : repli sur GitHub');
  assert.match(a.styleFile('Solarized (Dark)'), /Solarized \(Dark\)\.css$/);
  const theme = a.readEditorTheme('Mou Night');
  assert.equal(theme.name, 'Tomorrow+', 'thème absent : repli sur Tomorrow+');
  assert.equal(theme.dark, true);
});

test('Le dépôt public ne contient aucun fichier Mou suivi par git (règles .gitignore)', () => {
  const ignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  for (const rule of ['resources/Themes/Mou *.style', 'resources/Styles/Clearness.css', 'resources/Styles/Clearness Dark.css', 'resources/Styles/GitHub2.css']) {
    assert.ok(ignore.includes(rule), rule);
  }
});
