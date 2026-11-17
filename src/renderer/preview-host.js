'use strict';
/**
 * Pont entre la fenêtre hôte et l'iframe d'aperçu isolée. Les messages ne
 * transitent que par postMessage ; seuls ceux venant de cette iframe sont lus.
 */
class PreviewHost {
  constructor(iframe, { onLink, onRendered }) {
    this.iframe = iframe;
    this.ready = false;
    this.pending = null; // dernière mise à jour en attente du chargement
    this.onLink = onLink;
    this.onRendered = onRendered;
    this.lastUpdate = null;
    window.addEventListener('message', (ev) => this._onMessage(ev));
    // L'iframe peut avoir envoyé « ready » avant que cette fenêtre n'écoute : on la sonde jusqu'à sa réponse.
    this._ping = setInterval(() => {
      if (this.ready) clearInterval(this._ping);
      else if (this.iframe.contentWindow) this._post({ type: 'hello' });
    }, 150);
    iframe.addEventListener('load', () => {
      this.ready = false; // rechargée : elle renverra « ready »
      clearInterval(this._ping);
      this._ping = setInterval(() => {
        if (this.ready) clearInterval(this._ping);
        else this._post({ type: 'hello' });
      }, 150);
    });
  }

  _onMessage(ev) {
    if (ev.source !== this.iframe.contentWindow) return;
    const m = ev.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ready') {
      this.ready = true;
      const toSend = this.pending || this.lastUpdate;
      this.pending = null;
      if (toSend) this._post(toSend);
    } else if (m.type === 'link' && typeof m.href === 'string') {
      this.onLink(m.href);
    } else if (m.type === 'rendered') {
      if (this.onRendered) this.onRendered(m.version);
    }
  }

  _post(msg) {
    this.iframe.contentWindow.postMessage(msg, '*');
  }

  /** Envoie une mise à jour complète (mémorisée pour être rejouée après un rechargement de l'iframe). */
  update(msg) {
    this.lastUpdate = msg;
    if (this.ready) this._post(msg);
    else this.pending = msg;
  }

  scroll(line, atBottom) {
    if (this.lastUpdate) {
      this.lastUpdate.line = line;
      this.lastUpdate.atBottom = atBottom;
    }
    if (this.ready) this._post({ type: 'scroll', line, atBottom });
  }
}

module.exports = { PreviewHost };
