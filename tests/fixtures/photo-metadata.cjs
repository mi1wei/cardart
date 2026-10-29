const sharp = require('sharp');

async function photoBytes({ format = 'jpeg', exif = {}, width = 12, height = 8 } = {}) {
  let image = sharp({ create: { width, height, channels: 3, background: '#a32f2f' } })[format]();
  if (exif !== null) image = image.withExif({
    IFD0: { Make: 'Folio Test', Model: 'Synthetic Camera', Orientation: '6' },
    IFD2: {
      DateTimeOriginal: '2026:08:15 09:30:00',
      OffsetTimeOriginal: '+09:00',
      SubSecTimeOriginal: '125',
      LensModel: 'Folio Prime 35',
      ExposureTime: '1/200',
      FNumber: '28/10',
      ISOSpeedRatings: '200',
      FocalLength: '35/1',
    },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '0/1 0/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '0/1 0/1 0/1' },
    ...exif,
  }).withMetadata({ orientation: 6 });
  return image.toBuffer();
}

module.exports = { photoBytes };
