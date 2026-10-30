export const MAX_VIDEO_BYTES = 1_000_000_000;
export const MAX_POSTER_BYTES = 10 * 1024 * 1024;
export const MAX_POSTER_EDGE = 1600;
export const MAX_VIDEO_DIMENSION = 65_535;

export function mediaCounts(items) {
  const videoCount = items.filter((item) => item.kind === 'video').length;
  return { count: items.length, photoCount: items.length - videoCount, videoCount };
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
