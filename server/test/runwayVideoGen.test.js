import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPathBin from 'ffmpeg-static';
import { generateBackgroundVideo, ratioForAspectRatio } from '../src/lib/runwayVideoGen.js';

async function withTempDirs(fn) {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runway-uploads-test-'));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runway-tmp-test-'));
  try {
    return await fn(uploadsDir, tmpDir);
  } finally {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function makeRealTestVideoBuffer() {
  const tmpFile = path.join(os.tmpdir(), `runway-fake-output-${Date.now()}.mp4`);
  const result = spawnSync(ffmpegPathBin, [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=48x48:rate=10',
    '-pix_fmt', 'yuv420p',
    tmpFile,
  ]);
  assert.equal(result.status, 0, `ffmpeg test-video generation failed: ${result.stderr}`);
  const buffer = fs.readFileSync(tmpFile);
  fs.rmSync(tmpFile, { force: true });
  return buffer;
}

// A fake Runway client that walks through PENDING -> RUNNING(progress) ->
// SUCCEEDED across successive retrieve() calls, so the polling loop and
// progress reporting get real exercise without hitting the real paid API.
function makeFakeClient({ statuses, createResponse = { id: 'task-123' } }) {
  let call = 0;
  const createCalls = [];
  return {
    textToVideo: {
      create: async (body) => {
        createCalls.push(body);
        return createResponse;
      },
    },
    tasks: {
      retrieve: async (id) => {
        const status = statuses[Math.min(call, statuses.length - 1)];
        call++;
        return { id, createdAt: new Date().toISOString(), ...status };
      },
    },
    _createCalls: createCalls,
  };
}

test('ratioForAspectRatio maps the app aspect ratios onto gen4.5\'s exact allowed ratios', () => {
  assert.equal(ratioForAspectRatio('16:9'), '1280:720');
  assert.equal(ratioForAspectRatio('9:16'), '720:1280');
});

test('ratioForAspectRatio rejects an unsupported ratio', () => {
  assert.throws(() => ratioForAspectRatio('1:1'));
});

test('generateBackgroundVideo rejects an empty or oversized prompt before ever calling Runway', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [] });
    await assert.rejects(() =>
      generateBackgroundVideo({ prompt: '', aspectRatio: '16:9', uploadsDir, tmpDir, client })
    );
    await assert.rejects(() =>
      generateBackgroundVideo({ prompt: 'x'.repeat(1001), aspectRatio: '16:9', uploadsDir, tmpDir, client })
    );
    assert.equal(client._createCalls.length, 0, 'Runway should never be called for invalid input');
  });
});

test('generateBackgroundVideo rejects an out-of-range duration before ever calling Runway', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [] });
    await assert.rejects(() =>
      generateBackgroundVideo({ prompt: 'a calm ocean at sunset', aspectRatio: '16:9', durationSeconds: 1, uploadsDir, tmpDir, client })
    );
    await assert.rejects(() =>
      generateBackgroundVideo({ prompt: 'a calm ocean at sunset', aspectRatio: '16:9', durationSeconds: 11, uploadsDir, tmpDir, client })
    );
    assert.equal(client._createCalls.length, 0);
  });
});

test('generateBackgroundVideo sends the real gen4.5 request shape', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'SUCCEEDED', output: ['https://fake.runway/output.mp4'] }] });
    const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => makeRealTestVideoBuffer() });

    await generateBackgroundVideo({
      prompt: 'a calm ocean at sunset',
      aspectRatio: '9:16',
      durationSeconds: 6,
      uploadsDir,
      tmpDir,
      client,
      fetchImpl,
    });

    assert.deepEqual(client._createCalls[0], {
      model: 'gen4.5',
      promptText: 'a calm ocean at sunset',
      duration: 6,
      ratio: '720:1280',
    });
  });
});

test('generateBackgroundVideo polls through RUNNING with real progress before SUCCEEDED, and persists the real downloaded bytes', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({
      statuses: [
        { status: 'PENDING' },
        { status: 'RUNNING', progress: 0.25 },
        { status: 'RUNNING', progress: 0.75 },
        { status: 'SUCCEEDED', output: ['https://fake.runway/output.mp4'] },
      ],
    });
    const fetchImpl = async (url) => {
      assert.equal(url, 'https://fake.runway/output.mp4');
      return { ok: true, arrayBuffer: async () => makeRealTestVideoBuffer() };
    };

    const progressReports = [];
    const result = await generateBackgroundVideo({
      prompt: 'a calm ocean at sunset',
      aspectRatio: '16:9',
      uploadsDir,
      tmpDir,
      client,
      fetchImpl,
      pollIntervalMs: 1, // don't actually wait 5s per test
      onProgress: (fraction) => progressReports.push(fraction),
    });

    assert.deepEqual(progressReports, [0.25, 0.75]);
    assert.ok(result.clipId);
    assert.equal(result.taskId, 'task-123');
    assert.equal(result.prompt, 'a calm ocean at sunset');
    assert.ok(fs.existsSync(path.join(uploadsDir, result.clipId)), 'the downloaded video must be genuinely persisted to disk');
  });
});

test('generateBackgroundVideo throws a clear error on a FAILED task, with no file left behind', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'FAILED', failure: 'unsafe content detected' }] });
    await assert.rejects(
      () =>
        generateBackgroundVideo({
          prompt: 'a calm ocean at sunset',
          aspectRatio: '16:9',
          uploadsDir,
          tmpDir,
          client,
          pollIntervalMs: 1,
        }),
      /unsafe content detected/
    );
    assert.deepEqual(fs.readdirSync(uploadsDir), []);
  });
});

test('generateBackgroundVideo throws on a CANCELLED task', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'CANCELLED' }] });
    await assert.rejects(() =>
      generateBackgroundVideo({ prompt: 'a calm ocean at sunset', aspectRatio: '16:9', uploadsDir, tmpDir, client, pollIntervalMs: 1 })
    );
  });
});

test('generateBackgroundVideo times out rather than polling forever against a stuck task', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'RUNNING', progress: 0.1 }] });
    await assert.rejects(
      () =>
        generateBackgroundVideo({
          prompt: 'a calm ocean at sunset',
          aspectRatio: '16:9',
          uploadsDir,
          tmpDir,
          client,
          pollIntervalMs: 5,
          timeoutMs: 20,
        }),
      /timed out/
    );
  });
});

test('generateBackgroundVideo surfaces a download failure if the output URL 404s', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'SUCCEEDED', output: ['https://fake.runway/gone.mp4'] }] });
    const fetchImpl = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
    await assert.rejects(
      () =>
        generateBackgroundVideo({
          prompt: 'a calm ocean at sunset',
          aspectRatio: '16:9',
          uploadsDir,
          tmpDir,
          client,
          fetchImpl,
        }),
      /404/
    );
  });
});
