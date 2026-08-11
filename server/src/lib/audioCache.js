import fs from 'node:fs';
import path from 'node:path';

/** Downloads and persists a recitation audio file to real storage, keyed by reciter+chapter so repeat exports reuse it. */
export async function ensureAudioCached(audioUrl, reciterId, chapterId, audioDir) {
  fs.mkdirSync(audioDir, { recursive: true });
  const ext = path.extname(new URL(audioUrl).pathname) || '.mp3';
  const cachePath = path.join(audioDir, `reciter-${reciterId}-chapter-${chapterId}${ext}`);

  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    return cachePath;
  }

  const res = await fetch(audioUrl);
  if (!res.ok) {
    throw new Error(`Failed to download audio (${res.status} ${res.statusText}): ${audioUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = `${cachePath}.download`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, cachePath);
  return cachePath;
}
