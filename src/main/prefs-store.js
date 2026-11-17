'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, sanitize } = require('../shared/prefs.js');

/**
 * Stockage JSON des préférences, écriture atomique (fichier temporaire puis renommage).
 */
class PrefsStore {
  constructor(file) {
    this.file = file;
    this.values = sanitize(this._read());
    this._timer = null;
    this._listeners = new Set();
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  all() {
    return { ...this.values, recentFiles: [...this.values.recentFiles] };
  }

  get(key) {
    return this.values[key];
  }

  /** Modifie une ou plusieurs clés ; ignore les clés inconnues. Retourne les clés réellement changées. */
  set(patch) {
    const changed = [];
    const next = sanitize({ ...this.values, ...patch });
    for (const key of Object.keys(DEFAULTS)) {
      if (!(key in patch)) continue;
      if (JSON.stringify(next[key]) !== JSON.stringify(this.values[key])) {
        this.values[key] = next[key];
        changed.push(key);
      }
    }
    if (changed.length) {
      this._scheduleWrite();
      for (const fn of this._listeners) fn(changed, this.all());
    }
    return changed;
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  addRecent(filePath, max = 10) {
    const list = [filePath, ...this.values.recentFiles.filter((p) => p !== filePath)].slice(0, max);
    this.set({ recentFiles: list });
  }

  _scheduleWrite() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.values, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('Écriture des préférences impossible :', err.message);
    }
  }
}

module.exports = { PrefsStore };
