async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  license: () => call('GET', '/api/license'),
  activateLicense: (envelope) => call('POST', '/api/license', envelope),
  albums: () => call('GET', '/api/albums'),
  album: (id) => call('GET', `/api/albums/${id}`),
  createAlbum: (title) => call('POST', '/api/albums', { title }),
  updateAlbum: (id, patch) => call('PATCH', `/api/albums/${id}`, patch),
  deleteAlbum: (id) => call('DELETE', `/api/albums/${id}`),
  deletePhotos: (id, ids) => call('POST', `/api/albums/${id}/photos/delete`, { ids }),
  phone: () => call('GET', '/api/phone'),
  setPhone: (enabled) => call('PATCH', '/api/phone', { enabled }),
  async upload(id, file) {
    const time = Number.isSafeInteger(file.lastModified) && file.lastModified >= 0 ? `&lastModified=${file.lastModified}` : '';
    const res = await fetch(`/api/albums/${id}/photos?name=${encodeURIComponent(file.name)}${time}`, {
      method: 'POST',
      headers: { 'X-Album-Upload': '1' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  },
};

export const mediaUrl = (albumId, photoId, size) => `/media/${albumId}/${photoId}/${size}`;
