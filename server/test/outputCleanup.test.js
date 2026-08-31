import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupOldOutputs } from '../src/lib/outputCleanup.js';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outputcleanup-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFileWithAge(dir, name, ageMs, content = 'x'.repeat(100)) {
  const fullPath = path.join(dir, name);
  fs.writeFileSync(fullPath, content);
  const past = new Date(Date.now() - ageMs);
  fs.utimesSync(fullPath, past, past);
  return fullPath;
}

test('deletes files older than maxAgeMs, leaves newer ones alone', () => {
  withTempDir((dir) => {
    const oldFile = writeFileWithAge(dir, 'old.mp4', 3 * 60 * 60 * 1000); // 3h old
    const newFile = writeFileWithAge(dir, 'new.mp4', 5 * 60 * 1000); // 5min old

    const { deleted } = cleanupOldOutputs(dir, 2 * 60 * 60 * 1000);

    assert.ok(!fs.existsSync(oldFile), 'old file should be deleted');
    assert.ok(fs.existsSync(newFile), 'new file should survive');
    assert.deepEqual(deleted, ['old.mp4']);
  });
});

test('deletes a real export pair (.mp4 + .srt) once both are old enough', () => {
  withTempDir((dir) => {
    const mp4 = writeFileWithAge(dir, 'surah-1-123.mp4', 3 * 60 * 60 * 1000);
    const srt = writeFileWithAge(dir, 'surah-1-123.srt', 3 * 60 * 60 * 1000);

    const { deleted } = cleanupOldOutputs(dir, 2 * 60 * 60 * 1000);

    assert.ok(!fs.existsSync(mp4));
    assert.ok(!fs.existsSync(srt));
    assert.equal(deleted.length, 2);
  });
});

test('reports real freed bytes, not a fabricated count', () => {
  withTempDir((dir) => {
    writeFileWithAge(dir, 'old.mp4', 3 * 60 * 60 * 1000, 'x'.repeat(500));
    writeFileWithAge(dir, 'old2.mp4', 3 * 60 * 60 * 1000, 'x'.repeat(300));

    const { freedBytes } = cleanupOldOutputs(dir, 2 * 60 * 60 * 1000);
    assert.equal(freedBytes, 800);
  });
});

test('a missing/nonexistent directory is a harmless no-op, not a crash', () => {
  const result = cleanupOldOutputs('/definitely/does/not/exist/anywhere');
  assert.deepEqual(result, { deleted: [], freedBytes: 0 });
});

test('an empty directory is a harmless no-op', () => {
  withTempDir((dir) => {
    const result = cleanupOldOutputs(dir);
    assert.deepEqual(result, { deleted: [], freedBytes: 0 });
  });
});

test('nothing is deleted when everything is within the age limit', () => {
  withTempDir((dir) => {
    writeFileWithAge(dir, 'recent.mp4', 10 * 60 * 1000);
    const { deleted } = cleanupOldOutputs(dir, 2 * 60 * 60 * 1000);
    assert.deepEqual(deleted, []);
  });
});
