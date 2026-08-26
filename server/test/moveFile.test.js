import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { moveFile } from '../src/lib/moveFile.js';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movefile-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('moveFile moves a real file via a plain rename when possible', () => {
  withTempDir((dir) => {
    const src = path.join(dir, 'source.txt');
    const dest = path.join(dir, 'dest.txt');
    fs.writeFileSync(src, 'hello');

    moveFile(src, dest);

    assert.equal(fs.existsSync(src), false);
    assert.equal(fs.readFileSync(dest, 'utf8'), 'hello');
  });
});

test('moveFile falls back to copy+delete when rename throws EXDEV (simulated cross-device move)', () => {
  withTempDir((dir) => {
    const src = path.join(dir, 'source.txt');
    const dest = path.join(dir, 'dest.txt');
    fs.writeFileSync(src, 'cross-device content');

    const originalRename = fs.renameSync;
    fs.renameSync = () => {
      const err = new Error('EXDEV: cross-device link not permitted');
      err.code = 'EXDEV';
      throw err;
    };

    try {
      moveFile(src, dest);
    } finally {
      fs.renameSync = originalRename;
    }

    assert.equal(fs.existsSync(src), false, 'source must be deleted after the copy+delete fallback');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'cross-device content');
  });
});

test('moveFile re-throws non-EXDEV errors rather than silently falling back', () => {
  withTempDir((dir) => {
    const src = path.join(dir, 'does-not-exist.txt');
    const dest = path.join(dir, 'dest.txt');
    assert.throws(() => moveFile(src, dest), /ENOENT/);
  });
});
