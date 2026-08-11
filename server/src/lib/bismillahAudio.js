import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { fetchReciterAudioFile } from './quranApi.js';
import { ensureAudioCached } from './audioCache.js';
import { probe } from './ffmpeg.js';

const AL_FATIHA_CHAPTER_ID = 1;

/**
 * Bismillah has no standalone per-reciter audio file in the Quran.com/qdc
 * API -- it's verse 1 of Al-Fatiha. We source it for real by downloading
 * the reciter's actual Al-Fatiha recitation and cropping at the real
 * forced-alignment boundary where verse 2 begins (verse_timings[1].timestamp_from),
 * rather than trusting verse 1's own end-timestamp (which can be short of
 * the true audio). The crop is then re-probed for its own real decoded
 * duration, which is what callers must use -- never the timing-data value.
 */
export async function ensureBismillahAudioCached(reciterId, audioDir) {
  fs.mkdirSync(audioDir, { recursive: true });
  const clipPath = path.join(audioDir, `bismillah-reciter-${reciterId}.mp3`);

  if (fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0) {
    const clipProbe = await probe(clipPath);
    return { clipPath, durationMs: Math.round(Number(clipProbe.format.duration) * 1000) };
  }

  const audioFile = await fetchReciterAudioFile(reciterId, AL_FATIHA_CHAPTER_ID);
  const fullFatihaPath = await ensureAudioCached(audioFile.audio_url, reciterId, AL_FATIHA_CHAPTER_ID, audioDir);

  const verse2Timing = audioFile.verse_timings.find((vt) => vt.verse_key === '1:2');
  if (!verse2Timing) {
    throw new Error(`Could not find verse 1:2 timing for reciter ${reciterId} to locate the Bismillah boundary`);
  }
  const cutSeconds = verse2Timing.timestamp_from / 1000;

  const tmpPath = clipPath.replace(/\.mp3$/, '.tmp.mp3');
  execFileSync(ffmpegPath, ['-y', '-i', fullFatihaPath, '-to', String(cutSeconds), '-c', 'copy', tmpPath]);
  fs.renameSync(tmpPath, clipPath);

  const clipProbe = await probe(clipPath);
  return { clipPath, durationMs: Math.round(Number(clipProbe.format.duration) * 1000) };
}
