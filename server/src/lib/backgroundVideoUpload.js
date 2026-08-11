import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { probe } from './ffmpeg.js';

const MAX_DIMENSION = 4000;
const MAX_DURATION_SECONDS = 10 * 60; // background clips are looped/trimmed anyway; this just bounds abuse

// Server decides the extension from ffprobe's real detected container --
// never from the client-supplied filename or Content-Type header, both of
// which are easy to spoof.
const FORMAT_TO_EXTENSION = {
  'mov,mp4,m4a,3gp,3g2,mj2': 'mp4',
  'matroska,webm': 'webm',
  ogg: 'ogv',
};

const UPLOADED_CLIP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm|ogv)$/;

/**
 * Persists an uploaded background video to real storage, keyed by a
 * server-generated UUID filename -- same content-validation pattern as
 * persistLogoUpload: the buffer is only accepted after ffprobe confirms it
 * decodes as a real video in an allowed container, which is the actual
 * security boundary, not multer's mimetype filter (a cheap first pass only).
 */
export async function persistBackgroundVideoUpload(buffer, uploadsDir, tmpDir) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const tmpPath = path.join(tmpDir, `bgvideo-upload-${randomUUID()}.tmp`);
  fs.writeFileSync(tmpPath, buffer);

  try {
    let info;
    try {
      info = await probe(tmpPath);
    } catch {
      throw new Error('File is not a decodable video.');
    }

    const stream = info.streams?.find((s) => s.codec_type === 'video');
    if (!stream) {
      throw new Error('File has no decodable video stream.');
    }

    const extension = FORMAT_TO_EXTENSION[info.format?.format_name];
    if (!extension) {
      throw new Error(`Unsupported video container "${info.format?.format_name}". Use MP4, WebM, or Ogg.`);
    }

    if (!stream.width || !stream.height) {
      throw new Error('Could not determine video dimensions.');
    }
    if (stream.width > MAX_DIMENSION || stream.height > MAX_DIMENSION) {
      throw new Error(`Video is too large (max ${MAX_DIMENSION}x${MAX_DIMENSION}px).`);
    }

    const durationSeconds = Number(info.format?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Could not determine video duration.');
    }
    if (durationSeconds > MAX_DURATION_SECONDS) {
      throw new Error(`Video is too long (max ${MAX_DURATION_SECONDS / 60} minutes).`);
    }

    const clipId = `${randomUUID()}.${extension}`;
    const finalPath = path.join(uploadsDir, clipId);
    fs.renameSync(tmpPath, finalPath);

    return { clipId, width: stream.width, height: stream.height, durationSeconds };
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

/** True when clipId is shaped like a server-generated uploaded-clip id, as opposed to a curated library id. */
export function isUploadedBackgroundClipId(clipId) {
  return typeof clipId === 'string' && UPLOADED_CLIP_ID_PATTERN.test(clipId);
}

/** Resolves an uploaded clipId back to its real file path. Rejects anything that isn't exactly the UUID.ext shape we generate -- the only defense a path-traversal attempt needs to clear, and it can't. */
export function resolveUploadedBackgroundVideoPath(clipId, uploadsDir) {
  if (!isUploadedBackgroundClipId(clipId)) {
    throw new Error(`Invalid uploaded background clipId: "${clipId}"`);
  }
  const fullPath = path.join(uploadsDir, clipId);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Uploaded background clip not found: ${clipId}`);
  }
  return fullPath;
}
