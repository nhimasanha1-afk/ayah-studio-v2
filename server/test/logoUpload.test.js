import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveUploadedLogoPath } from '../src/lib/logoUpload.js';

function withTempUploadsDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-uploads-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const VALID_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde.png';

test('resolves a real, correctly-shaped logoId to its file path', () => {
  withTempUploadsDir((dir) => {
    fs.writeFileSync(path.join(dir, VALID_ID), 'fake-image-bytes');
    const resolved = resolveUploadedLogoPath(VALID_ID, dir);
    assert.equal(resolved, path.join(dir, VALID_ID));
  });
});

test('rejects a logoId for a file that was never actually persisted', () => {
  withTempUploadsDir((dir) => {
    assert.throws(() => resolveUploadedLogoPath(VALID_ID, dir));
  });
});

test('rejects path traversal attempts disguised as a logoId', () => {
  withTempUploadsDir((dir) => {
    // Put a real secret file one level above the uploads dir to prove
    // traversal would actually reach something if it worked.
    const secretPath = path.join(dir, '..', 'secret.txt');
    fs.writeFileSync(secretPath, 'do not leak me');
    try {
      const attempts = [
        '../secret.txt',
        '..\\secret.txt',
        '../../etc/passwd',
        'a1b2c3d4-e5f6-4789-a012-3456789abcde.png/../../secret.txt',
      ];
      for (const attempt of attempts) {
        assert.throws(() => resolveUploadedLogoPath(attempt, dir), `expected "${attempt}" to be rejected`);
      }
    } finally {
      fs.rmSync(secretPath, { force: true });
    }
  });
});

test('rejects a logoId with a disallowed extension', () => {
  withTempUploadsDir((dir) => {
    const svgId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde.svg';
    fs.writeFileSync(path.join(dir, svgId), '<svg onload="alert(1)"></svg>');
    assert.throws(() => resolveUploadedLogoPath(svgId, dir));
  });
});

test('rejects non-string / malformed input rather than crashing oddly', () => {
  withTempUploadsDir((dir) => {
    assert.throws(() => resolveUploadedLogoPath(null, dir));
    assert.throws(() => resolveUploadedLogoPath(undefined, dir));
    assert.throws(() => resolveUploadedLogoPath(123, dir));
    assert.throws(() => resolveUploadedLogoPath('', dir));
  });
});

test('rejects a UUID-shaped id that just omits the extension', () => {
  withTempUploadsDir((dir) => {
    assert.throws(() => resolveUploadedLogoPath('a1b2c3d4-e5f6-4789-a012-3456789abcde', dir));
  });
});
