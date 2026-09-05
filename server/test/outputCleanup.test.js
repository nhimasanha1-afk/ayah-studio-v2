import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupOldOutputs, enforceOutputSizeCap, markOutputActive, markOutputInactive } from '../src/lib/outputCleanup.js';

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

test('a file registered as active survives age-based cleanup even if old enough to otherwise qualify', () => {
  withTempDir((dir) => {
    const active = writeFileWithAge(dir, 'still-writing.mp4', 3 * 60 * 60 * 1000);
    markOutputActive(active);
    try {
      const { deleted } = cleanupOldOutputs(dir, 2 * 60 * 60 * 1000);
      assert.deepEqual(deleted, []);
      assert.ok(fs.existsSync(active));
    } finally {
      markOutputInactive(active);
    }
  });
});

// --- enforceOutputSizeCap: the actual gap age-based cleanup left open --
// a burst of exports minutes apart (all well under any sane age threshold)
// that together exceed the disk's real capacity. Confirmed in production:
// a second "No space left on device" failure where every file involved was
// under 2 hours old, so age-based cleanup correctly left them all alone.

test('does nothing when total size is already under the cap', () => {
  withTempDir((dir) => {
    writeFileWithAge(dir, 'a.mp4', 5 * 60 * 1000, 'x'.repeat(100));
    writeFileWithAge(dir, 'b.mp4', 1 * 60 * 1000, 'x'.repeat(100));
    const { deleted, freedBytes } = enforceOutputSizeCap(dir, 1000);
    assert.deepEqual(deleted, []);
    assert.equal(freedBytes, 0);
  });
});

test('deletes the OLDEST files first, regardless of age, until under the cap', () => {
  withTempDir((dir) => {
    // All three are "recent" by any age-based standard (minutes old), but
    // together they exceed a small cap -- this is the exact burst scenario
    // that broke production.
    const oldest = writeFileWithAge(dir, 'oldest.mp4', 30 * 60 * 1000, 'x'.repeat(400));
    const middle = writeFileWithAge(dir, 'middle.mp4', 20 * 60 * 1000, 'x'.repeat(400));
    const newest = writeFileWithAge(dir, 'newest.mp4', 10 * 60 * 1000, 'x'.repeat(400));

    const { deleted } = enforceOutputSizeCap(dir, 900);

    // Total is 1200 bytes; must drop to <=900, so the single oldest file
    // (400 bytes) is deleted, leaving 800 -- under the cap.
    assert.deepEqual(deleted, ['oldest.mp4']);
    assert.ok(!fs.existsSync(oldest));
    assert.ok(fs.existsSync(middle));
    assert.ok(fs.existsSync(newest));
  });
});

test('deletes as many oldest files as needed, not just one, to get under the cap', () => {
  withTempDir((dir) => {
    writeFileWithAge(dir, 'a.mp4', 40 * 60 * 1000, 'x'.repeat(300));
    writeFileWithAge(dir, 'b.mp4', 30 * 60 * 1000, 'x'.repeat(300));
    writeFileWithAge(dir, 'c.mp4', 20 * 60 * 1000, 'x'.repeat(300));
    const survivor = writeFileWithAge(dir, 'd.mp4', 10 * 60 * 1000, 'x'.repeat(300));

    const { deleted, freedBytes } = enforceOutputSizeCap(dir, 300);

    assert.deepEqual(deleted, ['a.mp4', 'b.mp4', 'c.mp4']);
    assert.equal(freedBytes, 900);
    assert.ok(fs.existsSync(survivor), 'the single newest file should survive since it alone fits the cap');
  });
});

test('a missing/nonexistent directory is a harmless no-op for the size cap too', () => {
  const result = enforceOutputSizeCap('/definitely/does/not/exist/anywhere', 1000);
  assert.deepEqual(result, { deleted: [], freedBytes: 0 });
});

// --- Real production failure this section fixes: a completed export
// ("ffmpeg exited with code 0") failed at the immediately-following ffprobe
// step with "No such file or directory". Root cause -- confirmed via the
// real Unix semantics of unlinking an open file, not guessed -- was this
// exact sweep deleting the file while ffmpeg still held it open for
// writing (an unlink doesn't stop the writer; ffmpeg finishes and exits 0,
// but the path is already gone by the time anything else opens it).

test('a file registered as active is never deleted by the size cap, even if it is by far the oldest and largest', () => {
  withTempDir((dir) => {
    const active = writeFileWithAge(dir, 'in-progress-export.mp4', 60 * 60 * 1000, 'x'.repeat(1000));
    markOutputActive(active);
    try {
      const { deleted } = enforceOutputSizeCap(dir, 10);
      assert.deepEqual(deleted, []);
      assert.ok(fs.existsSync(active), 'the active export must survive regardless of size/age');
    } finally {
      markOutputInactive(active);
    }
  });
});

test('once marked inactive, a file is eligible for size-cap eviction again', () => {
  withTempDir((dir) => {
    const path_ = writeFileWithAge(dir, 'finished-export.mp4', 60 * 60 * 1000, 'x'.repeat(1000));
    markOutputActive(path_);
    markOutputInactive(path_);
    const { deleted } = enforceOutputSizeCap(dir, 10);
    assert.deepEqual(deleted, ['finished-export.mp4']);
  });
});

test('a file younger than the minimum-age grace window is protected from size-cap eviction even if unregistered', () => {
  withTempDir((dir) => {
    // 2 minutes old -- well under the 10-minute grace window, and never
    // registered via markOutputActive, so this is testing the
    // path-independent backstop, not the registry.
    const justFinished = writeFileWithAge(dir, 'just-finished.mp4', 2 * 60 * 1000, 'x'.repeat(1000));
    const { deleted } = enforceOutputSizeCap(dir, 10);
    assert.deepEqual(deleted, []);
    assert.ok(fs.existsSync(justFinished));
  });
});

test('a large recent file still counts toward the total even though it cannot itself be evicted', () => {
  withTempDir((dir) => {
    // The recent (protected) file alone exceeds the cap; an older, evictable
    // file also exists. The old one should still be deleted -- the total
    // includes the protected file's bytes, it just can't be the one removed.
    const recent = writeFileWithAge(dir, 'recent.mp4', 1 * 60 * 1000, 'x'.repeat(1000));
    const old = writeFileWithAge(dir, 'old.mp4', 60 * 60 * 1000, 'x'.repeat(500));
    const { deleted } = enforceOutputSizeCap(dir, 100);
    assert.deepEqual(deleted, ['old.mp4']);
    assert.ok(fs.existsSync(recent));
  });
});
