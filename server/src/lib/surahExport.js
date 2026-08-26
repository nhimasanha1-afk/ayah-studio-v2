import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ffmpegPath as ffmpegPathBin } from './ffmpegBinaries.js';
import { probe } from './ffmpeg.js';
import { fetchChapter, fetchVerses, fetchReciterAudioFile } from './quranApi.js';
import { ensureAudioCached } from './audioCache.js';
import { ensureBismillahAudioCached } from './bismillahAudio.js';
import { buildCaptionData, shiftCaptionData } from './captionData.js';
import { buildAssSubtitles } from './assBuilder.js';
import { buildSrt } from './srtBuilder.js';
import { ensureStaticBackground } from './staticBackground.js';
import { ensurePlaceholderLogo } from './channelLogo.js';
import { resolveUploadedLogoPath } from './logoUpload.js';
import { ensureBackgroundClipCached } from './backgroundCache.js';
import { isUploadedBackgroundClipId, resolveUploadedBackgroundVideoPath } from './backgroundVideoUpload.js';
import { resolvePlaybackOrder, planBackgroundSequence } from './backgroundSequence.js';
import { buildBackgroundFilterGraph } from './backgroundFilterGraph.js';
import { buildFilterComplex, buildAudioFilterComplex } from './videoComposition.js';
import { resolveStyle } from './styleConfig.js';
import { computeIntroTimingWindow } from './introTiming.js';
import { getCanvasDimensions, getScaleFactor } from './layout.js';
import {
  FONTS_DIR,
  AUDIO_DIR,
  BACKGROUNDS_DIR,
  BACKGROUND_CLIPS_DIR,
  LOGOS_DIR,
  LOGO_UPLOADS_DIR,
  BACKGROUND_UPLOADS_DIR,
  TMP_DIR,
} from './paths.js';

export const DEFAULT_TRANSLATION_ID = 20; // Saheeh International
export const DEFAULT_RECITER_ID = 7; // Mishari Rashid al-`Afasy
const DEFAULT_SLOT_DURATION_SECONDS = 8;
const DEFAULT_TRANSITION_DURATION_SECONDS = 1;

/**
 * Runs the ffmpeg composition asynchronously (spawn, not execFileSync) so
 * real encode progress can be tracked: ffmpeg's -progress pipe:1 emits
 * out_time_us periodically, which -- divided by the known target duration
 * -- is a real completion fraction, not a fabricated estimate.
 */
function composeVideo({ inputs, durationSeconds, outputPath, filterComplex, audioMapLabel, onProgress }) {
  const args = ['-y'];
  for (const input of inputs) {
    if (input.streamLoop) args.push('-stream_loop', '-1', '-t', String(input.duration));
    if (input.loop) args.push('-loop', '1');
    args.push('-i', input.path);
  }
  args.push(
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', audioMapLabel,
    '-c:v', 'libx264',
    // libx264 defaults to the "medium" preset, which uses a larger
    // motion-estimation search range, more reference frames, and a bigger
    // lookahead buffer than faster presets. Measured directly against a
    // real 2-clip crossfade export: medium peaks at 559MB working set,
    // veryfast at 456MB -- a ~100MB real reduction, and the likely cause of
    // an observed production OOM crash on a 512MB-RAM host (medium's 559MB
    // alone exceeds that ceiling before Node's own overhead is added).
    // CRF is unset so quality target is unaffected, only encode speed and
    // compression efficiency.
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(durationSeconds),
    '-shortest',
    '-progress', 'pipe:1',
    '-nostats',
    outputPath
  );

  console.log('[ffmpeg] spawned with filter_complex:', filterComplex);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPathBin, args);
    let stderrTail = '';
    let stdoutBuf = '';

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key === 'out_time_us' && value && value.trim() !== 'N/A') {
          const seconds = Number(value) / 1_000_000;
          onProgress?.(Math.max(0, Math.min(1, seconds / durationSeconds)));
        }
        if (key === 'progress' && value?.trim() === 'end') {
          onProgress?.(1);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderrTail}`));
    });
  });
}

/**
 * Resolves the background: either a static placeholder image (default,
 * unchanged from steps 1-4) or a real rotating clip pool with crossfades,
 * when background.clipIds is non-empty. Returns the ffmpeg inputs to
 * prepend and the label the rest of the graph should read the background
 * from.
 */
async function resolveBackground({ background, totalDurationSeconds, canvasWidth, canvasHeight }) {
  const clipIds = background.clipIds ?? [];
  if (clipIds.length === 0) {
    const backgroundPath = ensureStaticBackground(BACKGROUNDS_DIR, canvasWidth, canvasHeight);
    return { inputs: [{ path: backgroundPath, loop: true }], backgroundInputLabel: '0:v' };
  }

  const order = background.order ?? 'sequential';
  const slotDurationSeconds = background.slotDurationSeconds ?? DEFAULT_SLOT_DURATION_SECONDS;
  const transitionDurationSeconds = background.transitionDurationSeconds ?? DEFAULT_TRANSITION_DURATION_SECONDS;
  const transitionStyle = background.transitionStyle ?? 'fade';

  const cachedPaths = new Map();
  for (const clipId of clipIds) {
    // Uploaded clips are already real files on disk (validated at upload
    // time); curated library clips are lazily downloaded/cached by id.
    const clipPath = isUploadedBackgroundClipId(clipId)
      ? resolveUploadedBackgroundVideoPath(clipId, BACKGROUND_UPLOADS_DIR)
      : await ensureBackgroundClipCached(clipId, BACKGROUND_CLIPS_DIR);
    cachedPaths.set(clipId, clipPath);
  }

  const orderedClips = resolvePlaybackOrder(clipIds, order);
  const instances = planBackgroundSequence({
    orderedClips,
    totalDurationSeconds,
    slotDurationSeconds,
    transitionDurationSeconds,
  });

  const { filterParts, outputLabel, requiredSpanSeconds } = buildBackgroundFilterGraph({
    instances,
    slotDurationSeconds,
    transitionDurationSeconds,
    transitionStyle,
    inputIndexOffset: 0,
    canvasWidth,
    canvasHeight,
  });

  const inputs = instances.map((instance) => ({
    path: cachedPaths.get(instance.clip),
    streamLoop: true,
    duration: requiredSpanSeconds,
  }));

  return { inputs, backgroundInputLabel: outputLabel, backgroundFilterParts: filterParts, instances };
}

/**
 * Full step-2/3/4/5 pipeline: real verse text/translation + real word-by-word
 * timing + real recitation audio, rendered as synced, styled captions,
 * optionally preceded by an intro/Bismillah window, over either a static
 * placeholder or a real rotating background clip pool with crossfades.
 */
export async function runSurahExport({
  chapterId,
  reciterId = DEFAULT_RECITER_ID,
  translationId = DEFAULT_TRANSLATION_ID,
  translationLanguage,
  outputPath,
  style: styleOverrides = {},
  intro: introOverrides = {},
  outro: outroOverrides = {},
  background: backgroundOverrides = {},
  audioSync: audioSyncOverrides = {},
  captionTiming: captionTimingOverrides = {},
  resolution = '720p',
  aspectRatio = '16:9',
  onProgress,
}) {
  const report = (stage, fraction = null) => onProgress?.(stage, fraction);

  const style = resolveStyle(styleOverrides);
  const introCardEnabled = Boolean(introOverrides.introCardEnabled);
  const bismillahTextEnabled = Boolean(introOverrides.bismillahTextEnabled);
  const bismillahAudioEnabled = Boolean(introOverrides.bismillahAudioEnabled);
  const introCardDurationMs = introOverrides.introCardDurationMs ?? 3000;
  const audioSyncOffsetMs = Number(audioSyncOverrides.offsetMs ?? 0);
  const volumeMultiplier = Number(audioSyncOverrides.volumeMultiplier ?? 1);
  const verseDisplayDelayMs = Number(captionTimingOverrides.displayDelayMs ?? 0);
  const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(aspectRatio, resolution);
  const scaleFactor = getScaleFactor(resolution);

  report('fetching-data');
  const chapter = await fetchChapter(chapterId);
  const verses = await fetchVerses(chapterId, translationId);
  const audioFile = await fetchReciterAudioFile(reciterId, chapterId);

  report('downloading-audio');
  const audioPath = await ensureAudioCached(audioFile.audio_url, reciterId, chapterId, AUDIO_DIR);

  // Real decoded audio duration is authoritative, not the CDN-reported duration field.
  const audioProbe = await probe(audioPath);
  const mainDurationSeconds = Number(audioProbe.format.duration);

  let bismillahAudioPath = null;
  let bismillahAudioDurationMs;
  if (bismillahAudioEnabled) {
    const bismillah = await ensureBismillahAudioCached(reciterId, AUDIO_DIR);
    bismillahAudioPath = bismillah.clipPath;
    bismillahAudioDurationMs = bismillah.durationMs;
  }

  const introWindowTiming = computeIntroTimingWindow({
    introCardEnabled,
    bismillahTextEnabled,
    bismillahAudioEnabled,
    bismillahAudioDurationMs,
    introCardDurationMs,
  });

  // verseDisplayDelayMs shifts ONLY caption timing, independent of audio --
  // the mirror of audioSyncOffsetMs, which shifts only audio. Clamped so
  // captions never display before t=0.
  const captionShiftMs = Math.max(0, introWindowTiming.windowMs + verseDisplayDelayMs);

  // The timeline must extend far enough to fit whichever track ends later --
  // a positive audio offset pushes the audio's tail out, and independently a
  // positive verse display delay pushes the captions' tail out. A negative
  // offset/delay just trims from the front and never needs more room than
  // the unshifted case, so only the positive extensions matter here.
  const audioTailExtensionSeconds = Math.max(0, audioSyncOffsetMs) / 1000;
  const captionTailExtensionSeconds = Math.max(0, captionShiftMs - introWindowTiming.windowMs) / 1000;
  const contentDurationSeconds =
    introWindowTiming.windowMs / 1000 +
    mainDurationSeconds +
    Math.max(audioTailExtensionSeconds, captionTailExtensionSeconds);

  // The outro is a fixed extra block of time tacked onto the very end, after
  // everything else -- unlike the audio-offset/caption-delay extensions
  // above, it's not "fitting a shifted track," it's genuinely new screen
  // time, so it applies on top of the already-resolved content duration.
  const outroEnabled = Boolean(outroOverrides.enabled);
  const outroDurationSeconds = outroEnabled ? Math.max(0, Number(outroOverrides.durationMs ?? 4000)) / 1000 : 0;
  const outroLine1 = outroOverrides.line1 ?? 'JazakAllah Khair for watching';
  const outroLine2 = outroOverrides.line2 ?? '';
  const outroWindow = outroEnabled
    ? { enabled: true, startSec: contentDurationSeconds, durationSec: outroDurationSeconds, line1: outroLine1, line2: outroLine2 }
    : { enabled: false };
  const totalDurationSeconds = contentDurationSeconds + outroDurationSeconds;

  let bismillahArabicText = null;
  if (bismillahTextEnabled) {
    const fatihaVerses = chapterId === 1 ? verses : await fetchVerses(1, translationId);
    bismillahArabicText = fatihaVerses[0].text_uthmani.trim();
  }

  report('preparing-captions');
  const captionData = buildCaptionData({ verses, audioFile });
  const shiftedCaptionData = shiftCaptionData(captionData, captionShiftMs);

  const assPath = path.join(TMP_DIR, `captions-${chapterId}-${reciterId}.ass`);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(
    assPath,
    buildAssSubtitles(shiftedCaptionData, style, { canvasWidth, canvasHeight, scaleFactor }, translationLanguage),
    'utf8'
  );

  report('downloading-background');
  const { inputs: backgroundInputs, backgroundInputLabel, backgroundFilterParts = [] } = await resolveBackground({
    background: backgroundOverrides,
    totalDurationSeconds,
    canvasWidth,
    canvasHeight,
  });

  const hasLogo = style.badges.channelLogo.enabled;
  let logoPath = null;
  if (hasLogo) {
    const logoId = style.badges.channelLogo.logoId;
    if (logoId) {
      try {
        logoPath = resolveUploadedLogoPath(logoId, LOGO_UPLOADS_DIR);
      } catch (err) {
        console.warn(`[surahExport] uploaded logo "${logoId}" unavailable (${err.message}), falling back to placeholder`);
      }
    }
    if (!logoPath) {
      logoPath = ensurePlaceholderLogo(LOGOS_DIR, FONTS_DIR);
    }
  }

  // Input order: [0..k-1]=background clip(s), k=main audio, [k+1=bismillah audio], [logo].
  const inputs = [...backgroundInputs, { path: audioPath }];
  const mainAudioInputLabel = `${backgroundInputs.length}:a`;
  let bismillahAudioInputLabel = null;
  if (bismillahAudioPath) {
    bismillahAudioInputLabel = `${inputs.length}:a`;
    inputs.push({ path: bismillahAudioPath });
  }
  let logoInputLabel = null;
  if (logoPath) {
    logoInputLabel = `${inputs.length}:v`;
    inputs.push({ path: logoPath });
  }

  const introWindow = {
    windowMs: introWindowTiming.windowMs,
    showBismillahText: bismillahTextEnabled,
    bismillahText: bismillahArabicText,
    showIntroCard: introCardEnabled,
    cardText: { line1: chapter.name_simple, line2: `${chapter.translated_name.name} • ${chapter.id}` },
  };

  const videoFilterComplex = buildFilterComplex({
    style,
    assPath,
    fontsDir: FONTS_DIR,
    surahBadgeText: { line1: chapter.name_simple, line2: `${chapter.translated_name.name} • ${chapter.id}` },
    logoInputLabel,
    introWindow,
    outroWindow,
    backgroundInputLabel,
    canvasWidth,
    canvasHeight,
    scaleFactor,
    totalDurationSeconds,
  });

  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel,
    bismillahAudioInputLabel,
    introWindow,
    audioSyncOffsetMs,
    volumeMultiplier,
  });

  // composeVideo passes both -t and -shortest, so if the audio track's own
  // samples end before totalDurationSeconds (e.g. verseDisplayDelayMs pushed
  // the *captions* later without touching the audio itself), -shortest would
  // truncate the output at the audio's natural end and cut off the tail
  // captions. Padding with silence up to the real target duration makes the
  // audio stream itself long enough so -shortest never fires early.
  const paddedAudioParts = [
    ...audioFilterParts,
    `[${audioOutLabel}]apad=whole_dur=${totalDurationSeconds.toFixed(3)}[audioPadded]`,
  ];
  const finalAudioOutLabel = 'audioPadded';

  const filterComplex = [...backgroundFilterParts, videoFilterComplex, ...paddedAudioParts].join(';');
  const audioMapLabel = `[${finalAudioOutLabel}]`;

  report('encoding', 0);
  await composeVideo({
    inputs,
    durationSeconds: totalDurationSeconds,
    outputPath,
    filterComplex,
    audioMapLabel,
    onProgress: (fraction) => report('encoding', fraction),
  });

  const srtPath = outputPath.replace(/\.mp4$/, '.srt');
  fs.writeFileSync(srtPath, buildSrt(shiftedCaptionData, introWindow), 'utf8');

  report('probing');
  const outputProbe = await probe(outputPath);
  report('done', 1);

  return {
    chapter,
    captionData: shiftedCaptionData,
    style,
    introWindow: introWindowTiming,
    outroWindow,
    audioSourceUrl: audioFile.audio_url,
    bismillahAudioDurationMs,
    audioSyncOffsetMs,
    resolution,
    aspectRatio,
    canvasWidth,
    canvasHeight,
    durationSeconds: totalDurationSeconds,
    outputPath,
    srtPath,
    outputProbe,
  };
}
