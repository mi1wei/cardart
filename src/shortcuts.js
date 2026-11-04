import { t } from './i18n.js';

export function openShortcuts() {
  if (document.querySelector('dialog[open]')) return;
  const opener = document.activeElement;
  const d = document.createElement('dialog');
  d.className = 'dlg shortcuts';
  d.setAttribute('aria-labelledby', 'shortcuts-title');
  const mod = window.folioDesktop?.platform === 'mac' ? '\u2318' : 'Ctrl';
  const groups = [
    ['global', [
      ['?', 'shortcuts'],
      ...(window.folioDesktop ? [
        [`${mod}+,`, 'settings'], [`${mod}+N`, 'new-album'], [`${mod}+Shift+O`, 'import-folder'],
        [`${mod}+/`, 'shortcuts'],
      ] : []),
    ]],
    ['album', [
      ...(window.folioDesktop ? [[`${mod}+O`, 'upload'], [`${mod}+Shift+E`, 'shortcut-pdf']] : []),
      [`${mod}+A`, 'shortcut-all'],
    ]],
    ['selection', [[`${mod}+click`, 'shortcut-toggle'], ['Shift+click', 'shortcut-range'], ['Delete / Backspace', 'delete'], ['Esc', 'shortcut-selection-close']]],
    ['viewer', [['\u2190 / \u2192', 'shortcut-photos'], ['I', 'details'], ['+ / \u2212', 'shortcut-zoom'], ['0', 'shortcut-fit'], ['Space', 'shortcut-video'], ['Esc', 'close']]],
    ['book', [['\u2190 / \u2192 / PageUp / PageDown', 'shortcut-pages'], ['Space', 'autoplay'], ['Esc', 'shortcut-book-close']]],
  ];
  d.innerHTML = `<form method="dialog"><h3 id="shortcuts-title" tabindex="-1" autofocus>${t('shortcuts')}</h3>${groups.map(([group, rows]) =>
    `<section><h4>${t(`shortcut-group-${group}`)}</h4><dl>${rows.map(([key, label]) => `<div><dt>${t(label)}</dt><dd><kbd>${key}</kbd></dd></div>`).join('')}</dl></section>`).join('')}
    <div class="dlg-acts"><button class="btn pri">${t('settings-done')}</button></div></form>`;
  d.addEventListener('close', () => {
    d.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  document.body.append(d);
  d.showModal();
}

export function initShortcuts() {
  window.addEventListener('keydown', (event) => {
    if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented ||
        event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable=false])')) return;
    event.preventDefault();
    openShortcuts();
  });
}
