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

const LOGO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

/**
 * Persists an uploaded logo to real storage, keyed by a server-generated
 * UUID filename -- the client's original filename and declared Content-Type
 * are never used to construct a filesystem path (path traversal) or to
 * decide trust (a renamed .exe can claim to be image/png). The buffer is
 * only accepted after ffprobe confirms it decodes as a real image in an
 * allowed format, which is the actual security boundary here, not the
 * multer-level mimetype filter (that's just a cheap first pass).
 */
export async function persistLogoUpload(buffer, uploadsDir, tmpDir) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const tmpPath = path.join(tmpDir, `logo-upload-${randomUUID()}.tmp`);
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

    const logoId = `${randomUUID()}.${extension}`;
    const finalPath = path.join(uploadsDir, logoId);
    moveFile(tmpPath, finalPath);

    return { logoId, width: stream.width, height: stream.height };
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

/** Resolves a logoId back to its real file path. Rejects anything that isn't exactly the UUID.ext shape we generate -- the only defense a path-traversal attempt needs to clear, and it can't. */
export function resolveUploadedLogoPath(logoId, uploadsDir) {
  if (typeof logoId !== 'string' || !LOGO_ID_PATTERN.test(logoId)) {
    throw new Error(`Invalid logoId: "${logoId}"`);
  }
  const fullPath = path.join(uploadsDir, logoId);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Uploaded logo not found: ${logoId}`);
  }
  return fullPath;
}
