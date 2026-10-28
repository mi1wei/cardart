const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, readdir, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { test } = require('node:test');
const { createLog } = require('./log.cjs');

test('diagnostic logs redact access keys and license envelopes and remain bounded', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-log-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = createLog(join(root, 'desktop.log'), { maxBytes: 512 });
  await log('http://192.168.1.2:5197/?key=phone-secret Cookie: album_key=cookie-secret');
  await log('{"payload":"license-secret","signature":"signature-secret"}');
  await log('safe '.repeat(400));
  const files = await readdir(root);
  assert.ok(files.length <= 2);
  const contents = await Promise.all(files.map((file) => readFile(join(root, file), 'utf8')));
  for (const content of contents) {
    assert.doesNotMatch(content, /phone-secret|cookie-secret|license-secret|signature-secret/);
    assert.ok(Buffer.byteLength(content) <= 512);
  }
});

test('an unwritable diagnostic target is best-effort and does not poison later log writes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'folio-log-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'desktop.log');
  await mkdir(file);
  const log = createLog(file);
  await log('A diagnostic failure must not block core work');
  await rm(file, { recursive: true });
  await log('Recovered diagnostic output');
  assert.match(await readFile(file, 'utf8'), /Recovered diagnostic output/);
});
