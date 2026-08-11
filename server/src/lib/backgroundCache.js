import fs from 'node:fs';
import path from 'node:path';
import { findClipById } from './backgroundLibrary.js';

const CLIP_FETCH_USER_AGENT = 'AyahStudio/0.1 (background-clip-fetch)';

function extensionFromUrl(url) {
  const match = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname);
  return match ? `.${match[1].toLowerCase()}` : '.mp4';
}

/** Downloads and persists a curated background clip to real storage, keyed by clip id so repeat exports reuse it. */
export async function ensureBackgroundClipCached(clipId, clipsDir) {
  const clip = findClipById(clipId);
  if (!clip) {
    throw new Error(`Unknown background clip id: ${clipId}`);
  }

  fs.mkdirSync(clipsDir, { recursive: true });
  const cachePath = path.join(clipsDir, `${clipId}${extensionFromUrl(clip.url)}`);

  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    return cachePath;
  }

  // Some sources (e.g. Wikimedia's Special:FilePath) redirect and require a UA.
  const res = await fetch(clip.url, { headers: { 'User-Agent': CLIP_FETCH_USER_AGENT }, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download background clip "${clipId}" (${res.status} ${res.statusText}): ${clip.url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = `${cachePath}.download`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, cachePath);
  return cachePath;
}
