/* WinDown : traitements après rendu (diagrammes Mermaid, Graphviz, formules MathJax).
 * Même code dans l'aperçu isolé et dans les pages exportées (HTML et PDF).
 * Navigateur seulement, sans dépendance : les bibliothèques sont chargées à la demande
 * depuis `opts.urls`, ou déjà présentes (page exportée avec scripts intégrés).
 */
(function () {
  'use strict';

  var scriptPromises = {};
  var mermaidCache = new Map();
  var vizCache = new Map();
  var counter = 0;
  var mermaidReady = false;

  function loadScript(src) {
    if (!scriptPromises[src]) {
      scriptPromises[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { reject(new Error('Chargement impossible : ' + src)); };
        document.head.appendChild(s);
      });
    }
    return scriptPromises[src];
  }

  function ensure(globalName, url) {
    if (window[globalName]) return Promise.resolve();
    if (!url) return Promise.reject(new Error(globalName + ' indisponible'));
    return loadScript(url);
  }

  function markError(pre, err) {
    pre.classList.add('diagram-error');
    pre.title = String((err && err.message) || err).slice(0, 300);
  }

  async function runMermaid(opts, root) {
    var codes = Array.prototype.slice.call(root.querySelectorAll('pre > code.language-mermaid'));
    if (!codes.length) return;
    await ensure('mermaid', opts.urls && opts.urls.mermaid);
    if (!mermaidReady) {
      window.mermaid.initialize({ startOnLoad: false, theme: 'forest', securityLevel: 'strict' });
      mermaidReady = true;
    }
    for (var i = 0; i < codes.length; i++) {
      if (opts.isCurrent && !opts.isCurrent()) return;
      var code = codes[i];
      var pre = code.parentElement;
      var src = code.textContent;
      var holder = document.createElement('div');
      holder.className = 'mermaid-diagram';
      holder.setAttribute('data-line', pre.getAttribute('data-line') || '');
      if (mermaidCache.has(src)) {
        holder.innerHTML = mermaidCache.get(src);
        pre.replaceWith(holder);
        continue;
      }
      try {
        var out = await window.mermaid.render('wd-mermaid-' + ++counter, src);
        if (opts.isCurrent && !opts.isCurrent()) return;
        mermaidCache.set(src, out.svg);
        holder.innerHTML = out.svg;
        pre.replaceWith(holder);
      } catch (err) {
        markError(pre, err);
        var stray = document.getElementById('dwd-mermaid-' + counter);
        if (stray) stray.remove();
      }
    }
  }

  async function runGraphviz(opts, root) {
    var codes = Array.prototype.slice.call(root.querySelectorAll('pre > code.language-dot'));
    if (!codes.length) return;
    await ensure('Viz', opts.urls && opts.urls.viz);
    var viz = await window.Viz.instance();
    for (var i = 0; i < codes.length; i++) {
      if (opts.isCurrent && !opts.isCurrent()) return;
      var code = codes[i];
      var pre = code.parentElement;
      var src = code.textContent;
      var holder = document.createElement('div');
      holder.className = 'graphviz-diagram';
      holder.setAttribute('data-line', pre.getAttribute('data-line') || '');
      if (vizCache.has(src)) {
        holder.innerHTML = vizCache.get(src);
        pre.replaceWith(holder);
        continue;
      }
      try {
        var svg = viz.renderSVGElement(src);
        vizCache.set(src, svg.outerHTML);
        holder.appendChild(svg);
        pre.replaceWith(holder);
      } catch (err) {
        markError(pre, err);
      }
    }
  }

  async function runMath(opts, root) {
    if (!opts.math) return;
    if (!window.MathJax || !window.MathJax.typesetPromise) {
      window.MathJax = {
        startup: { typeset: false },
        tex: {
          inlineMath: opts.mathDollar ? [['\\(', '\\)'], ['$', '$']] : [['\\(', '\\)']],
          displayMath: [['$$', '$$'], ['\\[', '\\]']],
          processEscapes: false
        },
        svg: { fontCache: 'none' },
        options: { enableMenu: false }
      };
      if (!(opts.urls && opts.urls.mathjax)) throw new Error('MathJax indisponible');
      await loadScript(opts.urls.mathjax);
    }
    await window.MathJax.startup.promise;
    if (window.MathJax.typesetClear) window.MathJax.typesetClear([root]);
    await window.MathJax.typesetPromise([root]);
  }

  /**
   * opts : { math, mathDollar, urls:{mermaid, viz, mathjax}, isCurrent():boolean }
   * Retourne une promesse résolue quand tout est terminé (les erreurs d'un traitement n'arrêtent pas les autres).
   */
  async function run(opts, root) {
    root = root || document.body;
    var tasks = [runMermaid, runGraphviz, runMath];
    for (var i = 0; i < tasks.length; i++) {
      try {
        await tasks[i](opts, root);
      } catch (err) {
        if (window.console) console.warn('[WinDown]', err && err.message);
      }
    }
  }

  window.WinDownPost = { run: run };
})();
