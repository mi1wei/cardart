import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import exifr from 'exifr';
import { MAX_BYTES } from './image-limits.js';

const TAGS = [
  'Make', 'Model', 'LensModel', 'Orientation', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength',
  'DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTimeDigitized', 'SubSecTimeOriginal', 'SubSecTimeDigitized',
  'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef',
];
const text = (value) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 200) || null : null;
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const orientation = (value) => Number.isInteger(value) && value >= 1 && value <= 8 ? value : null;

function captureTime(tags) {
  for (const [source, offsetKey, subsecondKey] of [
    ['DateTimeOriginal', 'OffsetTimeOriginal', 'SubSecTimeOriginal'],
    ['CreateDate', 'OffsetTimeDigitized', 'SubSecTimeDigitized'],
  ]) {
    const raw = text(tags[source]);
    const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw || '');
    if (!match) continue;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
      date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) continue;
    const offsetValue = text(tags[offsetKey]);
    const offset = /^([+-])(\d{2}):(\d{2})$/.exec(offsetValue || '');
    const validOffset = offset && Number(offset[2]) <= 14 && Number(offset[3]) < 60 && (Number(offset[2]) < 14 || Number(offset[3]) === 0);
    const subsecond = text(tags[subsecondKey]);
    // Validate the calendar in UTC, but retain the camera's wall clock without inventing a timezone.
    return {
      raw, local: `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`,
      offset: validOffset ? offsetValue : null,
      subsecond: /^\d{1,9}$/.test(subsecond || '') ? subsecond : null,
      source,
    };
  }
  return null;
}

function coordinate(values, ref, plus, minus, limit) {
  if (!Array.isArray(values) || values.length !== 3 || !values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0) ||
    ![plus, minus].includes(ref) || values[1] >= 60 || values[2] >= 60) return null;
  const value = values[0] + values[1] / 60 + values[2] / 3600;
  return value <= limit ? (ref === minus ? -value : value) : null;
}

export function isPhotoMetadata(value) {
  if (!value || value.schemaVersion !== 1 || !['ready', 'none', 'unreadable'].includes(value.exifStatus)) return false;
  const nullableText = (item) => item === null || (typeof item === 'string' && item.length <= 200);
  if (!['format', 'fileModifiedAt', 'cameraMake', 'cameraModel', 'lensModel'].every((key) => nullableText(value[key])) ||
    ![null, 'source-file', 'library-copy'].includes(value.fileTimeSource) ||
    !(value.bytes === null || (Number.isSafeInteger(value.bytes) && value.bytes >= 0)) ||
    !(value.orientation === null || orientation(value.orientation) !== null) ||
    !['exposureTime', 'fNumber', 'iso', 'focalLength'].every((key) => value[key] === null || positive(value[key]) !== null)) return false;
  const location = value.latitude === null && value.longitude === null ||
    typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
  const time = value.takenAt;
  return location && (time === null || time && ['DateTimeOriginal', 'CreateDate'].includes(time.source) &&
    typeof time.raw === 'string' && typeof time.local === 'string' && nullableText(time.offset) && nullableText(time.subsecond));
}

export async function readPhotoMetadata(file, { format = null, byteLength, fileModifiedAt, fileTimeSource } = {}) {
  const result = {
    schemaVersion: 1, exifStatus: 'unreadable', format, bytes: Number.isSafeInteger(byteLength) && byteLength >= 0 ? byteLength : null,
    fileModifiedAt: null, fileTimeSource: null, takenAt: null, latitude: null, longitude: null,
    cameraMake: null, cameraModel: null, lensModel: null, orientation: null,
    exposureTime: null, fNumber: null, iso: null, focalLength: null,
  };
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_BYTES) return result;
    result.bytes = info.size;
    const sourceTime = Number.isSafeInteger(fileModifiedAt) && fileModifiedAt >= 0 && fileModifiedAt <= 253402300799999;
    result.fileModifiedAt = new Date(sourceTime ? fileModifiedAt : info.mtimeMs).toISOString();
    result.fileTimeSource = sourceTime && fileTimeSource === 'source-file' ? 'source-file' : 'library-copy';
    const image = await sharp(file).metadata();
    result.format = image.format === 'heif' && image.compression === 'av1' ? 'avif' : image.format;
    result.orientation = orientation(image.orientation);
    if (!image.exif) return { ...result, exifStatus: 'none' };
    if (image.exif.length > 1024 * 1024) return result;
    // libvips selects the primary HEIF item's EXIF; JPEG includes a prefix that PNG/HEIF may omit.
    const bytes = image.exif.subarray(image.exif.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? 6 : 0);
    const tags = await exifr.parse(bytes, {
      pick: TAGS, reviveValues: false, translateValues: false, silentErrors: false,
      xmp: false, iptc: false, icc: false, jfif: false, ihdr: false,
    });
    if (!tags) return result;
    const latitude = coordinate(tags.GPSLatitude, tags.GPSLatitudeRef, 'N', 'S', 90);
    const longitude = coordinate(tags.GPSLongitude, tags.GPSLongitudeRef, 'E', 'W', 180);
    return {
      ...result, exifStatus: 'ready',
      takenAt: captureTime(tags),
      latitude: latitude !== null && longitude !== null ? latitude : null,
      longitude: latitude !== null && longitude !== null ? longitude : null,
      cameraMake: text(tags.Make), cameraModel: text(tags.Model), lensModel: text(tags.LensModel),
      orientation: orientation(tags.Orientation) ?? result.orientation,
      exposureTime: positive(tags.ExposureTime), fNumber: positive(tags.FNumber),
      iso: positive(tags.ISO), focalLength: positive(tags.FocalLength),
    };
  } catch {
    return result;
  }
}
