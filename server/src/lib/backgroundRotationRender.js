import fs from 'node:fs';
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
 * rotation has. Segment boundaries are chosen so that concatenating segment
 * 0..N-1 in order (see renderBackgroundRotation) reproduces exactly what the
 * old single-filter-graph approach (backgroundFilterGraph.js) would have
 * shown at every point in time:
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
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
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
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    outputPath,
  ];
  await runFfmpeg(args);
}

/**
 * Renders the full background rotation (every instance from
 * planBackgroundSequence) to one flattened video file, then hands back a
 * plain single-input path -- the same shape as the static-placeholder and
 * single-clip cases, so the main composition's filter graph never has to
 * know how many clips were actually in the rotation.
 *
 * This replaces the old approach of feeding every rotation clip into one
 * big ffmpeg filter_complex as simultaneous inputs (backgroundFilterGraph.js):
 * that opened N real video decoders for the entire video's duration, and N
 * scales with both clip-pool size and video length (planBackgroundSequence
 * cycles the pool to cover however long the video is) -- confirmed as the
 * cause of a real OOM (exceeded 2GB) on a 1080p, ~5-minute export with a
 * long rotation pool. Here, at most 2 clip decoders are ever open at once
 * (the previous clip's tail + this clip's head for one crossfade), and the
 * per-instance segments are joined with the concat demuxer -- a lossless
 * stream copy, not a re-encode, so total work stays proportional to video
 * length instead of re-encoding an ever-growing accumulator per instance.
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
    const segmentPaths = [];
    for (let i = 0; i < instances.length; i++) {
      const segmentPath = path.join(workDir, `segment-${String(i).padStart(4, '0')}.mp4`);
      await renderSegment({
        isFirst: i === 0,
        isLast: i === instances.length - 1,
        prevClipPath: i > 0 ? cachedPaths.get(instances[i - 1].clip) : null,
        clipPath: cachedPaths.get(instances[i].clip),
        slotDurationSeconds,
        transitionDurationSeconds,
        transitionStyle,
        canvasWidth,
        canvasHeight,
        outputPath: segmentPath,
      });
      segmentPaths.push(segmentPath);
    }

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
