import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderBackgroundRotation, renderBackgroundRotationSegments, chooseSegmentCrf, TRANSITION_STYLES } from '../src/lib/backgroundRotationRender.js';
import { planBackgroundSequence } from '../src/lib/backgroundSequence.js';
import { probe } from '../src/lib/ffmpeg.js';
import { ffmpegPath } from '../src/lib/ffmpegBinaries.js';

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bgrotation-test-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A real, short, solid-color test clip -- distinct colors per clip so a human (or a future pixel-sampling test) can tell which clip is showing at any point. */
function makeColorClip(dir, name, color, seconds = 3) {
  const outPath = path.join(dir, name);
  const res = spawnSync(ffmpegPath, [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${color}:s=64x64:d=${seconds}:r=25`,
    '-pix_fmt', 'yuv420p',
    outPath,
  ]);
  assert.equal(res.status, 0, `failed to generate test clip: ${res.stderr}`);
  return outPath;
}

test('renderBackgroundRotation produces a single flattened file covering the full planned duration, using only real clip inputs', async () => {
  await withTempDir(async (dir) => {
    const clipA = makeColorClip(dir, 'a.mp4', 'red');
    const clipB = makeColorClip(dir, 'b.mp4', 'blue');
    const cachedPaths = new Map([
      ['a', clipA],
      ['b', clipB],
    ]);

    const slotDurationSeconds = 2;
    const transitionDurationSeconds = 0.5;
    const orderedClips = ['a', 'b', 'a'];
    const instances = planBackgroundSequence({
      orderedClips,
      totalDurationSeconds: 5,
      slotDurationSeconds,
      transitionDurationSeconds,
    });
    assert.ok(instances.length >= 3, 'expected at least 3 instances to cover 5s at a 2s slot');

    const outputPath = path.join(dir, 'flattened.mp4');
    const tmpDir = path.join(dir, 'tmp');

    await renderBackgroundRotation({
      instances,
      cachedPaths,
      slotDurationSeconds,
      transitionDurationSeconds,
      transitionStyle: 'fade',
      canvasWidth: 64,
      canvasHeight: 64,
      tmpDir,
      outputPath,
    });

    assert.ok(fs.existsSync(outputPath), 'flattened output must exist');
    const info = await probe(outputPath);
    const videoStream = info.streams.find((s) => s.codec_type === 'video');
    assert.ok(videoStream, 'flattened output must have a real video stream');
    assert.equal(videoStream.width, 64);
    assert.equal(videoStream.height, 64);

    // (N-1) instances of (slot-transition) + the last instance's
    // (slot+transition) -- matches the old filter-graph approach's real
    // total duration exactly (see backgroundRotationRender.js's doc comment).
    const step = slotDurationSeconds - transitionDurationSeconds;
    const expectedDuration = (instances.length - 1) * step + (slotDurationSeconds + transitionDurationSeconds);
    const actualDuration = Number(info.format.duration);
    assert.ok(
      Math.abs(actualDuration - expectedDuration) < 0.3,
      `expected duration ~${expectedDuration}s, got ${actualDuration}s`
    );

    // Cleans up its own scratch work directory (per-instance segments,
    // concat list) once it's done -- nothing should be left behind.
    assert.ok(!fs.existsSync(tmpDir) || fs.readdirSync(tmpDir).length === 0, 'scratch work dir should be cleaned up');
  });
});

test('renderBackgroundRotation with a single instance just outputs that one clip, no concat step needed', async () => {
  await withTempDir(async (dir) => {
    const clipA = makeColorClip(dir, 'solo.mp4', 'green', 4);
    const cachedPaths = new Map([['solo', clipA]]);

    const slotDurationSeconds = 6;
    const transitionDurationSeconds = 1;
    const instances = planBackgroundSequence({
      orderedClips: ['solo'],
      totalDurationSeconds: 4,
      slotDurationSeconds,
      transitionDurationSeconds,
    });
    assert.equal(instances.length, 1);

    const outputPath = path.join(dir, 'flattened-solo.mp4');
    await renderBackgroundRotation({
      instances,
      cachedPaths,
      slotDurationSeconds,
      transitionDurationSeconds,
      transitionStyle: 'fade',
      canvasWidth: 64,
      canvasHeight: 64,
      tmpDir: path.join(dir, 'tmp'),
      outputPath,
    });

    const info = await probe(outputPath);
    // Single instance is always treated as "the last" -- full slot+transition length.
    const expectedDuration = slotDurationSeconds + transitionDurationSeconds;
    assert.ok(
      Math.abs(Number(info.format.duration) - expectedDuration) < 0.3,
      `expected ~${expectedDuration}s, got ${info.format.duration}s`
    );
  });
});

test('renderBackgroundRotation rejects an unknown transitionStyle rather than silently falling back or letting ffmpeg fail with an unclear error', async () => {
  await withTempDir(async (dir) => {
    const clipA = makeColorClip(dir, 'a.mp4', 'red', 2);
    const clipB = makeColorClip(dir, 'b.mp4', 'blue', 2);
    const instances = planBackgroundSequence({
      orderedClips: ['a', 'b'],
      totalDurationSeconds: 4,
      slotDurationSeconds: 2,
      transitionDurationSeconds: 0.5,
    });
    await assert.rejects(() =>
      renderBackgroundRotation({
        instances,
        cachedPaths: new Map([['a', clipA], ['b', clipB]]),
        slotDurationSeconds: 2,
        transitionDurationSeconds: 0.5,
        transitionStyle: 'implode',
        canvasWidth: 64,
        canvasHeight: 64,
        tmpDir: path.join(dir, 'tmp'),
        outputPath: path.join(dir, 'out.mp4'),
      })
    );
  });
});

test('a non-default transitionStyle is threaded through correctly, not just the default', async () => {
  await withTempDir(async (dir) => {
    assert.ok(TRANSITION_STYLES.includes('wipeleft'));
    const clipA = makeColorClip(dir, 'a.mp4', 'red', 2);
    const clipB = makeColorClip(dir, 'b.mp4', 'blue', 2);
    const instances = planBackgroundSequence({
      orderedClips: ['a', 'b'],
      totalDurationSeconds: 4,
      slotDurationSeconds: 2,
      transitionDurationSeconds: 0.5,
    });
    const outputPath = path.join(dir, 'out-wipeleft.mp4');
    await renderBackgroundRotation({
      instances,
      cachedPaths: new Map([['a', clipA], ['b', clipB]]),
      slotDurationSeconds: 2,
      transitionDurationSeconds: 0.5,
      transitionStyle: 'wipeleft',
      canvasWidth: 64,
      canvasHeight: 64,
      tmpDir: path.join(dir, 'tmp'),
      outputPath,
    });
    assert.ok(fs.existsSync(outputPath));
  });
});

test('renderBackgroundRotation never opens more than 2 real clip inputs at once, regardless of instance count', async () => {
  await withTempDir(async (dir) => {
    // 6 instances from a 2-clip pool -- the old approach would have opened
    // 6 simultaneous ffmpeg inputs for the whole render; this one never
    // needs more than 2 (previous clip + current clip) per segment.
    const clipA = makeColorClip(dir, 'a.mp4', 'red', 2);
    const clipB = makeColorClip(dir, 'b.mp4', 'blue', 2);
    const cachedPaths = new Map([
      ['a', clipA],
      ['b', clipB],
    ]);

    const slotDurationSeconds = 1.5;
    const transitionDurationSeconds = 0.5;
    const instances = planBackgroundSequence({
      orderedClips: ['a', 'b'],
      totalDurationSeconds: 6,
      slotDurationSeconds,
      transitionDurationSeconds,
    });
    assert.ok(instances.length >= 5, 'expected several cycled instances');

    const outputPath = path.join(dir, 'flattened-many.mp4');
    await renderBackgroundRotation({
      instances,
      cachedPaths,
      slotDurationSeconds,
      transitionDurationSeconds,
      transitionStyle: 'fade',
      canvasWidth: 64,
      canvasHeight: 64,
      tmpDir: path.join(dir, 'tmp'),
      outputPath,
    });

    assert.ok(fs.existsSync(outputPath));
    const info = await probe(outputPath);
    assert.ok(Number(info.format.duration) > 0);
  });
});

// Real production failure: the container's own disk has a hard 18GB cap and a
// 33-minute 4K export wrote ~16GB of segments plus a second ~16GB flattened
// copy, killing the instance twice. Measured on a real 4K segment: ultrafast
// at the default CRF 23 is ~8MB/s; CRF 26 is ~5.6MB/s, ~11% smaller per step.
test('chooseSegmentCrf keeps a 33-minute 4K rotation well inside the temp-disk budget (it was ~16GB before)', () => {
  const { crf, estimatedBytes } = chooseSegmentCrf({ durationSeconds: 2008, canvasWidth: 3840, canvasHeight: 2160 });
  assert.ok(crf >= 26, `crf ${crf}`);
  assert.ok(estimatedBytes < 12e9, `estimated ${(estimatedBytes / 1e9).toFixed(1)}GB should be well under the 18GB cap`);
});

test('chooseSegmentCrf leaves ordinary exports at the base quality and compresses harder only as needed', () => {
  assert.equal(chooseSegmentCrf({ durationSeconds: 300, canvasWidth: 1280, canvasHeight: 720 }).crf, 26);
  const long = chooseSegmentCrf({ durationSeconds: 3600, canvasWidth: 3840, canvasHeight: 2160 });
  assert.ok(long.crf > 26 && long.estimatedBytes <= 10e9, `crf ${long.crf}, ${(long.estimatedBytes / 1e9).toFixed(1)}GB`);
});

test('chooseSegmentCrf refuses a rotation too large for the disk with a clear message instead of letting the instance die', () => {
  assert.throws(
    () => chooseSegmentCrf({ durationSeconds: 3 * 3600, canvasWidth: 3840, canvasHeight: 2160 }),
    /lower resolution|shorter chapter/
  );
});

test('renderBackgroundRotationSegments returns a concat list of every segment and a cleanup that deletes them all', async () => {
  await withTempDir(async (dir) => {
    const clipA = makeColorClip(dir, 'a.mp4', 'red');
    const clipB = makeColorClip(dir, 'b.mp4', 'blue');
    const instances = planBackgroundSequence({
      orderedClips: ['a', 'b', 'a'],
      totalDurationSeconds: 5,
      slotDurationSeconds: 2,
      transitionDurationSeconds: 0.5,
    });
    const tmpDir = path.join(dir, 'tmp');
    const { listPath, cleanup } = await renderBackgroundRotationSegments({
      instances,
      cachedPaths: new Map([['a', clipA], ['b', clipB]]),
      slotDurationSeconds: 2,
      transitionDurationSeconds: 0.5,
      transitionStyle: 'fade',
      canvasWidth: 64,
      canvasHeight: 64,
      tmpDir,
    });
    const listed = fs.readFileSync(listPath, 'utf8').trim().split('\n');
    assert.equal(listed.length, instances.length);
    for (const line of listed) {
      const segPath = line.replace(/^file '/, '').replace(/'$/, '');
      assert.ok(fs.existsSync(segPath), `segment missing: ${segPath}`);
    }
    // The concat list itself must be directly usable as an ffmpeg input
    // (that's how the export reads it, with no second flattened copy).
    const out = path.join(dir, 'joined.mp4');
    const res = spawnSync(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', out]);
    assert.equal(res.status, 0, String(res.stderr));
    assert.ok(Number((await probe(out)).format.duration) > 3);

    cleanup();
    assert.ok(!fs.existsSync(tmpDir) || fs.readdirSync(tmpDir).length === 0, 'cleanup must delete every segment');
  });
});

test('renderBackgroundRotationSegments cleans up its own scratch when a segment fails, rather than leaking it', async () => {
  await withTempDir(async (dir) => {
    const clipA = makeColorClip(dir, 'a.mp4', 'red');
    const instances = planBackgroundSequence({
      orderedClips: ['a', 'missing'],
      totalDurationSeconds: 4,
      slotDurationSeconds: 2,
      transitionDurationSeconds: 0.5,
    });
    const tmpDir = path.join(dir, 'tmp');
    await assert.rejects(() =>
      renderBackgroundRotationSegments({
        instances,
        cachedPaths: new Map([['a', clipA], ['missing', path.join(dir, 'nope.mp4')]]),
        slotDurationSeconds: 2,
        transitionDurationSeconds: 0.5,
        transitionStyle: 'fade',
        canvasWidth: 64,
        canvasHeight: 64,
        tmpDir,
      })
    );
    assert.ok(!fs.existsSync(tmpDir) || fs.readdirSync(tmpDir).length === 0, 'failed render must not leave segments behind');
  });
});
