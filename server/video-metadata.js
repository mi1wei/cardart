export function makeVideoMetadata({ format, bytes, lastModified }) {
  const validTime = Number.isSafeInteger(lastModified) && lastModified >= 0 && lastModified <= 253402300799999;
  return {
    schemaVersion: 1, kind: 'video', format, bytes,
    dimensionsSource: 'browser', durationSource: 'browser',
    fileModifiedAt: validTime ? new Date(lastModified).toISOString() : null,
    fileTimeSource: validTime ? 'source-file' : null,
  };
}

export function isVideoMetadata(value) {
  if (!value || value.schemaVersion !== 1 || value.kind !== 'video' || !['mp4', 'mov', 'm4v'].includes(value.format) ||
      value.dimensionsSource !== 'browser' || value.durationSource !== 'browser' ||
      !(value.bytes === null || (Number.isSafeInteger(value.bytes) && value.bytes >= 0))) return false;
  if (value.fileModifiedAt === null) return value.fileTimeSource === null;
  if (typeof value.fileModifiedAt !== 'string' || value.fileTimeSource !== 'source-file') return false;
  const time = Date.parse(value.fileModifiedAt);
  return Number.isFinite(time) && time >= 0 && time <= 253402300799999 &&
    new Date(time).toISOString() === value.fileModifiedAt;
}

export async function readVideoMetadata(file, item) {
  if (isVideoMetadata(item.metadata)) return item.metadata;
  const info = await stat(file).catch(() => null);
  const format = extname(item.file).slice(1).toLowerCase();
  return makeVideoMetadata({
    format: ['mp4', 'mov', 'm4v'].includes(format) ? format : null,
    bytes: info?.isFile() && Number.isSafeInteger(info.size) ? info.size : null,
  });
}
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
