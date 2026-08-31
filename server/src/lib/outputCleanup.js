import fs from 'node:fs';
import path from 'node:path';

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
    if (!stat.isFile() || stat.mtimeMs >= cutoff) continue;

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
// deleting the *oldest* files first.
export const OUTPUT_SIZE_CAP_BYTES = 500 * 1024 * 1024; // 500MB

/**
 * Deletes the oldest files in outputDir, oldest first, until the
 * directory's total size is at or under maxTotalBytes. Independent of
 * cleanupOldOutputs' age threshold -- meant to run alongside it, not
 * replace it, so a rapid burst of exports can't outrun a purely time-based
 * sweep the way it just did in production.
 */
export function enforceOutputSizeCap(outputDir, maxTotalBytes = OUTPUT_SIZE_CAP_BYTES) {
  let entries;
  try {
    entries = fs.readdirSync(outputDir);
  } catch {
    return { deleted: [], freedBytes: 0 };
  }

  const files = [];
  for (const name of entries) {
    const fullPath = path.join(outputDir, name);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isFile()) files.push({ name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
  }

  let totalBytes = files.reduce((sum, f) => sum + f.size, 0);
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
