const { test } = require('node:test');
const assert = require('node:assert/strict');

const album = {
  id: '00000000-0000-4000-8000-000000000001', title: '<Summer>', perPage: 1, cover: 'p002',
  photos: [
    { id: 'p001', file: 'p001.jpg', w: 200, h: 100, note: 'A caption' },
    { id: 'p002', w: 100, h: 200, kind: 'video', note: 'A film' },
    { id: 'p003', w: 100, h: 100 },
  ],
};

test('print pagination keeps every book rectangle in millimetres and counts cover separately', async () => {
  const { buildPrintModel } = await import('../src/print-layout.js');
  const { layoutPages } = await import('../src/book/layout.js');
  const model = buildPrintModel(album);
  assert.equal(model.pages.length, 4);
  assert.equal(model.pages[0].kind, 'cover');
  assert.equal(model.pages[0].photo.id, 'p002');
  const book = layoutPages([2, 0.5, 1], 1);
  for (let i = 0; i < book.length; i++) {
    assert.deepEqual(model.pages[i + 1].rects, book[i].rects);
  }
  assert.deepEqual(model.paper, { width: 297, height: 210 });
  assert.equal(model.pages[1].photos[0].caption, 'A caption');
  assert.equal(model.pages[2].photos[0].video, true);
});

test('quality selects printable stills, never movie originals, and toggles remove captions and cover', async () => {
  const { buildPrintModel } = await import('../src/print-layout.js');
  const model = buildPrintModel(album, { paper: 'Letter', quality: 'high', captions: false, cover: false });
  assert.equal(model.pages.length, 3);
  assert.deepEqual(model.paper, { width: 279.4, height: 215.9 });
  assert.equal(model.pages[0].photos[0].url, `/media/${album.id}/p001/original`);
  assert.equal(model.pages[1].photos[0].url, `/media/${album.id}/p002/1600`);
  assert.equal(model.pages[0].photos[0].caption, '');
  const standard = buildPrintModel(album, { quality: 'standard' });
  assert.equal(standard.pages[1].photos[0].url, `/media/${album.id}/p001/1600`);
});

test('invalid dimensions cannot break pagination and empty albums have only an optional cover', async () => {
  const { buildPrintModel } = await import('../src/print-layout.js');
  const model = buildPrintModel({ ...album, photos: [{ id: 'p001', w: 0, h: NaN }] });
  assert.equal(model.pages.length, 2);
  assert.ok(model.pages[1].rects.every((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite)));
  assert.equal(buildPrintModel({ ...album, photos: [] }).pages.length, 1);
  assert.equal(buildPrintModel({ ...album, photos: [] }, { cover: false }).pages.length, 0);
});

test('high-quality HEIC and TIFF photos use decoded printable stills instead of unsupported originals', async () => {
  const { buildPrintModel } = await import('../src/print-layout.js');
  const model = buildPrintModel({
    ...album, photos: [
      { id: 'p001', file: 'p001.heic', w: 100, h: 100 },
      { id: 'p002', file: 'p002.tif', w: 100, h: 100 },
    ],
  }, { quality: 'high', cover: false });
  assert.deepEqual(model.pages.flatMap((page) => page.photos.map((photo) => photo.url)), [
    `/media/${album.id}/p001/1600`, `/media/${album.id}/p002/1600`,
  ]);
});
