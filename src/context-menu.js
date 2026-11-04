import { canWrite, allowWrite } from './license.js';
import { onComputer } from './phone.js';
import { t } from './i18n.js';
import { c } from './collection-text.js';
import { toast } from './ui.js';

let current;

export function bindContextMenu(host, selector, itemsFor) {
  if (!onComputer || !matchMedia('(pointer: fine)').matches) return () => {};
  function show(event, opener, keyboard = false) {
    if (!opener || event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable=false])') ||
        document.querySelector('dialog[open], .lb, .ab') || window.getSelection()?.toString().trim()) return;
    const items = itemsFor(opener);
    if (!items?.some(Boolean)) return;
    event.preventDefault();
    event.stopPropagation();
    current?.close(false);
    const menu = document.createElement('div');
    menu.className = 'menu context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('more'));
    const busy = () => document.documentElement.hasAttribute('data-busy');
    for (const item of items) {
      if (!item) {
        const line = document.createElement('hr');
        line.setAttribute('role', 'separator');
        menu.append(line);
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.dataset.context = item.id;
      button.textContent = item.label;
      button.disabled = Boolean(item.disabled || (item.write && (!canWrite() || busy())));
      if (item.write) button.setAttribute('data-write', '');
      if (item.danger) button.classList.add('red');
      button.addEventListener('click', () => {
        if (button.disabled || (item.write && !allowWrite())) return;
        if (item.write && busy()) { toast(c('busy')); close(true); return; }
        close(true);
        Promise.resolve().then(() => item.run()).catch((error) => toast(t('failed', { reason: error.message })));
      });
      menu.append(button);
    }
    if (!opener.matches('a, button, input, [tabindex]')) opener.tabIndex = -1;
    const rect = opener.getBoundingClientRect();
    const x = keyboard ? rect.left : event.clientX;
    const y = keyboard ? rect.bottom : event.clientY;
    document.body.append(menu);
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`;
    const buttons = () => [...menu.querySelectorAll('button:not(:disabled)')];
    buttons()[0]?.focus({ preventScroll: true });
    const changes = new MutationObserver(() => {
      if (!opener.isConnected || document.querySelector('dialog[open], .lb, .ab')) close(false);
    });
    changes.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });

    function close(focus) {
      changes.disconnect();
      menu.remove();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      if (current?.menu === menu) current = null;
      if (focus && opener.isConnected) opener.focus({ preventScroll: true });
    }
    function onKey(e) {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape' || e.key === 'Tab') return close(true);
      const list = buttons();
      if (e.key === 'Enter' || e.key === ' ') return document.activeElement?.click();
      const index = list.indexOf(document.activeElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1
        : (index + (e.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
      list[next]?.focus({ preventScroll: true });
    }
    const dismiss = () => close(false);
    const outside = (e) => { if (!menu.contains(e.target)) close(false); };
    const scroll = (e) => { if (!menu.contains(e.target)) close(false); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scroll, true);
    current = { host, menu, close };
  }
  const context = (event) => show(event, event.target.closest(selector));
  const key = (event) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) show(event, event.target.closest(selector), true);
  };
  host.addEventListener('contextmenu', context);
  host.addEventListener('keydown', key);
  return () => {
    host.removeEventListener('contextmenu', context);
    host.removeEventListener('keydown', key);
    if (current?.host === host) current.close(false);
  };
}
