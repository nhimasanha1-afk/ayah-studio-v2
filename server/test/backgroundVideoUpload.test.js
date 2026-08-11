import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPathBin from 'ffmpeg-static';
import {
  persistBackgroundVideoUpload,
  isUploadedBackgroundClipId,
  resolveUploadedBackgroundVideoPath,
} from '../src/lib/backgroundVideoUpload.js';

function withTempUploadsDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bgvideo-uploads-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirs(fn) {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bgvideo-uploads-test-'));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bgvideo-tmp-test-'));
  try {
    return await fn(uploadsDir, tmpDir);
  } finally {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function makeRealTestVideo() {
  const tmpFile = path.join(os.tmpdir(), `real-test-video-${Date.now()}.mp4`);
  const result = spawnSync(ffmpegPathBin, [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10',
    '-pix_fmt', 'yuv420p',
    tmpFile,
  ]);
  assert.equal(result.status, 0, `ffmpeg test-video generation failed: ${result.stderr}`);
  return fs.readFileSync(tmpFile);
}

const VALID_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde.mp4';

test('isUploadedBackgroundClipId recognizes the generated UUID.ext shape and rejects curated library ids', () => {
  assert.equal(isUploadedBackgroundClipId(VALID_ID), true);
  assert.equal(isUploadedBackgroundClipId('nature-timelapse-clouds'), false);
  assert.equal(isUploadedBackgroundClipId('a1b2c3d4-e5f6-4789-a012-3456789abcde.exe'), false);
  assert.equal(isUploadedBackgroundClipId(null), false);
});

test('resolves a real, correctly-shaped clipId to its file path', () => {
  withTempUploadsDir((uploadsDir) => {
    fs.writeFileSync(path.join(uploadsDir, VALID_ID), 'fake-video-bytes');
    const resolved = resolveUploadedBackgroundVideoPath(VALID_ID, uploadsDir);
    assert.equal(resolved, path.join(uploadsDir, VALID_ID));
  });
});

test('rejects a clipId for a file that was never actually persisted', () => {
  withTempUploadsDir((uploadsDir) => {
    assert.throws(() => resolveUploadedBackgroundVideoPath(VALID_ID, uploadsDir));
  });
});

test('rejects path traversal attempts disguised as a clipId', () => {
  withTempUploadsDir((uploadsDir) => {
    const secretPath = path.join(uploadsDir, '..', 'secret.txt');
    fs.writeFileSync(secretPath, 'do not leak me');
    try {
      const attempts = ['../secret.txt', '..\\secret.txt', '../../etc/passwd'];
      for (const attempt of attempts) {
        assert.throws(() => resolveUploadedBackgroundVideoPath(attempt, uploadsDir), `expected "${attempt}" rejected`);
      }
    } finally {
      fs.rmSync(secretPath, { force: true });
    }
  });
});

test('rejects non-string / malformed input rather than crashing oddly', () => {
  withTempUploadsDir((uploadsDir) => {
    assert.throws(() => resolveUploadedBackgroundVideoPath(null, uploadsDir));
    assert.throws(() => resolveUploadedBackgroundVideoPath(undefined, uploadsDir));
    assert.throws(() => resolveUploadedBackgroundVideoPath('', uploadsDir));
  });
});

test('persistBackgroundVideoUpload accepts a real decodable video and reports its real dimensions/duration', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const buffer = makeRealTestVideo();
    const { clipId, width, height, durationSeconds } = await persistBackgroundVideoUpload(buffer, uploadsDir, tmpDir);
    assert.ok(isUploadedBackgroundClipId(clipId));
    assert.equal(width, 64);
    assert.equal(height, 64);
    assert.ok(durationSeconds > 0.5 && durationSeconds < 1.5);
    assert.ok(fs.existsSync(path.join(uploadsDir, clipId)));
  });
});

test('persistBackgroundVideoUpload rejects bytes that are not a real video', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    await assert.rejects(() => persistBackgroundVideoUpload(Buffer.from('not a real video'), uploadsDir, tmpDir));
  });
});
