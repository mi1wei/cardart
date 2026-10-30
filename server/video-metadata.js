export function makeVideoMetadata({ format, bytes, lastModified }) {
  const validTime = Number.isSafeInteger(lastModified) && lastModified >= 0 && lastModified <= 253402300799999;
  return {
    schemaVersion: 1, kind: 'video', format, bytes,
    dimensionsSource: 'browser', durationSource: 'browser',
    fileModifiedAt: validTime ? new Date(lastModified).toISOString() : null,
    fileTimeSource: validTime ? 'source-file' : null,
  };
}
