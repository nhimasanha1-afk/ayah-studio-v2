import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isUploadedCardImageId, resolveUploadedCardImagePath } from '../src/lib/cardImageUpload.js';

function withTempUploadsDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-image-uploads-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const VALID_ID = 'img-a1b2c3d4-e5f6-4789-a012-3456789abcde.png';

test('isUploadedCardImageId accepts only the img-UUID.ext shape we generate', () => {
  assert.equal(isUploadedCardImageId(VALID_ID), true);
  assert.equal(isUploadedCardImageId('a1b2c3d4-e5f6-4789-a012-3456789abcde.png'), false); // missing "img-" prefix -- would collide with a logo/background-video id shape otherwise
  assert.equal(isUploadedCardImageId('forest-1'), false); // curated library id
  assert.equal(isUploadedCardImageId('img-a1b2c3d4-e5f6-4789-a012-3456789abcde.mp4'), false); // video extension, not an image
  assert.equal(isUploadedCardImageId(null), false);
});

test('resolves a real, correctly-shaped imageId to its file path', () => {
  withTempUploadsDir((dir) => {
    fs.writeFileSync(path.join(dir, VALID_ID), 'fake-image-bytes');
    const resolved = resolveUploadedCardImagePath(VALID_ID, dir);
    assert.equal(resolved, path.join(dir, VALID_ID));
  });
});

test('rejects an imageId for a file that was never actually persisted', () => {
  withTempUploadsDir((dir) => {
    assert.throws(() => resolveUploadedCardImagePath(VALID_ID, dir));
  });
});

test('rejects path traversal attempts disguised as an imageId', () => {
  withTempUploadsDir((dir) => {
    const secretPath = path.join(dir, '..', 'secret.txt');
    fs.writeFileSync(secretPath, 'do not leak me');
    try {
      const attempts = ['../secret.txt', '..\\secret.txt', '../../etc/passwd', `${VALID_ID}/../../secret.txt`];
      for (const attempt of attempts) {
        assert.throws(() => resolveUploadedCardImagePath(attempt, dir), `expected "${attempt}" to be rejected`);
      }
    } finally {
      fs.rmSync(secretPath, { force: true });
    }
  });
});
