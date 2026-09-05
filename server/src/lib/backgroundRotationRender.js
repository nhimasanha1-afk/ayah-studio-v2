import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ffmpegPath } from './ffmpegBinaries.js';

const FPS = 25;

// A curated subset of ffmpeg's xfade transition names -- the full list is
// much longer, but these cover the visually distinct styles worth exposing.
export const TRANSITION_STYLES = [
  'fade',
  'dissolve',
  'wipeleft',
  'wiperight',
  'slideleft',
  'slideright',
  'circleopen',
  'pixelize',
];

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderrTail = '';
    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderrTail}`));
    });
  });
}

function normalizeChain(inputLabel, canvasWidth, canvasHeight, outLabel) {
  return `[${inputLabel}]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},fps=${FPS},format=yuv420p,setsar=1[${outLabel}]`;
}

/**
 * Renders one instance of the rotation to its own short file, using at most
 * the previous clip's tail + this clip's head -- never more than 2 real clip
 * decoders open at once, regardless of how many total instances the full
 * rotation has. This deliberately breaks the crossfade chain into
 * independent short pieces rather than one long sequential xfade graph:
 * confirmed via direct measurement that a single long chain (43 sequential
 * xfade steps for a real 5-minute 1080p rotation) needs ~3GB of buffering
 * regardless of whether the underlying clip files are deduplicated -- the
 * memory cost comes from FFmpeg having to hold early blend results in
 * memory while working through a long dependent chain, not from how many
 * real file inputs are open. Breaking it into short, independently-encoded
 * segments (concatenated afterward, see renderBackgroundRotation) avoids
 * that deep-buffering cost entirely, at the real cost of a second encoding
 * pass over the whole video's background footage -- an accepted, measured
 * tradeoff (see renderBackgroundRotation's own doc comment) chosen so this
 * fits in 2GB rather than needing ~3-4GB.
 *
 * Segment boundaries are chosen so that concatenating segment 0..N-1 in
 * order reproduces exactly what the old single-filter-graph approach
 * (backgroundFilterGraph.js) would have shown at every point in time:
 *   - instance 0: solo, length = slot - transition (it stops exactly where
 *     instance 1's crossfade-in begins -- instance 0's own tail beyond that
 *     point is what gets blended INTO instance 1's segment, not this one).
 *   - middle instances: crossfade in from the previous clip's tail (its own
 *     local [slot-transition, slot) window) for `transition` seconds, then
 *     solo for the rest, total length = slot - transition.
 *   - the last instance: same crossfade-in, but runs the full slot+transition
 *     length (matching the old approach, where the final clip in the xfade
 *     chain was never truncated by a subsequent overlap).
 */
async function renderSegment({
  isFirst,
  isLast,
  prevClipPath,
  clipPath,
  slotDurationSeconds,
  transitionDurationSeconds,
  transitionStyle,
  canvasWidth,
  canvasHeight,
  outputPath,
}) {
  const step = slotDurationSeconds - transitionDurationSeconds;
  const thisLength = isLast ? slotDurationSeconds + transitionDurationSeconds : step;

  if (isFirst) {
    const args = [
      '-y',
      '-stream_loop', '-1', '-t', String(thisLength), '-i', clipPath,
      '-filter_complex', normalizeChain('0:v', canvasWidth, canvasHeight, 'out'),
      '-map', '[out]',
      '-an',
      // ultrafast: this intermediate segment gets fully re-decoded and
      // re-encoded again by the main composition pass, so its own encode
      // quality is irrelevant -- only speed matters here. -threads 1 pins
      // each segment to a single core rather than letting libx264 grab
      // several -- necessary now that renderBackgroundRotation runs many
      // segments concurrently (see its own doc comment): without this,
      // N segments x N threads each on an N-core box oversubscribes badly.
      '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-pix_fmt', 'yuv420p',
      outputPath,
    ];
    await runFfmpeg(args);
    return;
  }

  const tailStart = slotDurationSeconds - transitionDurationSeconds;
  const filter = [
    normalizeChain('0:v', canvasWidth, canvasHeight, 'n0'),
    `[n0]trim=start=${tailStart}:end=${slotDurationSeconds},setpts=PTS-STARTPTS[a]`,
    normalizeChain('1:v', canvasWidth, canvasHeight, 'b'),
    `[a][b]xfade=transition=${transitionStyle}:duration=${transitionDurationSeconds}:offset=0[out]`,
  ].join(';');

  const args = [
    '-y',
    '-stream_loop', '-1', '-t', String(slotDurationSeconds), '-i', prevClipPath,
    '-stream_loop', '-1', '-t', String(thisLength), '-i', clipPath,
    '-filter_complex', filter,
    '-map', '[out]',
    '-an',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-pix_fmt', 'yuv420p',
    outputPath,
  ];
  await runFfmpeg(args);
}

/**
 * Runs items through fn with at most `limit` in flight at once, preserving
 * result order regardless of which one finishes first.
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Renders the full background rotation (every instance from
 * planBackgroundSequence) to one flattened video file, then hands back a
 * plain single-input path -- the same shape as the static-placeholder and
 * single-clip cases, so the main composition's filter graph never has to
 * know how many clips were actually in the rotation.
 *
 * See renderSegment's doc comment for why this exists: a single long xfade
 * chain (the original approach) measured ~3GB peak memory for a real
 * 5-minute 1080p rotation regardless of input deduplication, since the
 * memory cost is from buffering depth in a long dependent filter chain, not
 * from how many real files are opened. This trades that memory ceiling for
 * roughly double the total encoding time (the background gets encoded once
 * here, then again as part of the main composition) -- an explicit,
 * measured tradeoff, chosen so exports fit in 2GB rather than needing a
 * bigger instance.
 *
 * Segments are rendered concurrently (bounded by CPU count), not one at a
 * time -- confirmed as a real production problem: a long surah (e.g. a
 * ~75-verse chapter) needs hundreds of instances, and running them fully
 * sequentially took over 3 hours end to end. Each segment only ever reads
 * from cachedPaths (the original source clips, already downloaded before
 * this function runs), never from another segment's own output, so there's
 * no real ordering dependency between segments -- only the final concat
 * needs them in order, which segmentPaths already preserves regardless of
 * completion order. renderSegment pins each one to a single thread
 * (-threads 1) specifically so this parallelism doesn't oversubscribe the
 * CPU (N segments x N threads each on an N-core box would be worse than
 * sequential, not better).
 */
export async function renderBackgroundRotation({
  instances,
  cachedPaths,
  slotDurationSeconds,
  transitionDurationSeconds,
  transitionStyle,
  canvasWidth,
  canvasHeight,
  tmpDir,
  outputPath,
}) {
  if (instances.length === 0) {
    throw new Error('renderBackgroundRotation requires at least one instance');
  }
  if (!TRANSITION_STYLES.includes(transitionStyle)) {
    throw new Error(`Unknown transitionStyle "${transitionStyle}". Options: ${TRANSITION_STYLES.join(', ')}`);
  }

  fs.mkdirSync(tmpDir, { recursive: true });
  const workDir = path.join(tmpDir, `bgrotation-${randomUUID()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const concurrency = Math.max(1, os.cpus().length);
    const segmentPaths = await mapWithConcurrency(instances, concurrency, async (instance, i) => {
      const segmentPath = path.join(workDir, `segment-${String(i).padStart(4, '0')}.mp4`);
      await renderSegment({
        isFirst: i === 0,
        isLast: i === instances.length - 1,
        prevClipPath: i > 0 ? cachedPaths.get(instances[i - 1].clip) : null,
        clipPath: cachedPaths.get(instance.clip),
        slotDurationSeconds,
        transitionDurationSeconds,
        transitionStyle,
        canvasWidth,
        canvasHeight,
        outputPath: segmentPath,
      });
      return segmentPath;
    });

    if (segmentPaths.length === 1) {
      fs.copyFileSync(segmentPaths[0], outputPath);
      return outputPath;
    }

    const listPath = path.join(workDir, 'concat-list.txt');
    const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
    fs.writeFileSync(listPath, listContent, 'utf8');

    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
    return outputPath;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
