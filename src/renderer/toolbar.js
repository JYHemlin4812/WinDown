'use strict';
/** Barre d'outils : boutons de mise en forme (icônes SVG ou glyphes), sans image externe. */

const svg = (inner) => `<svg viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  ul: svg('<circle cx="3" cy="4" r="0.9"/><circle cx="3" cy="8" r="0.9"/><circle cx="3" cy="12" r="0.9"/><path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>'),
  ol: svg('<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/><path d="M2 3l1-.6V6M2 9.2c.4-.9 1.8-.9 1.8 0 0 .8-1.8 1.2-1.8 2.3h1.9" stroke-width="1.1"/>'),
  quote: svg('<path d="M3 3v10"/><path d="M6.5 5h7M6.5 8h7M6.5 11h5"/>'),
  link: svg('<path d="M6.5 9.5l3-3"/><path d="M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1"/><path d="M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1"/>'),
  image: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3"/>'),
  outdent: svg('<path d="M2 3h12M7 6.5h7M7 9.5h7M2 13h12"/><path d="M4.5 6.5L2 8l2.5 1.5z" fill="currentColor"/>'),
  indent: svg('<path d="M2 3h12M7 6.5h7M7 9.5h7M2 13h12"/><path d="M2 6.5L4.5 8 2 9.5z" fill="currentColor"/>'),
  editor: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/><path d="M3.8 6h2.4M3.8 8h2.4M3.8 10h1.6" stroke-width="1.1"/>'),
  preview: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/><path d="M9.8 6h2.4M9.8 8h2.4M9.8 10h1.6" stroke-width="1.1"/>'),
  html: svg('<path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3M9 3.5L7 12.5"/>'),
  fullscreen: svg('<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>'),
};

/** [id, commande, argument, rendu, clé de traduction] ; null = séparateur. */
const ITEMS = [
  ['strong', 'strong', undefined, '<span class="glyph-b">B</span>', 'tb.strong'],
  ['emphasis', 'emphasis', undefined, '<span class="glyph-i">I</span>', 'tb.emphasis'],
  ['underline', 'underline', undefined, '<span class="glyph-u">U</span>', 'tb.underline'],
  ['strike', 'strikethrough', undefined, '<span class="glyph-s">S</span>', 'tb.strikethrough'],
  ['highlight', 'highlight', undefined, '<span class="glyph-mark">ab</span>', 'tb.highlight'],
  null,
  ['h1', 'heading', 1, '<span class="glyph-h">H1</span>', 'tb.h1'],
  ['h2', 'heading', 2, '<span class="glyph-h">H2</span>', 'tb.h2'],
  ['h3', 'heading', 3, '<span class="glyph-h">H3</span>', 'tb.h3'],
  null,
  ['ul', 'unorderedList', undefined, ICONS.ul, 'tb.unorderedList'],
  ['ol', 'orderedList', undefined, ICONS.ol, 'tb.orderedList'],
  ['quote', 'blockquote', undefined, ICONS.quote, 'tb.blockquote'],
  null,
  ['code', 'inlineCode', undefined, '<span class="glyph-mono">&lt;/&gt;</span>', 'tb.code'],
  ['link', 'link', undefined, ICONS.link, 'tb.link'],
  ['image', 'image', undefined, ICONS.image, 'tb.image'],
  ['comment', 'comment', undefined, '<span class="glyph-mono">&lt;!--</span>', 'tb.comment'],
  null,
  ['outdent', 'shiftLeft', undefined, ICONS.outdent, 'tb.shiftLeft'],
  ['indent', 'shiftRight', undefined, ICONS.indent, 'tb.shiftRight'],
  null,
  ['copyHtml', 'copyHtml', undefined, ICONS.html, 'tb.copyHtml'],
  'spacer',
  ['toggleEditor', 'toggleEditor', undefined, ICONS.editor, 'tb.hideEditor'],
  ['togglePreview', 'togglePreview', undefined, ICONS.preview, 'tb.hidePreview'],
  ['fullscreen', 'fullscreen', undefined, ICONS.fullscreen, 'tb.fullscreen'],
];

/**
 * Construit la barre dans `container`. `run(cmd, arg)` exécute la commande ;
 * `t` traduit. Retourne { setState(view) } pour refléter les volets masqués.
 */
function buildToolbar(container, { t, run }) {
  container.textContent = '';
  const buttons = {};
  for (const it of ITEMS) {
    if (it === null) {
      const s = document.createElement('span');
      s.className = 'sep';
      container.appendChild(s);
    } else if (it === 'spacer') {
      const s = document.createElement('span');
      s.className = 'spacer';
      container.appendChild(s);
    } else {
      const [id, cmd, arg, html, key] = it;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.cmd = cmd;
      b.innerHTML = html;
      b.title = t(key);
      b.setAttribute('aria-label', t(key));
      b.addEventListener('mousedown', (e) => e.preventDefault()); // garde le focus (et la sélection) dans l'éditeur
      b.addEventListener('click', () => run(cmd, arg));
      container.appendChild(b);
      buttons[id] = b;
    }
  }
  return {
    setState(view) {
      buttons.toggleEditor?.classList.toggle('on', !view.editorVisible);
      buttons.togglePreview?.classList.toggle('on', !view.previewVisible);
      buttons.fullscreen?.classList.toggle('on', Boolean(view.fullscreen));
      buttons.fullscreen?.setAttribute('aria-pressed', String(Boolean(view.fullscreen)));
    },
  };
}

module.exports = { buildToolbar };
