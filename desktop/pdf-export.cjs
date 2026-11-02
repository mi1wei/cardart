const { randomUUID } = require('node:crypto');
const { open, link, rm, mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { isAppURL } = require('./security.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = ['export', 'cancel', 'reveal', 'config', 'ready'];

function validateRequest(value) {
  if (!value || Object.keys(value).some((key) => !['requestId', 'albumId', 'options', 'language'].includes(key)) ||
    !UUID.test(value.requestId) || !UUID.test(value.albumId) || !['en', 'zh'].includes(value.language)) throw new Error('Invalid PDF request');
  const options = value.options;
  if (!options || Object.keys(options).some((key) => !['paper', 'perPage', 'quality', 'cover', 'captions'].includes(key)) ||
    !['A4', 'Letter'].includes(options.paper) || ![1, 2, 3].includes(options.perPage) ||
    !['standard', 'high'].includes(options.quality) || typeof options.cover !== 'boolean' || typeof options.captions !== 'boolean') throw new Error('Invalid PDF options');
}

function pdfBasename(title) {
  const name = String(title || 'Folio').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 100);
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? 'Folio' : name;
}

function createPdfExporter({ ipcMain, BrowserWindow, owner, getOrigin, downloads, shell, canExport, timeoutMs = 120000 }) {
  const jobs = new Map();
  const exported = new Map();
  let disposed = false;
  function checkOwner(event) {
    const url = event.senderFrame?.url;
    if (disposed || owner.isDestroyed() || event.sender !== owner.webContents ||
      event.senderFrame !== owner.webContents.mainFrame || !isAppURL(url, getOrigin()) ||
      !['/', '/index.html'].includes(new URL(url).pathname) ||
      !isAppURL(owner.webContents.getURL(), getOrigin())) throw new Error('Denied PDF sender');
  }
  function printJob(event) {
    const job = [...jobs.values()].find((item) => item.window.webContents === event.sender);
    if (!job || event.senderFrame !== job.window.webContents.mainFrame ||
      event.senderFrame.url !== job.url || job.window.webContents.getURL() !== job.url || job.cancelled) throw new Error('Denied PDF print job sender');
    return job;
  }
  async function finish(job, error, result) {
    if (job.finishing) return;
    job.finishing = true;
    clearTimeout(job.timer);
    if (!job.window.isDestroyed()) job.window.destroy();
    await rm(job.partial, { force: true }).catch(() => {});
    if (error && job.output) await rm(job.output, { force: true }).catch(() => {});
    jobs.delete(job.requestId);
    if (error) job.reject(error);
    else job.resolve(result);
    job.complete();
  }
  function cancel(job) {
    if (!job || job.finishing) return;
    job.cancelled = true;
    if (!job.window.isDestroyed()) job.window.destroy();
    if (!job.rendering) void finish(job, new Error('PDF export cancelled'));
  }
  function cancelAll() { for (const job of jobs.values()) cancel(job); }
  async function save(job, bytes, title) {
    const directory = typeof downloads === 'function' ? downloads() : downloads;
    await mkdir(directory, { recursive: true });
    job.partial = join(directory, `.folio-${randomUUID()}.pdf.part`);
    const file = await open(job.partial, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    const base = pdfBasename(title);
    for (let index = 1; ; index++) {
      if (job.cancelled) throw new Error('PDF export cancelled');
      const name = `${base}${index === 1 ? '' : ` (${index})`}.pdf`;
      const path = join(directory, name);
      try { await link(job.partial, path); }
      catch (error) { if (error.code === 'EEXIST') continue; throw error; }
      job.output = path;
      if (job.cancelled) throw new Error('PDF export cancelled');
      const token = randomUUID();
      exported.set(token, path);
      // Retain a bounded set of capabilities, not renderer-supplied paths.
      if (exported.size > 100) exported.delete(exported.keys().next().value);
      return { name, token };
    }
  }
  const handlers = {
    export(event, request) {
      checkOwner(event);
      validateRequest(request);
      if (!canExport()) throw new Error('PDF export requires an active write license');
      if (jobs.size) throw new Error('A PDF export is already running');
      const url = `${getOrigin()}/print.html#${randomUUID()}`;
      const printWindow = new BrowserWindow({
        show: false, width: 1200, height: 900,
        webPreferences: {
          preload: join(__dirname, 'print-preload.cjs'), nodeIntegration: false,
          contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
        },
      });
      return new Promise((resolve, reject) => {
        const job = { ...request, url, window: printWindow, resolve, reject, partial: '', cancelled: false };
        job.done = new Promise((complete) => { job.complete = complete; });
        jobs.set(request.requestId, job);
        const guard = (navigation, target) => {
          if (target !== url) { navigation.preventDefault(); cancel(job); }
        };
        printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        printWindow.webContents.on('will-navigate', guard);
        printWindow.webContents.on('will-redirect', guard);
        printWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
        printWindow.webContents.once('render-process-gone', () => cancel(job));
        printWindow.once('closed', () => cancel(job));
        job.timer = setTimeout(() => cancel(job), timeoutMs);
        job.timer.unref?.();
        void printWindow.loadURL(url).catch((error) => { void finish(job, error); });
      });
    },
    cancel(event, requestId) {
      checkOwner(event);
      if (!UUID.test(requestId)) throw new Error('Invalid PDF request');
      cancel(jobs.get(requestId));
    },
    reveal(event, token) {
      checkOwner(event);
      const path = exported.get(token);
      if (!path) throw new Error('Unknown PDF export');
      shell.showItemInFolder(path);
    },
    config(event) {
      const job = printJob(event);
      return { albumId: job.albumId, options: job.options, language: job.language };
    },
    async ready(event, result) {
      const job = printJob(event);
      if (job.rendering) throw new Error('PDF print job already started');
      job.rendering = true;
      try {
        if (result?.error) throw new Error(String(result.error).slice(0, 300));
        if (typeof result?.title !== 'string') throw new Error('Invalid PDF print result');
        const bytes = await job.window.webContents.printToPDF({
          landscape: true, pageSize: job.options.paper, printBackground: true,
          preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 },
          generateTaggedPDF: true,
        });
        if (job.cancelled || !canExport()) throw new Error('PDF export cancelled');
        const saved = await save(job, bytes, result.title);
        await finish(job, null, saved);
      } catch (error) { await finish(job, error); }
    },
  };
  for (const name of CHANNELS) ipcMain.handle(`folio:pdf:${name}`, handlers[name]);
  owner.on('close', cancelAll);
  owner.webContents.on('will-navigate', cancelAll);
  owner.webContents.on('render-process-gone', cancelAll);
  owner.webContents.on('destroyed', cancelAll);
  return {
    cancelAll,
    async dispose() {
      const pending = [...jobs.values()].map((job) => job.done);
      cancelAll();
      disposed = true;
      await Promise.all(pending);
      for (const name of CHANNELS) ipcMain.removeHandler(`folio:pdf:${name}`);
      owner.removeListener('close', cancelAll);
      owner.webContents.removeListener('will-navigate', cancelAll);
      owner.webContents.removeListener('render-process-gone', cancelAll);
      owner.webContents.removeListener('destroyed', cancelAll);
      exported.clear();
    },
  };
}

module.exports = { createPdfExporter };
