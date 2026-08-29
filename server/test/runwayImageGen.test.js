import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPathBin from 'ffmpeg-static';
import { generateCardImage, ratioForAspectRatio } from '../src/lib/runwayImageGen.js';

async function withTempDirs(fn) {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runway-img-uploads-test-'));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runway-img-tmp-test-'));
  try {
    return await fn(uploadsDir, tmpDir);
  } finally {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function makeRealTestImageBuffer() {
  const tmpFile = path.join(os.tmpdir(), `runway-fake-image-output-${Date.now()}.png`);
  const result = spawnSync(ffmpegPathBin, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=48x48', '-frames:v', '1', tmpFile]);
  assert.equal(result.status, 0, `ffmpeg test-image generation failed: ${result.stderr}`);
  const buffer = fs.readFileSync(tmpFile);
  fs.rmSync(tmpFile, { force: true });
  return buffer;
}

// A fake Runway client that walks through PENDING -> RUNNING(progress) ->
// SUCCEEDED across successive retrieve() calls, so the polling loop and
// progress reporting get real exercise without hitting the real paid API.
function makeFakeClient({ statuses, createResponse = { id: 'task-456' } }) {
  let call = 0;
  const createCalls = [];
  return {
    textToImage: {
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

test('ratioForAspectRatio maps the app aspect ratios onto gen4_image\'s exact allowed ratios', () => {
  assert.equal(ratioForAspectRatio('16:9'), '1280:720');
  assert.equal(ratioForAspectRatio('9:16'), '720:1280');
});

test('ratioForAspectRatio rejects an unsupported ratio', () => {
  assert.throws(() => ratioForAspectRatio('1:1'));
});

test('generateCardImage rejects an empty or oversized prompt before ever calling Runway', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [] });
    await assert.rejects(() => generateCardImage({ prompt: '', aspectRatio: '16:9', uploadsDir, tmpDir, client }));
    await assert.rejects(() =>
      generateCardImage({ prompt: 'x'.repeat(1001), aspectRatio: '16:9', uploadsDir, tmpDir, client })
    );
    assert.equal(client._createCalls.length, 0, 'Runway should never be called for invalid input');
  });
});

test('generateCardImage sends the real gen4_image request shape', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'SUCCEEDED', output: ['https://fake.runway/output.png'] }] });
    const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => makeRealTestImageBuffer() });

    await generateCardImage({
      prompt: 'a golden ornate frame around empty space',
      aspectRatio: '9:16',
      uploadsDir,
      tmpDir,
      client,
      fetchImpl,
    });

    assert.deepEqual(client._createCalls[0], {
      model: 'gen4_image',
      promptText: 'a golden ornate frame around empty space',
      ratio: '720:1280',
    });
  });
});

test('generateCardImage polls through RUNNING with real progress before SUCCEEDED, and persists the real downloaded bytes', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({
      statuses: [
        { status: 'PENDING' },
        { status: 'RUNNING', progress: 0.3 },
        { status: 'RUNNING', progress: 0.8 },
        { status: 'SUCCEEDED', output: ['https://fake.runway/output.png'] },
      ],
    });
    const fetchImpl = async (url) => {
      assert.equal(url, 'https://fake.runway/output.png');
      return { ok: true, arrayBuffer: async () => makeRealTestImageBuffer() };
    };

    const progressReports = [];
    const result = await generateCardImage({
      prompt: 'a serene mosque silhouette at dusk',
      aspectRatio: '16:9',
      uploadsDir,
      tmpDir,
      client,
      fetchImpl,
      pollIntervalMs: 1, // don't actually wait 5s per test
      onProgress: (fraction) => progressReports.push(fraction),
    });

    assert.deepEqual(progressReports, [0.3, 0.8]);
    assert.ok(result.imageId);
    assert.equal(result.taskId, 'task-456');
    assert.equal(result.prompt, 'a serene mosque silhouette at dusk');
    assert.ok(fs.existsSync(path.join(uploadsDir, result.imageId)), 'the downloaded image must be genuinely persisted to disk');
  });
});

test('generateCardImage throws a clear error on a FAILED task, with no file left behind', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'FAILED', failure: 'unsafe content detected' }] });
    await assert.rejects(
      () =>
        generateCardImage({
          prompt: 'a serene mosque silhouette at dusk',
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

test('generateCardImage throws on a CANCELLED task', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'CANCELLED' }] });
    await assert.rejects(() =>
      generateCardImage({ prompt: 'a serene mosque silhouette at dusk', aspectRatio: '16:9', uploadsDir, tmpDir, client, pollIntervalMs: 1 })
    );
  });
});

test('generateCardImage times out rather than polling forever against a stuck task', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'RUNNING', progress: 0.1 }] });
    await assert.rejects(
      () =>
        generateCardImage({
          prompt: 'a serene mosque silhouette at dusk',
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

test('generateCardImage surfaces a download failure if the output URL 404s', async () => {
  await withTempDirs(async (uploadsDir, tmpDir) => {
    const client = makeFakeClient({ statuses: [{ status: 'SUCCEEDED', output: ['https://fake.runway/gone.png'] }] });
    const fetchImpl = async () => ({ ok: false, status: 404, statusText: 'Not Found' });
    await assert.rejects(
      () =>
        generateCardImage({
          prompt: 'a serene mosque silhouette at dusk',
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
