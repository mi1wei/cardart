const sharp = require('sharp');

// A small JPEG; a different width gives different bytes, so no two count as duplicates.
const jpeg = (width) => sharp({ create: { width, height: 20, channels: 3, background: '#2f6fa3' } }).jpeg().toBuffer();

const encode = (nodes) => nodes.map((node) => (node.children
  ? { name: node.name, children: encode(node.children) }
  : { name: node.name, type: node.type ?? '', data: (node.bytes ?? Buffer.alloc(0)).toString('base64'), unreadable: Boolean(node.unreadable) }));

// Drops files and folders on the page the way the system file manager does in Chromium: folder
// entries hand out at most `batch` children per readEntries() call (Chromium: 100), and the items stop
// answering once the drop event is over. A DataTransfer built in the page cannot do this:
// webkitGetAsEntry() returns null for its items. With `drop: false` the files only hover. `delay` (ms)
// slows every read down, like a big folder.
async function dropFiles(page, nodes, { target = 'body', batch = 2, drop = true, delay = 0 } = {}) {
  return page.evaluate(({ nodes, target, batch, drop, delay }) => {
    const toFile = (node) => new File([Uint8Array.from(atob(node.data), (c) => c.charCodeAt(0))], node.name, { type: node.type });
    const later = (fn) => setTimeout(fn, delay);
    const entry = (node) => (node.children ? {
      isFile: false,
      isDirectory: true,
      name: node.name,
      createReader() {
        let at = 0;
        return {
          readEntries(ok) {
            const next = node.children.slice(at, at + batch).map(entry);
            at += next.length;
            later(() => ok(next));
          },
        };
      },
    } : {
      isFile: true,
      isDirectory: false,
      name: node.name,
      file(ok, fail) { later(() => (node.unreadable ? fail(new DOMException('The file was moved', 'NotFoundError')) : ok(toFile(node)))); },
    });
    let live = true;
    const items = nodes.map((node) => ({
      kind: 'file',
      webkitGetAsEntry: () => (live ? entry(node) : null),
      getAsFile: () => (live && !node.children ? toFile(node) : null),
    }));
    const dataTransfer = { types: ['Files'], items, files: nodes.filter((node) => !node.children).map(toFile), dropEffect: 'copy' };
    const el = document.querySelector(target);
    for (const type of drop ? ['dragenter', 'dragover', 'drop'] : ['dragenter', 'dragover']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      el.dispatchEvent(event);
    }
    live = false;
    const hint = document.querySelector('.drop-hint');
    return { hint: Boolean(hint && !hint.hidden) };
  }, { nodes: encode(nodes), target, batch, drop, delay });
}

module.exports = { jpeg, dropFiles };
