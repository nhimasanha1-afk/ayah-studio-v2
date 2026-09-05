import fs from 'node:fs';
import path from 'node:path';

// Real production failure: a completed export ("ffmpeg exited with code 0")
// still failed at the immediately-following ffprobe step with "No such file
// or directory". Root cause -- confirmed, not guessed -- is a Unix race: a
// concurrent enforceOutputSizeCap sweep unlinked the file while ffmpeg still
// held it open for writing. Unlinking an open file doesn't stop the writer
// (the data keeps going to the now-nameless inode until the fd closes), so
// ffmpeg exits 0 believing it succeeded, but the path is already gone by
// the time anything else tries to open it. Every export's output path is
// registered here for the job's full lifetime so no sweep can ever touch it
// mid-write or in the brief probing window right after.
const activeOutputPaths = new Set();

export function markOutputActive(outputPath) {
  activeOutputPaths.add(outputPath);
}

export function markOutputInactive(outputPath) {
  activeOutputPaths.delete(outputPath);
}

// Mirrors jobQueue.js's own JOB_TTL_MS: once a job's in-memory record is
// pruned, its downloadUrl is no longer reachable through the job-status API
// anyway, so keeping the actual output file around longer than that just
// wastes disk with no real benefit to anyone.
export const OUTPUT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Deletes export outputs (.mp4 + their paired .srt) older than maxAgeMs.
 * Exports are real, large files (100-250MB+ each) written to OUTPUT_DIR,
 * which on a real deployment lives on a small, fixed-size persistent disk
 * shared with logos/uploads -- confirmed via a real production failure
 * ("No space left on device", mid-export) that nothing was ever cleaning
 * these up, so a disk sized for small assets silently filled with
 * accumulated video exports until a write failed outright.
 *
 * Safe to call anytime (on startup, on an interval, or before starting a
 * new export) -- it only ever looks at file mtimes in outputDir, never
 * touches in-flight jobs, and a failed individual delete (e.g. a file
 * already gone) doesn't stop the rest of the sweep.
 */
export function cleanupOldOutputs(outputDir, maxAgeMs = OUTPUT_TTL_MS) {
  let entries;
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return { deleted: [], freedBytes: 0 };
  }

  const cutoff = Date.now() - maxAgeMs;
  const deleted = [];
  let freedBytes = 0;

  for (const name of entries) {
    const fullPath = path.join(outputDir, name);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.mtimeMs >= cutoff || activeOutputPaths.has(fullPath)) continue;

    try {
      fs.rmSync(fullPath, { force: true });
      deleted.push(name);
      freedBytes += stat.size;
    } catch (err) {
      console.warn(`[outputCleanup] failed to delete "${name}": ${err.message}`);
    }
  }

  return { deleted, freedBytes };
}

// A real-world burst of testing can produce several 100-250MB exports
// within minutes -- well inside cleanupOldOutputs' 2-hour window, so
// age-based cleanup alone does nothing to prevent "No space left on
// device" mid-burst (confirmed: it happened a second time, all files
// involved were under 2 hours old). This is the actual safety net for that
// case: independent of age, keep the directory's total size under a cap by
// deleting the *oldest* files first. Raised from the original 500MB now
// that 4K exports exist -- a single long, high-resolution export can
// legitimately be several hundred MB to over a GB on its own, and the
// persistent disk backing this is 10GB, so 5GB leaves real headroom for
// both a large single export and everything else sharing the disk
// (background clip cache, uploads).
export const OUTPUT_SIZE_CAP_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

// Defense in depth alongside the activeOutputPaths registry below: never
// consider a file for size-cap eviction until it's had time to fully
// finish writing and be probed. The registry closes the race in the
// common case, but this protects against any path that isn't registered
// (e.g. a future caller of enforceOutputSizeCap that forgets to).
const MIN_AGE_BEFORE_SIZE_CAP_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Deletes the oldest files in outputDir, oldest first, until the
 * directory's total size is at or under maxTotalBytes. Independent of
 * cleanupOldOutputs' age threshold -- meant to run alongside it, not
 * replace it, so a rapid burst of exports can't outrun a purely time-based
 * sweep the way it just did in production.
 *
 * Real production failure this specifically fixes: a completed export
 * ("ffmpeg exited with code 0") failed at the very next step (ffprobe) with
 * "No such file or directory" -- this sweep had unlinked the file while
 * ffmpeg still held it open for writing (unlinking an open file doesn't
 * stop the writer on Unix; the data just goes to a now-nameless inode until
 * the fd closes, so ffmpeg exits 0 believing it succeeded while the path is
 * already gone). Now skips anything in activeOutputPaths (registered for a
 * job's whole lifetime) and anything younger than MIN_AGE_BEFORE_SIZE_CAP_MS
 * as a second, path-independent guard against the same race.
 */
export function enforceOutputSizeCap(outputDir, maxTotalBytes = OUTPUT_SIZE_CAP_BYTES) {
  let entries;
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return { deleted: [], freedBytes: 0 };
  }

  const cutoff = Date.now() - MIN_AGE_BEFORE_SIZE_CAP_MS;
  const files = [];
  let totalBytes = 0;
  for (const name of entries) {
    const fullPath = path.join(outputDir, name);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    totalBytes += stat.size; // every file counts toward the total...
    if (stat.mtimeMs >= cutoff || activeOutputPaths.has(fullPath)) continue; // ...but only eligible ones can be evicted
    files.push({ name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
  }

  if (totalBytes <= maxTotalBytes) return { deleted: [], freedBytes: 0 };

  files.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first

  const deleted = [];
  let freedBytes = 0;
  for (const file of files) {
    if (totalBytes <= maxTotalBytes) break;
    try {
      fs.rmSync(file.fullPath, { force: true });
      deleted.push(file.name);
      freedBytes += file.size;
      totalBytes -= file.size;
    } catch (err) {
      console.warn(`[outputCleanup] failed to delete "${file.name}": ${err.message}`);
    }
  }

  return { deleted, freedBytes };
}
