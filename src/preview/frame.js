/* WinDown : page d'aperçu (iframe isolée, origine opaque, sans accès à Node).
 * Reçoit le HTML déjà rendu par la fenêtre hôte via postMessage et l'affiche.
 */
(function () {
  'use strict';

  var VENDOR = 'windown-preview://frame/vendor/';
  var URLS = {
    mermaid: VENDOR + 'mermaid.min.js',
    viz: VENDOR + 'viz-global.js',
    mathjax: VENDOR + 'tex-mml-svg.js'
  };

  var scroller = document.scrollingElement || document.documentElement;
  var generation = 0;
  var lineItems = [];
  var configuredDollar = null;
  var lastLine = 0;
  var lastAtBottom = false;

  function $(id) { return document.getElementById(id); }
  function setHref(el, href) {
    if (!href) { el.disabled = true; return; }
    el.disabled = false;
    if (el.getAttribute('href') !== href) el.setAttribute('href', href);
  }

  function indexLines() {
    var els = document.body.querySelectorAll('[data-line]');
    lineItems = [];
    for (var i = 0; i < els.length; i++) {
      var n = parseInt(els[i].getAttribute('data-line'), 10);
      if (!isNaN(n)) lineItems.push({ line: n, el: els[i] });
    }
    lineItems.sort(function (a, b) { return a.line - b.line; });
  }

  function topOf(el) {
    return el.getBoundingClientRect().top + scroller.scrollTop;
  }

  function scrollToLine(line, atBottom) {
    lastLine = line;
    lastAtBottom = !!atBottom;
    if (atBottom) {
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    if (!lineItems.length) { scroller.scrollTop = 0; return; }
    var lo = 0, hi = lineItems.length - 1, idx = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lineItems[mid].line <= line) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    var ya, la, yb, lb;
    if (idx < 0) {
      ya = 0; la = 0;
      yb = topOf(lineItems[0].el); lb = lineItems[0].line;
    } else {
      ya = topOf(lineItems[idx].el); la = lineItems[idx].line;
      var next = idx + 1;
      while (next < lineItems.length && lineItems[next].line === la) next++;
      if (next < lineItems.length) { yb = topOf(lineItems[next].el); lb = lineItems[next].line; }
      else { yb = scroller.scrollHeight; lb = la + Math.max(1, Math.round((yb - ya) / 20)); }
    }
    var t = lb > la ? Math.min(1, Math.max(0, (line - la) / (lb - la))) : 0;
    scroller.scrollTop = ya + t * (yb - ya);
  }

  function showAnchor(id) {
    var el = document.getElementById(id) || document.getElementsByName(id)[0];
    if (el) el.scrollIntoView();
  }

  function update(m) {
    var gen = ++generation;
    $('base').setAttribute('href', m.base);
    setHref($('css-doc'), m.docCss);
    setHref($('css-prism'), m.prismCss);
    document.body.style.zoom = m.zoom && m.zoom !== 1 ? String(m.zoom) : '';

    var features = m.features || {};
    if (features.math && configuredDollar !== null && configuredDollar !== !!features.mathDollar && window.MathJax) {
      // Les délimiteurs MathJax ne se changent pas à chaud : on recharge la page, l'hôte renverra le contenu.
      location.reload();
      return;
    }
    if (features.math) configuredDollar = !!features.mathDollar;

    var y = scroller.scrollTop;
    document.body.innerHTML = m.html;
    scroller.scrollTop = y;
    indexLines();
    if (m.syncScroll) scrollToLine(m.line, m.atBottom); else scroller.scrollTop = y;

    window.WinDownPost.run(
      { math: !!features.math, mathDollar: !!features.mathDollar, urls: URLS, isCurrent: function () { return gen === generation; } },
      document.body
    ).then(function () {
      if (gen !== generation) return;
      indexLines();
      if (m.syncScroll) scrollToLine(lastLine, lastAtBottom);
      parent.postMessage({ type: 'rendered', version: m.version }, '*');
    });
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== parent) return;
    var m = ev.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'update') update(m);
    else if (m.type === 'scroll') scrollToLine(m.line, m.atBottom);
    else if (m.type === 'hello') parent.postMessage({ type: 'ready' }, '*');
  });

  document.addEventListener('click', function (ev) {
    var node = ev.target;
    while (node && node.nodeType === 1 && node.tagName !== 'A') node = node.parentElement;
    if (!node || node.tagName !== 'A') return;
    var raw = node.getAttribute('href');
    if (raw === null) return;
    ev.preventDefault();
    if (raw.charAt(0) === '#') {
      var id = raw.slice(1);
      try { id = decodeURIComponent(id); } catch (e) { /* identifiant brut */ }
      showAnchor(id);
      return;
    }
    parent.postMessage({ type: 'link', href: raw }, '*');
  });

  // Aucune navigation par glisser-déposer ou envoi de formulaire dans l'aperçu.
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) { e.preventDefault(); });
  document.addEventListener('submit', function (e) { e.preventDefault(); });

  parent.postMessage({ type: 'ready' }, '*');
})();
