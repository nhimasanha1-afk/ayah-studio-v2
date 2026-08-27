import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { probe } from './ffmpeg.js';
import { moveFile } from './moveFile.js';

const MAX_DIMENSION = 4000;

// Server decides the extension from the validated, real image format --
// never from the client-supplied filename or Content-Type header, both of
// which are easy to spoof.
const CODEC_TO_EXTENSION = {
  png: 'png',
  mjpeg: 'jpg',
  webp: 'webp',
};

// The "img-" prefix (unlike logoUpload.js's bare UUID.ext ids) is what lets
// surahExport's single cardBackgroundClipId field tell an uploaded card
// image apart from an uploaded background video/curated library clip id
// without checking multiple directories.
const CARD_IMAGE_ID_PATTERN = /^img-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

/**
 * Persists an uploaded intro/outro card background image -- same
 * content-validation pattern as logoUpload.js: the buffer is only accepted
 * after ffprobe confirms it decodes as a real image in an allowed format,
 * which is the actual security boundary, not multer's mimetype filter (a
 * cheap first pass only).
 */
export async function persistCardImageUpload(buffer, uploadsDir, tmpDir) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const tmpPath = path.join(tmpDir, `card-image-upload-${randomUUID()}.tmp`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    let info;
    try {
      info = await probe(tmpPath);
    } catch {
      throw new Error('File is not a decodable image.');
    }

    const stream = info.streams?.find((s) => s.codec_type === 'video');
    if (!stream) {
      throw new Error('File is not a decodable image.');
    }

    const extension = CODEC_TO_EXTENSION[stream.codec_name];
    if (!extension) {
      throw new Error(`Unsupported image format "${stream.codec_name}". Use PNG, JPEG, or WebP.`);
    }

    if (!stream.width || !stream.height) {
      throw new Error('Could not determine image dimensions.');
    }
    if (stream.width > MAX_DIMENSION || stream.height > MAX_DIMENSION) {
      throw new Error(`Image is too large (max ${MAX_DIMENSION}x${MAX_DIMENSION}px).`);
    }

    const imageId = `img-${randomUUID()}.${extension}`;
    const finalPath = path.join(uploadsDir, imageId);
    moveFile(tmpPath, finalPath);

    return { imageId, width: stream.width, height: stream.height };
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

/** True when id is shaped like a server-generated uploaded-card-image id. */
export function isUploadedCardImageId(imageId) {
  return typeof imageId === 'string' && CARD_IMAGE_ID_PATTERN.test(imageId);
}

/** Resolves an imageId back to its real file path. Rejects anything that isn't exactly the img-UUID.ext shape we generate -- the only defense a path-traversal attempt needs to clear, and it can't. */
export function resolveUploadedCardImagePath(imageId, uploadsDir) {
  if (!isUploadedCardImageId(imageId)) {
    throw new Error(`Invalid card image id: "${imageId}"`);
  }
  const fullPath = path.join(uploadsDir, imageId);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Uploaded card image not found: ${imageId}`);
  }
  return fullPath;
}
