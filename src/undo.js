import { api } from './api.js';
import { c } from './collection-text.js';
import { t } from './i18n.js';
import { allowWrite } from './license.js';
import { toast } from './ui.js';

let current;
let timer;

export function showUndo(trashId, afterRestore) {
  if (!trashId) return;
  clearTimeout(timer);
  current?.remove();
  const node = document.createElement('div');
  node.className = 'undo-toast';
  node.setAttribute('role', 'status');
  const label = document.createElement('span');
  label.textContent = c('movedToTrash');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.write = '';
  button.textContent = c('undo');
  node.append(label, button);
  document.body.append(node);
  current = node;
  timer = setTimeout(() => node.remove(), 8000);
  button.onclick = async () => {
    if (!allowWrite()) return;
    if (document.documentElement.hasAttribute('data-busy')) { toast(c('busy')); return; }
    clearTimeout(timer);
    button.disabled = true;
    try {
      await api.restoreTrash([trashId]);
      node.remove();
      window.dispatchEvent(new Event('folio-library-changed'));
      await afterRestore?.();
    } catch (error) {
      button.disabled = false;
      toast(t('failed', { reason: error.message }));
    }
  };
}
