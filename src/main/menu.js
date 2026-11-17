'use strict';
const path = require('node:path');

/**
 * Menu d'application. Raccourcis repris de MacDown (⌘ devient Ctrl) ; les
 * combinaisons avec Alt sont évitées car Ctrl+Alt = AltGr sur les claviers
 * canadiens-français et internationaux.
 *
 * ctx = { t, recent, view: {editorVisible, previewVisible, toolbarVisible}, devTools, actions }
 * Les commandes de mise en forme sont envoyées au renderer de la fenêtre active.
 */
function buildMenuTemplate(ctx) {
  const { t, actions, view } = ctx;
  const cmd = (name, arg) => () => actions.command(name, arg);
  const item = (label, accelerator, click, extra = {}) => ({ label, accelerator, click, ...extra });

  const recentItems = ctx.recent.length
    ? ctx.recent.map((file) => ({
        label: path.basename(file),
        sublabel: file,
        toolTip: file,
        click: () => actions.openPath(file),
      }))
    : [{ label: t('menu.noRecent'), enabled: false }];

  const file = {
    label: t('menu.file'),
    submenu: [
      item(t('menu.new'), 'CmdOrCtrl+N', actions.newDocument),
      item(t('menu.open'), 'CmdOrCtrl+O', actions.openDialog),
      {
        label: t('menu.openRecent'),
        submenu: [...recentItems, { type: 'separator' }, item(t('menu.clearRecent'), null, actions.clearRecent, { enabled: ctx.recent.length > 0 })],
      },
      { type: 'separator' },
      item(t('menu.close'), 'CmdOrCtrl+W', actions.closeWindow),
      item(t('menu.save'), 'CmdOrCtrl+S', actions.save),
      item(t('menu.saveAs'), 'CmdOrCtrl+Shift+S', actions.saveAs),
      item(t('menu.revert'), null, actions.revert),
      { type: 'separator' },
      {
        label: t('menu.export'),
        submenu: [item(t('menu.exportHtml'), null, actions.exportHtml), item(t('menu.exportPdf'), null, actions.exportPdf)],
      },
      item(t('menu.print'), 'CmdOrCtrl+P', actions.print),
      { type: 'separator' },
      item(t('menu.preferences'), 'CmdOrCtrl+,', actions.preferences),
      { type: 'separator' },
      item(t('menu.quit'), 'CmdOrCtrl+Q', actions.quit),
    ],
  };

  const edit = {
    label: t('menu.edit'),
    submenu: [
      item(t('menu.undo'), 'CmdOrCtrl+Z', cmd('undo')),
      item(t('menu.redo'), 'CmdOrCtrl+Y', cmd('redo')),
      { type: 'separator' },
      { label: t('menu.cut'), role: 'cut' },
      { label: t('menu.copy'), role: 'copy' },
      { label: t('menu.paste'), role: 'paste' },
      { label: t('menu.delete'), role: 'delete' },
      { label: t('menu.selectAll'), role: 'selectAll' },
      { type: 'separator' },
      item(t('menu.find'), 'CmdOrCtrl+F', cmd('find')),
      item(t('menu.findReplace'), 'CmdOrCtrl+H', cmd('findReplace')),
      item(t('menu.findNext'), 'F3', cmd('findNext')),
      item(t('menu.findPrevious'), 'Shift+F3', cmd('findPrevious')),
      item(t('menu.useSelectionForFind'), 'CmdOrCtrl+E', cmd('useSelectionForFind')),
      item(t('menu.jumpToSelection'), 'CmdOrCtrl+J', cmd('jumpToSelection')),
      { type: 'separator' },
      {
        label: t('menu.transform'),
        submenu: [
          item(t('menu.upper'), null, cmd('upperCase')),
          item(t('menu.lower'), null, cmd('lowerCase')),
          item(t('menu.capitalize'), null, cmd('capitalize')),
        ],
      },
    ],
  };

  const viewMenu = {
    label: t('menu.view'),
    submenu: [
      item(t('menu.render'), 'CmdOrCtrl+R', cmd('render')),
      { type: 'separator' },
      item(t('menu.layout14'), null, cmd('layout', 0.25)),
      item(t('menu.layout11'), 'CmdOrCtrl+Shift+0', cmd('layout', 0.5)),
      item(t('menu.layout31'), null, cmd('layout', 0.75)),
      item(view.previewVisible ? t('menu.hidePreview') : t('menu.showPreview'), 'CmdOrCtrl+Shift+H', cmd('togglePreview')),
      item(view.editorVisible ? t('menu.hideEditor') : t('menu.showEditor'), 'CmdOrCtrl+Shift+E', cmd('toggleEditor')),
      item(view.toolbarVisible ? t('menu.hideToolbar') : t('menu.showToolbar'), 'CmdOrCtrl+Shift+T', cmd('toggleToolbar')),
      { type: 'separator' },
      item(t('menu.zoomIn'), 'CmdOrCtrl+Plus', cmd('zoom', 1)),
      item(t('menu.zoomOut'), 'CmdOrCtrl+Shift+-', cmd('zoom', -1)),
      item(t('menu.zoomReset'), 'CmdOrCtrl+Shift+Backspace', cmd('zoom', 0)),
      { type: 'separator' },
      { label: t('menu.fullscreen'), role: 'togglefullscreen' },
      ...(ctx.devTools ? [{ type: 'separator' }, { label: t('menu.devtools'), role: 'toggleDevTools' }] : []),
    ],
  };

  const format = {
    label: t('menu.format'),
    submenu: [
      item(t('menu.copyHtml'), 'CmdOrCtrl+Shift+C', cmd('copyHtml')),
      { type: 'separator' },
      item(t('menu.strong'), 'CmdOrCtrl+B', cmd('strong')),
      item(t('menu.emphasis'), 'CmdOrCtrl+I', cmd('emphasis')),
      item(t('menu.underline'), 'CmdOrCtrl+U', cmd('underline')),
      item(t('menu.strikethrough'), 'CmdOrCtrl+-', cmd('strikethrough')),
      item(t('menu.highlight'), 'CmdOrCtrl+=', cmd('highlight')),
      item(t('menu.inlineCode'), 'CmdOrCtrl+K', cmd('inlineCode')),
      item(t('menu.comment'), 'CmdOrCtrl+/', cmd('comment')),
      { type: 'separator' },
      {
        label: t('menu.convertTo'),
        submenu: [
          ...[1, 2, 3, 4, 5, 6].map((n) => item(t(`menu.h${n}`), `CmdOrCtrl+${n}`, cmd('heading', n))),
          item(t('menu.paragraph'), 'CmdOrCtrl+0', cmd('heading', 0)),
        ],
      },
      { type: 'separator' },
      item(t('menu.orderedList'), 'CmdOrCtrl+Shift+O', cmd('orderedList')),
      item(t('menu.unorderedList'), 'CmdOrCtrl+Shift+U', cmd('unorderedList')),
      item(t('menu.blockquote'), 'CmdOrCtrl+Shift+B', cmd('blockquote')),
      { type: 'separator' },
      item(t('menu.shiftRight'), 'CmdOrCtrl+]', cmd('shiftRight')),
      item(t('menu.shiftLeft'), 'CmdOrCtrl+[', cmd('shiftLeft')),
      { type: 'separator' },
      item(t('menu.link'), 'CmdOrCtrl+Shift+K', cmd('link')),
      item(t('menu.image'), 'CmdOrCtrl+Shift+I', cmd('image')),
      item(t('menu.newParagraph'), null, cmd('newParagraph')),
    ],
  };

  const help = {
    label: t('menu.help'),
    submenu: [
      item(t('menu.helpDoc'), 'F1', actions.help),
      { type: 'separator' },
      item(t('menu.licenses'), null, actions.licenses),
      item(t('menu.about'), null, actions.about),
    ],
  };

  return [file, edit, viewMenu, format, help];
}

module.exports = { buildMenuTemplate };
