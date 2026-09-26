import sharp from 'sharp';

const FORMATS = new Set(['jpeg', 'png', 'webp']);
export const MAX_SIDE = 4000;

export class BadImage extends Error {}

// Checks what the file really is (libvips reads the magic bytes, the client's mimetype is not trusted)
// and returns a copy without metadata for public storage: phone photos carry GPS position, device
// model and serials in EXIF. Orientation is applied first so the stripped copy still displays upright.
export async function cleanImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new BadImage('Only JPEG, PNG or WebP images are allowed');
  }
  if (!FORMATS.has(meta.format)) throw new BadImage('Only JPEG, PNG or WebP images are allowed');
  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) {
    throw new BadImage(`Image is too large (max ${MAX_SIDE} px per side)`);
  }
  // HOOK (field-location feature, not built yet): read GPS from meta.exif here, before it is stripped.
  try {
    // png: no quality option, it would switch sharp to a lossy palette
    return await sharp(buffer).rotate().toFormat(meta.format, meta.format === 'png' ? {} : { quality: 90 }).toBuffer();
  } catch {
    throw new BadImage('The uploaded file is not a readable image'); // valid header, broken body
  }
}
