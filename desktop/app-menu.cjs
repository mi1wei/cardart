function appMenu({ platform, text, context, writable, enabled, updates, send, actions }) {
  const command = (id, label, accelerator, allowed = true) => ({
    id, label, ...(accelerator ? { accelerator } : {}),
    enabled: enabled && allowed,
    click: () => send(id),
  });
  const idle = !context.busy;
  const edit = idle && writable;
  const album = context.page === 'album';
  const separator = { type: 'separator' };
  const settings = command('settings', text('设置…', 'Settings…'), 'CmdOrCtrl+,');
  const license = command('license', text('许可证…', 'License…'), null, idle);
  const about = { role: 'about', label: text('关于 Folio', 'About Folio') };
  const quit = { role: 'quit', id: 'quit', label: text('退出 Folio', 'Quit Folio') };
  const app = {
    label: 'Folio', submenu: [
      about, ...updates, separator, settings, license, separator,
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, separator, quit,
    ],
  };
  const file = {
    label: text('文件', 'File'), submenu: [
      command('new-album', text('新建相册', 'New Album'), 'CmdOrCtrl+N', edit),
      command('add-photos', text('添加照片…', 'Add Photos…'), 'CmdOrCtrl+O', edit && album),
      command('import-folder', text('从文件夹导入…', 'Import from Folder…'), 'CmdOrCtrl+Shift+O', edit),
      separator, command('export-pdf', text('导出 PDF…', 'Export PDF…'), 'CmdOrCtrl+Shift+E', edit && album),
      separator,
      { id: 'reveal-library', label: platform === 'win32' ? text('在资源管理器中显示相册库', 'Show Library in Explorer') : text('在 Finder 中显示相册库', 'Show Library in Finder'), click: actions.reveal },
      { id: 'choose-library', label: text('选择相册库…', 'Choose Library…'), enabled: enabled && idle, click: actions.choose },
      ...(platform === 'darwin' ? [] : [separator, settings, license, ...updates, separator, quit]),
    ],
  };
  const editMenu = { label: text('编辑', 'Edit'), submenu: [
    { role: 'undo' }, { role: 'redo' }, separator,
    { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
  ] };
  const view = { label: text('显示', 'View'), submenu: [
    { label: text('外观', 'Appearance'), submenu: ['light', 'dark', 'auto'].map((mode, i) => ({
      ...command(`appearance-${mode}`, [text('浅色', 'Light'), text('深色', 'Dark'), text('自动', 'Auto')][i]),
      type: 'radio', checked: context.appearance === mode,
    })) },
    { label: text('缩略图', 'Thumbnails'), submenu: ['s', 'm', 'l'].map((size, i) => ({
      ...command(`density-${size}`, [text('小', 'Small'), text('中', 'Medium'), text('大', 'Large')][i], null, album),
      type: 'radio', checked: context.density === size,
    })) },
    separator, { role: 'togglefullscreen' },
  ] };
  const window = { label: text('窗口', 'Window'), submenu: [
    { role: 'minimize' }, { role: 'zoom' }, { label: text('显示 Folio', 'Show Folio'), click: actions.show },
  ] };
  const help = { label: text('帮助', 'Help'), submenu: [
    command('shortcuts', text('键盘快捷键', 'Keyboard Shortcuts'), 'CmdOrCtrl+/'), separator,
    { label: text('打开日志', 'Open Logs'), click: actions.logs },
    { id: 'third-party-notices', label: text('第三方声明', 'Third-party Notices'), click: actions.notices },
    ...(platform === 'darwin' ? [] : [separator, about]),
  ] };
  return [...(platform === 'darwin' ? [app] : []), file, editMenu, view, window, help];
}

function textMenu({ isEditable, selectionText = '', editFlags = {} }) {
  if (!isEditable) return selectionText.trim() ? [{ role: 'copy' }, { role: 'selectAll' }] : null;
  return ['cut', 'copy', 'paste', 'selectAll'].map((role) => ({
    role, enabled: Boolean(editFlags[`can${role[0].toUpperCase()}${role.slice(1)}`]),
  }));
}

module.exports = { appMenu, textMenu };
