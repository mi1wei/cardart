const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const origin = 'http://localhost:5197';
const albumId = '00000000-0000-4000-8000-000000000001';
const options = { paper: 'A4', perPage: 2, quality: 'standard', cover: true, captions: true };

async function fixture(t, print = async () => Buffer.from('%PDF-1.7\nowned pdf')) {
  const { createPdfExporter } = require('./pdf-export.cjs');
  const dir = join(__dirname, `.pdf-test-${randomUUID()}`);
  await mkdir(dir);
  const handlers = new Map();
  const windows = [];
  const revealed = [];
  const owner = new EventEmitter();
  owner.isDestroyed = () => false;
  owner.webContents = Object.assign(new EventEmitter(), {
    getURL: () => `${origin}/#/albums`, isDestroyed: () => false,
    mainFrame: { url: `${origin}/#/albums` },
  });
  class PrintWindow extends EventEmitter {
    constructor(settings) {
      super(); this.settings = settings; this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: {}, setWindowOpenHandler: (fn) => { this.openHandler = fn; },
        getURL: () => this.url, isDestroyed: () => this.destroyed,
        printToPDF: async (config) => { this.printOptions = config; return print(); },
      });
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    async loadURL(url) { this.url = url; this.webContents.mainFrame.url = url; }
    destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('closed'); } }
  }
  let allowed = true;
  const exporter = createPdfExporter({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: (name) => handlers.delete(name) },
    BrowserWindow: PrintWindow, owner, getOrigin: () => origin, downloads: dir,
    shell: { showItemInFolder: (path) => revealed.push(path) }, canExport: () => allowed,
    timeoutMs: 1000,
  });
  const event = (contents = owner.webContents) => ({ sender: contents, senderFrame: contents.mainFrame });
  const invoke = (name, payload, sender) => handlers.get(`folio:pdf:${name}`)(event(sender), payload);
  async function begin(request = {}) {
    const requestId = randomUUID();
    const job = invoke('export', { requestId, albumId, options, language: 'en', ...request });
    await new Promise((resolve) => setImmediate(resolve));
    return { job, requestId, win: windows.at(-1) };
  }
  t.after(async () => { await exporter.dispose(); await rm(dir, { recursive: true, force: true }); });
  return { dir, handlers, windows, revealed, owner, invoke, begin, event, exporter, forbid: () => { allowed = false; } };
}

test('native export uses an isolated local print window and exclusively saves unique Downloads files', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.dir, 'Summer.pdf'), 'existing');
  const { job, win } = await f.begin();
  const config = await f.invoke('config', undefined, win.webContents);
  assert.equal(config.albumId, albumId);
  assert.equal(win.settings.webPreferences.sandbox, true);
  assert.equal(win.settings.webPreferences.nodeIntegration, false);
  assert.equal(win.openHandler({ url: 'https://example.com' }).action, 'deny');
  await f.invoke('ready', { title: 'Summer' }, win.webContents);
  const saved = await job;
  assert.equal(saved.name, 'Summer (2).pdf');
  assert.ok(saved.token);
  assert.equal(saved.path, undefined);
  assert.equal(await readFile(join(f.dir, 'Summer.pdf'), 'utf8'), 'existing');
  assert.match(await readFile(join(f.dir, saved.name), 'utf8'), /^%PDF/);
  assert.equal(win.printOptions.landscape, true);
  assert.equal(win.printOptions.pageSize, 'A4');
  assert.equal(win.destroyed, true);
  await f.invoke('reveal', saved.token);
  assert.deepEqual(f.revealed, [join(f.dir, saved.name)]);
  await assert.rejects(async () => f.invoke('reveal', join(f.dir, saved.name)), /Invalid|Unknown/);
});

test('IPC rejects remote/subframe senders, path or HTML payloads and unlicensed exports', async (t) => {
  const f = await fixture(t);
  const valid = { requestId: randomUUID(), albumId, options, language: 'en' };
  const handler = f.handlers.get('folio:pdf:export');
  await assert.rejects(async () => handler({ ...f.event(), senderFrame: { url: `${origin}/` } }, valid), /sender|Denied/i);
  f.owner.webContents.mainFrame.url = 'https://evil.example/';
  await assert.rejects(async () => handler(f.event(), valid), /sender|Denied/i);
  f.owner.webContents.mainFrame.url = `${origin}/`;
  for (const patch of [{ albumId: '../private' }, { html: '<script>evil()</script>' }, { path: '/private/file' }, { options: { ...options, paper: 'https://evil' } }]) {
    await assert.rejects(async () => f.invoke('export', { ...valid, ...patch }), /Invalid/);
  }
  f.forbid();
  await assert.rejects(async () => f.invoke('export', valid), /license|read.only/i);
  assert.equal(f.windows.length, 0);
});

test('cancellation during native rendering removes the job and never writes a partial PDF', async (t) => {
  let finish;
  const f = await fixture(t, () => new Promise((resolve) => { finish = resolve; }));
  const { job, win, requestId } = await f.begin();
  const rejected = assert.rejects(job, /cancel/i);
  const ready = f.invoke('ready', { title: '../../A:B' }, win.webContents);
  await new Promise((resolve) => setImmediate(resolve));
  await f.invoke('cancel', requestId);
  finish(Buffer.from('%PDF-1.7\ncancelled'));
  await ready;
  await rejected;
  assert.deepEqual(await readdir(f.dir), []);
  assert.equal(win.destroyed, true);
  await assert.rejects(async () => f.invoke('config', undefined, win.webContents), /sender|job|Denied/i);
});

test('print failures and unexpected window closure leave Downloads unchanged', async (t) => {
  const f = await fixture(t, async () => { throw new Error('Printer unavailable'); });
  const failed = await f.begin();
  const failure = assert.rejects(failed.job, /Printer unavailable/);
  await f.invoke('ready', { title: 'Summer' }, failed.win.webContents);
  await failure;
  const closed = await f.begin();
  const cancelled = assert.rejects(closed.job, /cancel|closed/i);
  closed.win.destroy();
  await cancelled;
  assert.deepEqual(await readdir(f.dir), []);
});

test('shutdown waits for a cancelled renderer and removes native handlers only after cleanup', async (t) => {
  let finish;
  const f = await fixture(t, () => new Promise((resolve) => { finish = resolve; }));
  const { job, win } = await f.begin();
  const cancelled = assert.rejects(job, /cancel/i);
  const ready = f.invoke('ready', { title: 'Closing' }, win.webContents);
  await new Promise((resolve) => setImmediate(resolve));
  let disposed = false;
  const disposal = f.exporter.dispose().then(() => { disposed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disposed, false);
  finish(Buffer.from('%PDF-1.7\nshutdown'));
  await Promise.all([ready, cancelled, disposal]);
  assert.equal(f.handlers.size, 0);
  assert.deepEqual(await readdir(f.dir), []);
});
