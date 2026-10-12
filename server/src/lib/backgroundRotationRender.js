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

// Real production failure: the container's own (ephemeral) disk has a hard
// 18GB cap, and the rotation's intermediate files all live on it. At 4K the
// original encode (-preset ultrafast, libx264's default CRF 23) measured
// ~8MB per second of video (~64 Mbps, ~5x the finished video's own bitrate),
// so a 33-minute 4K export wrote ~16GB of segments and then a second ~16GB
// concatenated copy -- the instance died with "Size of temporary storage
// exceeded the limit of 18GB", twice. These intermediates are re-encoded by
// the main composition, so they only need to be good enough to survive that.
//
// Measured on a real 4K segment (ultrafast, 7s): CRF 23 55.9MB, CRF 25
// 44.9MB, CRF 26 39.2MB, CRF 28 31.1MB -- about 11% smaller per CRF step.
// Starting at CRF 26 (5.6MB/s at 4K) and stepping up only as far as needed
// keeps ordinary exports comfortably inside the budget at near-normal
// quality, and a very long export degrades gracefully instead of crashing.
const BASE_SEGMENT_CRF = 26;
const MAX_SEGMENT_CRF = 36;
const BYTES_PER_SECOND_AT_BASE_CRF_4K = 5.6e6;
const BYTES_PER_PIXEL_RATIO_4K = 3840 * 2160;
const SIZE_FACTOR_PER_CRF_STEP = 0.89;
// Aim for segments that leave room on the 18GB disk for the final encode's
// own scratch use, the downloaded clips' working copies, and estimate error.
const SEGMENT_DISK_BUDGET_BYTES = 10e9;
const SEGMENT_DISK_HARD_LIMIT_BYTES = 15e9;

export function estimateSegmentBytes({ durationSeconds, canvasWidth, canvasHeight, crf }) {
  const pixelRatio = (canvasWidth * canvasHeight) / BYTES_PER_PIXEL_RATIO_4K;
  const perSecond = BYTES_PER_SECOND_AT_BASE_CRF_4K * pixelRatio * SIZE_FACTOR_PER_CRF_STEP ** (crf - BASE_SEGMENT_CRF);
  return perSecond * durationSeconds;
}

/**
 * Picks the lowest CRF (best quality) whose estimated total segment size fits
 * the disk budget, and refuses outright when even the most compressed
 * setting can't fit -- a clear up-front error beats the instance dying
 * mid-export and losing the job.
 */
export function chooseSegmentCrf({ durationSeconds, canvasWidth, canvasHeight }) {
  const size = (crf) => estimateSegmentBytes({ durationSeconds, canvasWidth, canvasHeight, crf });
  let crf = BASE_SEGMENT_CRF;
  while (crf < MAX_SEGMENT_CRF && size(crf) > SEGMENT_DISK_BUDGET_BYTES) crf++;
  if (size(crf) > SEGMENT_DISK_HARD_LIMIT_BYTES) {
    throw new Error(
      `This export's background rotation (~${Math.round(durationSeconds / 60)} min at ${canvasWidth}x${canvasHeight}) would need about ${(size(crf) / 1e9).toFixed(0)}GB of temporary disk even at maximum compression, more than this server has. Export at a lower resolution, or use a single background clip, or a shorter chapter.`
    );
  }
  return { crf, estimatedBytes: size(crf) };
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
  crf,
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
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf), '-threads', '1', '-pix_fmt', 'yuv420p',
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
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf), '-threads', '1', '-pix_fmt', 'yuv420p',
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
 * Renders every instance of the rotation (see renderBackgroundRotation) to
 * its own segment file and writes the ffmpeg concat list that joins them,
 * but does NOT concatenate. The main composition can read the concat list
 * directly as its background input, which avoids writing a second full-size
 * copy of the whole background to disk -- half the temporary storage, which
 * is what the container's 18GB cap needed (see BASE_SEGMENT_CRF).
 *
 * Returns { listPath, cleanup }; the caller must call cleanup() once the
 * list is no longer needed (it deletes every segment). On failure this
 * cleans up after itself before throwing.
 */
export async function renderBackgroundRotationSegments({
  instances,
  cachedPaths,
  slotDurationSeconds,
  transitionDurationSeconds,
  transitionStyle,
  canvasWidth,
  canvasHeight,
  tmpDir,
}) {
  if (instances.length === 0) {
    throw new Error('renderBackgroundRotation requires at least one instance');
  }
  if (!TRANSITION_STYLES.includes(transitionStyle)) {
    throw new Error(`Unknown transitionStyle "${transitionStyle}". Options: ${TRANSITION_STYLES.join(', ')}`);
  }

  const step = slotDurationSeconds - transitionDurationSeconds;
  const totalSeconds = (instances.length - 1) * step + (slotDurationSeconds + transitionDurationSeconds);
  const { crf } = chooseSegmentCrf({ durationSeconds: totalSeconds, canvasWidth, canvasHeight });

  fs.mkdirSync(tmpDir, { recursive: true });
  const workDir = path.join(tmpDir, `bgrotation-${randomUUID()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const cleanup = () => fs.rmSync(workDir, { recursive: true, force: true });

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
        crf,
        outputPath: segmentPath,
      });
      return segmentPath;
    });

    const listPath = path.join(workDir, 'concat-list.txt');
    const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
    fs.writeFileSync(listPath, listContent, 'utf8');
    return { listPath, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Renders the full background rotation (every instance from
 * planBackgroundSequence) to one flattened video file, then hands back a
 * plain single-input path -- the same shape as the static-placeholder and
 * single-clip cases, so the main composition's filter graph never has to
 * know how many clips were actually in the rotation. (The export itself now
 * uses renderBackgroundRotationSegments directly to avoid this function's
 * second full-size copy.)
 *
 * See renderSegment's doc comment for why the rotation is rendered as
 * independent segments: a single long xfade chain measured ~3GB peak memory
 * for a real 5-minute 1080p rotation, from buffering depth in a long
 * dependent filter chain. Segments are rendered concurrently (bounded by CPU
 * count) -- a long surah needs hundreds of instances, and running them
 * sequentially took over 3 hours. Each segment only reads the original
 * source clips, never another segment's output, so there is no ordering
 * dependency; only the final concat needs them in order. renderSegment pins
 * each to a single thread (-threads 1) so this parallelism doesn't
 * oversubscribe the CPU.
 */
export async function renderBackgroundRotation({ outputPath, ...rest }) {
  const { listPath, cleanup } = await renderBackgroundRotationSegments(rest);
  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
    return outputPath;
  } finally {
    cleanup();
  }
}
