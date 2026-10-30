async function call(method, path, body, { signal } = {}) {
  const res = await fetch(path, {
    method,
    signal,
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
  album: (id, options) => call('GET', `/api/albums/${id}`, undefined, options),
  photoDetails: (id, photoId, options) => call('GET', `/api/albums/${id}/photos/${photoId}/details`, undefined, options),
  updatePhotoNote: (id, photoId, note, previousNote) => call('PATCH', `/api/albums/${id}/photos/${photoId}/note`, { note, previousNote }),
  createAlbum: (title) => call('POST', '/api/albums', { title }),
  updateAlbum: (id, patch) => call('PATCH', `/api/albums/${id}`, patch),
  deleteAlbum: (id) => call('DELETE', `/api/albums/${id}`),
  deletePhotos: (id, ids) => call('POST', `/api/albums/${id}/photos/delete`, { ids }),
  phone: () => call('GET', '/api/phone'),
  setPhone: (enabled) => call('PATCH', '/api/phone', { enabled }),
  async upload(id, file, { signal } = {}) {
    const time = Number.isSafeInteger(file.lastModified) && file.lastModified >= 0 ? `&lastModified=${file.lastModified}` : '';
    const res = await fetch(`/api/albums/${id}/photos?name=${encodeURIComponent(file.name)}${time}`, {
      method: 'POST',
      signal,
      headers: { 'X-Album-Upload': '1' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  },
  uploadVideo(id, file, probe, onProgress, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const body = new Blob([probe.poster, file]);
    const query = new URLSearchParams({
      kind: 'video', name: file.name, posterBytes: String(probe.poster.size),
      w: String(probe.w), h: String(probe.h), duration: String(probe.duration),
    });
    if (Number.isSafeInteger(file.lastModified) && file.lastModified >= 0) query.set('lastModified', String(file.lastModified));
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      const progress = (event) => onProgress?.({ stage: 'uploading', loaded: event.loaded, total: event.lengthComputable ? event.total : body.size });
      const saving = () => onProgress?.({ stage: 'saving', loaded: body.size, total: body.size });
      function finish(error, data) {
        if (settled) return;
        settled = true;
        xhr.upload.removeEventListener('progress', progress);
        xhr.upload.removeEventListener('load', saving);
        for (const [event, listener] of Object.entries(listeners)) xhr.removeEventListener(event, listener);
        signal?.removeEventListener('abort', cancel);
        if (error) reject(error);
        else resolve(data);
      }
      const cancelled = () => finish(new DOMException('Aborted', 'AbortError'));
      const cancel = () => { xhr.abort(); cancelled(); };
      const listeners = {
        load() {
          let data;
          try { data = JSON.parse(xhr.responseText); }
          catch { return finish(Object.assign(new Error('Invalid upload response'), { code: 'bad-response', status: xhr.status })); }
          if (xhr.status < 200 || xhr.status >= 300) return finish(Object.assign(new Error(data?.error || `HTTP ${xhr.status}`), { status: xhr.status }));
          if (!(data?.photo?.kind === 'video' && typeof data.photo.id === 'string') &&
              !['duplicate', 'unsupported', 'too-large'].includes(data?.skipped)) {
            return finish(Object.assign(new Error('Invalid upload response'), { code: 'bad-response' }));
          }
          finish(null, data);
        },
        error: () => finish(Object.assign(new Error('Video upload failed'), { code: 'network' })),
        timeout: () => finish(Object.assign(new Error('Video upload failed'), { code: 'network' })),
        abort: cancelled,
      };
      xhr.open('POST', `/api/albums/${id}/photos?${query}`);
      xhr.setRequestHeader('X-Album-Upload', '1');
      xhr.upload.addEventListener('progress', progress);
      xhr.upload.addEventListener('load', saving);
      for (const [event, listener] of Object.entries(listeners)) xhr.addEventListener(event, listener);
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        onProgress?.({ stage: 'uploading', loaded: 0, total: body.size });
        xhr.send(body);
      } catch (error) { finish(error); }
    });
  },
};

export const mediaUrl = (albumId, photoId, size) => `/media/${albumId}/${photoId}/${size}`;
