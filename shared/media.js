export const MAX_VIDEO_BYTES = 1_000_000_000;
export const MAX_POSTER_BYTES = 10 * 1024 * 1024;
export const MAX_POSTER_EDGE = 1600;
export const MAX_VIDEO_DIMENSION = 65_535;

export function mediaCounts(items) {
  const videoCount = items.filter((item) => item.kind === 'video').length;
  return { count: items.length, photoCount: items.length - videoCount, videoCount };
}
