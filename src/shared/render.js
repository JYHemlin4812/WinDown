'use strict';
/**
 * Rendu Markdown de WinDown.
 *
 * Reproduit les options de rendu de MacDown 0.7.3 (hoedown) au-dessus de
 * markdown-it : italique dans un mot, soulignement `_x_`, citation `"x"`,
 * exposant `^(x)`, surlignage `==x==`, notes, listes de tâches, table des
 * matières `[TOC]`, front-matter Jekyll, mathématiques TeX protégées du
 * Markdown, coloration syntaxique via une fonction `highlight` injectée.
 *
 * Module sans accès au DOM ni au disque : il tourne tel quel dans le
 * renderer (bundle esbuild) et dans les tests Node.
 */

const MarkdownIt = require('markdown-it');
const footnote = require('markdown-it-footnote');
const mark = require('markdown-it-mark');
const taskLists = require('markdown-it-task-lists');

const LANGUAGE_ALIASES = {
  'c++': 'cpp',
  coffee: 'coffeescript',
  'coffee-script': 'coffeescript',
  cs: 'csharp',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  jl: 'julia',
  js: 'javascript',
  'objective-c': 'objectivec',
  'obj-c': 'objectivec',
  objc: 'objectivec',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  ps1: 'powershell',
  yml: 'yaml',
  ts: 'typescript',
  gv: 'dot',
  graphviz: 'dot',
};

const MERMAID_LANGS = new Set(['mermaid']);
const GRAPHVIZ_LANGS = new Set(['dot', 'graphviz', 'gv']);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text) {
  const s = String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
  return s || 'section';
}

function defaultRenderOptions() {
  return {
    intraEmphasis: true,
    tables: true,
    fencedCode: true,
    footnotes: true,
    autolink: false,
    strikethrough: false,
    underline: false,
    superscript: false,
    highlight: false,
    quote: false,
    smartypants: false,
    hardWrap: false,
    taskList: false,
    frontMatter: false,
    toc: false,
    syntaxHighlighting: false,
    lineNumbers: false,
    codeBlockAccessory: 'none', // none | language | custom
    mermaid: false,
    graphviz: false,
    mathjax: false,
    mathInlineDollar: false,
    highlighter: null, // (code, lang) => html | null
    rewriteUrl: null, // (url, kind) => url
  };
}

/* ------------------------------------------------------------------ */
/* Plugins markdown-it propres à WinDown                              */
/* ------------------------------------------------------------------ */

/** `^(x)` et `^mot` (jusqu'au prochain espace), comme hoedown. */
function superscriptRule(state, silent) {
  const src = state.src;
  const pos = state.pos;
  if (src.charCodeAt(pos) !== 0x5e) return false;

  let contentStart;
  let contentEnd;
  let next;
  if (src.charCodeAt(pos + 1) === 0x28) {
    let depth = 1;
    let i = pos + 2;
    while (i < state.posMax && depth > 0) {
      const c = src.charCodeAt(i);
      if (c === 0x28) depth++;
      else if (c === 0x29) depth--;
      i++;
    }
    if (depth !== 0) return false;
    contentStart = pos + 2;
    contentEnd = i - 1;
    next = i;
  } else {
    let i = pos + 1;
    while (i < state.posMax && !/\s/.test(src[i])) i++;
    if (i === pos + 1) return false;
    contentStart = pos + 1;
    contentEnd = i;
    next = i;
  }
  if (contentEnd <= contentStart) return false;
  if (!silent) {
    state.push('sup_open', 'sup', 1);
    const oldMax = state.posMax;
    state.pos = contentStart;
    state.posMax = contentEnd;
    state.md.inline.tokenize(state);
    state.posMax = oldMax;
    state.push('sup_close', 'sup', -1);
  }
  state.pos = next;
  return true;
}

/**
 * Mathématiques : `\\( x \\)`, `\\[ x \\]`, `$$ x $$` et, si demandé, `$ x $`.
 * Le contenu est conservé tel quel (non interprété par le Markdown) pour
 * que MathJax le retrouve dans le texte de la page.
 */
function makeMathRule(inlineDollar) {
  const pairs = [
    ['\\\\(', '\\\\)', '\\(', '\\)'],
    ['\\\\[', '\\\\]', '\\[', '\\]'],
    ['$$', '$$', '$$', '$$'],
  ];
  return function mathRule(state, silent) {
    const src = state.src;
    const pos = state.pos;
    const first = src.charCodeAt(pos);
    if (first !== 0x5c && first !== 0x24) return false;

    let open = null;
    for (const p of pairs) {
      if (src.startsWith(p[0], pos)) {
        open = p;
        break;
      }
    }
    let content;
    let end;
    let outOpen;
    let outClose;
    if (open) {
      const from = pos + open[0].length;
      const close = src.indexOf(open[1], from);
      if (close < 0 || close >= state.posMax) return false;
      content = src.slice(from, close);
      end = close + open[1].length;
      outOpen = open[2];
      outClose = open[3];
    } else if (inlineDollar && first === 0x24) {
      const from = pos + 1;
      if (/\s/.test(src[from] || ' ')) return false;
      let close = from;
      for (;;) {
        close = src.indexOf('$', close);
        if (close < 0 || close >= state.posMax) return false;
        if (src.charCodeAt(close - 1) === 0x5c) {
          close++;
          continue;
        }
        break;
      }
      if (/\s/.test(src[close - 1]) || close === from) return false;
      content = src.slice(from, close);
      end = close + 1;
      outOpen = '$';
      outClose = '$';
    } else {
      return false;
    }
    if (!silent) {
      const t = state.push('math', '', 0);
      t.content = outOpen + content + outClose;
    }
    state.pos = end;
    return true;
  };
}

/** `"texte"` → `<q>texte</q>` ; une citation non fermée reste littérale. */
function quoteCoreRule(state) {
  for (const blockToken of state.tokens) {
    if (blockToken.type !== 'inline' || !blockToken.children) continue;
    const out = [];
    let openIndex = -1; // index dans `out` du q_open en attente
    for (const child of blockToken.children) {
      if (child.type !== 'text' || child.content.indexOf('"') < 0) {
        out.push(child);
        continue;
      }
      const parts = child.content.split('"');
      parts.forEach((part, i) => {
        if (part) {
          const t = new state.Token('text', '', 0);
          t.content = part;
          out.push(t);
        }
        if (i < parts.length - 1) {
          if (openIndex < 0) {
            const t = new state.Token('q_open', 'q', 1);
            out.push(t);
            openIndex = out.length - 1;
          } else {
            out.push(new state.Token('q_close', 'q', -1));
            openIndex = -1;
          }
        }
      });
    }
    if (openIndex >= 0) {
      // Citation jamais fermée : on remet le guillemet littéral.
      const t = new state.Token('text', '', 0);
      t.content = '"';
      out[openIndex] = t;
    }
    blockToken.children = out;
  }
}

/** `_x_` devient `<u>` (les `__x__` restent en gras). */
function underlineCoreRule(state) {
  for (const blockToken of state.tokens) {
    if (blockToken.type !== 'inline' || !blockToken.children) continue;
    for (const child of blockToken.children) {
      if ((child.type === 'em_open' || child.type === 'em_close') && child.markup === '_') {
        child.tag = 'u';
      }
    }
  }
}

function getInlineText(inlineToken) {
  if (!inlineToken || !inlineToken.children) return inlineToken ? inlineToken.content : '';
  let s = '';
  for (const c of inlineToken.children) {
    if (c.type === 'text' || c.type === 'code_inline') s += c.content;
    else if (c.type === 'softbreak' || c.type === 'hardbreak') s += ' ';
    else if (c.type === 'image') s += c.content;
  }
  return s;
}

function assignHeadingIds(state) {
  const used = new Map();
  const toks = state.tokens;
  state.env.headings = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type !== 'heading_open') continue;
    const text = getInlineText(toks[i + 1]);
    let id = toks[i].attrGet('id');
    if (!id) {
      const base = slugify(text);
      const n = used.get(base) || 0;
      used.set(base, n + 1);
      id = n === 0 ? base : `${base}-${n}`;
      toks[i].attrSet('id', id);
    }
    state.env.headings.push({ level: Number(toks[i].tag.slice(1)), id, text });
  }
}

function tocCoreRule(state) {
  const toks = state.tokens;
  const headings = state.env.headings || [];
  for (let i = 0; i < toks.length - 2; i++) {
    if (
      toks[i].type === 'paragraph_open' &&
      toks[i + 1].type === 'inline' &&
      /^\[toc\]$/i.test(toks[i + 1].content.trim()) &&
      toks[i + 2].type === 'paragraph_close'
    ) {
      const t = new state.Token('html_block', '', 0);
      t.content = buildTocHtml(headings);
      t.map = toks[i].map;
      toks.splice(i, 3, t);
    }
  }
}

function buildTocHtml(headings) {
  if (!headings.length) return '';
  const minLevel = Math.min(...headings.map((h) => h.level));
  let html = '';
  let current = minLevel - 1;
  const opened = [];
  for (const h of headings) {
    const level = Math.max(h.level, minLevel);
    if (level > current) {
      while (current < level) {
        html += opened.length === 0 ? '<ul class="toc">\n' : '<ul>\n';
        opened.push(true);
        current++;
        if (current < level) html += '<li>\n';
      }
    } else {
      html += '</li>\n';
      while (current > level) {
        html += '</ul>\n</li>\n';
        opened.pop();
        current--;
      }
    }
    html += `<li><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a>`;
  }
  html += '</li>\n';
  while (current >= minLevel) {
    html += '</ul>\n';
    if (current > minLevel) html += '</li>\n';
    current--;
  }
  return html;
}

function sourceLinesCoreRule(state) {
  for (const t of state.tokens) {
    if (!t.map) continue;
    if (
      t.type.endsWith('_open') ||
      t.type === 'hr' ||
      t.type === 'fence' ||
      t.type === 'code_block'
    ) {
      t.attrSet('data-line', String(t.map[0]));
    }
  }
}

/** Front-matter Jekyll : retourne { table, body } en conservant les numéros de ligne. */
function extractFrontMatter(text) {
  const m = /^(?:﻿)?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text); // asvs-ignore: RegExp.exec, aucune exécution de code.
  if (!m) return { table: '', body: text };
  const raw = m[1];
  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_.-][^:]*?):\s*(.*)$/.exec(line); // asvs-ignore: RegExp.exec, aucune exécution de code.
    if (!kv) continue;
    let value = kv[2].trim();
    value = value.replace(/^(["'])(.*)\1$/, '$2');
    rows.push([kv[1].trim(), value]);
  }
  let table = '';
  if (rows.length) {
    table =
      '<table>\n<thead>\n<tr>\n' +
      rows.map((r) => `<th>${escapeHtml(r[0])}</th>`).join('\n') +
      '\n</tr>\n</thead>\n<tbody>\n<tr>\n' +
      rows.map((r) => `<td>${escapeHtml(r[1])}</td>`).join('\n') +
      '\n</tr>\n</tbody>\n</table>\n';
  }
  const lines = m[0].split('\n').length - 1;
  const blank = '\n'.repeat(Math.max(lines, 0));
  return { table, body: blank + text.slice(m[0].length) };
}

/* ------------------------------------------------------------------ */
/* Construction de l'instance markdown-it                             */
/* ------------------------------------------------------------------ */

function createMarkdown(o) {
  const md = new MarkdownIt({
    html: true,
    linkify: !!o.autolink,
    typographer: !!o.smartypants,
    breaks: !!o.hardWrap,
    xhtmlOut: false,
  });

  if (!o.tables) md.disable('table');
  if (!o.fencedCode) md.disable('fence');
  if (!o.strikethrough) md.disable('strikethrough');
  else {
    md.renderer.rules.s_open = () => '<del>';
    md.renderer.rules.s_close = () => '</del>';
  }
  if (!o.autolink) md.disable('linkify');
  else md.linkify.set({ fuzzyLink: true, fuzzyEmail: true }); // « www.exemple.com » lié, comme hoedown
  if (o.footnotes) md.use(footnote);
  if (o.highlight) md.use(mark);
  if (o.taskList) md.use(taskLists, { enabled: false, label: false });

  // Italique dans un mot : `_` se comporte comme `*`.
  if (o.intraEmphasis) {
    const Base = md.inline.State;
    md.inline.State = class extends Base {
      scanDelims(start, canSplitWord) {
        const isUnderscore = this.src.charCodeAt(start) === 0x5f;
        return super.scanDelims(start, canSplitWord || isUnderscore);
      }
    };
  }

  if (o.superscript) md.inline.ruler.before('emphasis', 'wd_sup', superscriptRule);
  if (o.mathjax) md.inline.ruler.before('escape', 'wd_math', makeMathRule(o.mathInlineDollar));
  md.renderer.rules.math = (tokens, idx) => escapeHtml(tokens[idx].content);
  md.renderer.rules.sup_open = () => '<sup>';
  md.renderer.rules.sup_close = () => '</sup>';
  md.renderer.rules.q_open = () => '<q>';
  md.renderer.rules.q_close = () => '</q>';

  md.core.ruler.push('wd_heading_ids', assignHeadingIds);
  if (o.toc) md.core.ruler.push('wd_toc', tocCoreRule);
  md.core.ruler.push('wd_lines', sourceLinesCoreRule);
  if (o.underline) md.core.ruler.after('inline', 'wd_underline', underlineCoreRule);
  if (o.quote) md.core.ruler.after('inline', 'wd_quote', quoteCoreRule);

  // Réécriture d'URL pour les images (aperçu : chemins relatifs et absolus).
  if (typeof o.rewriteUrl === 'function') {
    const defaultImage = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const t = tokens[idx];
      const src = t.attrGet('src');
      if (src) t.attrSet('src', o.rewriteUrl(src, 'image'));
      return defaultImage(tokens, idx, options, env, self);
    };
  }

  // Blocs de code.
  const highlightBlock = (code, rawInfo, level) => {
    const info = (rawInfo || '').trim();
    let lang = '';
    let extra = '';
    if (info) {
      const m = /^([^\s:]+)(?:[:\s]+(.*))?$/.exec(info); // asvs-ignore: RegExp.exec, aucune exécution de code.
      if (m) {
        lang = m[1].toLowerCase();
        extra = (m[2] || '').trim();
      }
    }
    lang = LANGUAGE_ALIASES[lang] || lang;
    env_languages.add(lang);
    const trimmed = code.endsWith('\n') ? code.slice(0, -1) : code;

    if (o.syntaxHighlighting && MERMAID_LANGS.has(lang) && o.mermaid) {
      env_flags.mermaid = true;
      return `<pre${level}><code class="language-mermaid">${escapeHtml(trimmed)}\n</code></pre>\n`;
    }
    if (o.syntaxHighlighting && GRAPHVIZ_LANGS.has(lang) && o.graphviz) {
      env_flags.graphviz = true;
      return `<pre${level}><code class="language-dot">${escapeHtml(trimmed)}\n</code></pre>\n`;
    }
    if (!lang || !o.syntaxHighlighting) {
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      return `<pre${level}><code${cls}>${escapeHtml(trimmed)}\n</code></pre>\n`;
    }
    let inner = null;
    if (typeof o.highlighter === 'function') {
      try {
        inner = o.highlighter(trimmed, lang);
      } catch {
        inner = null;
      }
    }
    if (inner == null) inner = escapeHtml(trimmed);
    const classes = [`language-${escapeHtml(lang)}`];
    if (o.lineNumbers) classes.push('line-numbers');
    let attrs = ` class="${classes.join(' ')}"`;
    if (o.codeBlockAccessory === 'language') attrs += ` data-language="${escapeHtml(lang)}"`;
    if (o.codeBlockAccessory === 'custom' && extra) {
      attrs += ` data-information="${escapeHtml(extra)}"`;
    }
    let rows = '';
    if (o.lineNumbers) {
      const n = trimmed.split('\n').length;
      rows = `<span aria-hidden="true" class="line-numbers-rows">${'<span></span>'.repeat(n)}</span>`;
    }
    return `<pre${level}${attrs}><code class="language-${escapeHtml(lang)}">${inner}\n${rows}</code></pre>\n`;
  };

  let env_languages = new Set();
  let env_flags = { mermaid: false, graphviz: false };
  md.__beginRender = () => {
    env_languages = new Set();
    env_flags = { mermaid: false, graphviz: false };
  };
  md.__endRender = () => ({ languages: [...env_languages].filter(Boolean), ...env_flags });

  md.renderer.rules.fence = (tokens, idx) => {
    const t = tokens[idx];
    const line = t.attrGet('data-line');
    return highlightBlock(t.content, t.info, line != null ? ` data-line="${line}"` : '');
  };
  md.renderer.rules.code_block = (tokens, idx) => {
    const t = tokens[idx];
    const line = t.attrGet('data-line');
    const trimmed = t.content.endsWith('\n') ? t.content.slice(0, -1) : t.content;
    return `<pre${line != null ? ` data-line="${line}"` : ''}><code>${escapeHtml(trimmed)}\n</code></pre>\n`;
  };

  return md;
}

/* ------------------------------------------------------------------ */
/* API publique                                                       */
/* ------------------------------------------------------------------ */

/**
 * @param {string} text  Markdown source.
 * @param {object} [options]  voir defaultRenderOptions().
 * @returns {{html:string, headings:Array, languages:string[], mermaid:boolean, graphviz:boolean, math:boolean}}
 */
function renderMarkdown(text, options) {
  const o = Object.assign(defaultRenderOptions(), options || {});
  const md = createMarkdown(o);
  let body = String(text || '');
  let frontTable = '';
  if (o.frontMatter) {
    const fm = extractFrontMatter(body);
    frontTable = fm.table;
    body = fm.body;
  }
  md.__beginRender();
  const env = {};
  let html = md.render(body, env);
  const info = md.__endRender();
  if (frontTable) html = frontTable + html;
  return {
    html,
    headings: env.headings || [],
    languages: info.languages,
    mermaid: info.mermaid,
    graphviz: info.graphviz,
    math: !!o.mathjax,
  };
}

/** Compte mots / caractères / caractères sans espaces. */
function countText(text) {
  const s = String(text || '');
  const words = (s.match(/\S+/g) || []).length;
  return {
    words,
    characters: [...s].length,
    charactersNoSpaces: [...s.replace(/\s/g, '')].length,
  };
}

module.exports = {
  renderMarkdown,
  defaultRenderOptions,
  extractFrontMatter,
  buildTocHtml,
  countText,
  escapeHtml,
  slugify,
  LANGUAGE_ALIASES,
};
