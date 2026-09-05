import os from 'node:os';

// os.totalmem() reports the HOST machine's memory, not a Docker container's
// cgroup limit -- confirmed via Node's own docs and process.constrainedMemory
// (added in Node 20.13/22 specifically to fix this gap). Render enforces the
// plan's real memory limit via a cgroup, so relying on os.totalmem() alone
// inside the container would silently see the host's (much larger) memory
// and let every 4K request through regardless of the actual plan -- the
// exact failure mode this guard exists to prevent. constrainedMemory()
// returns 0 when no cgroup limit is in effect (e.g. local dev, outside
// Docker), in which case os.totalmem() is the right fallback.
function getAvailableMemoryBytes() {
  const constrained = typeof process.constrainedMemory === 'function' ? process.constrainedMemory() : 0;
  return constrained > 0 ? constrained : os.totalmem();
}

// 4K roughly quadruples the pixel count (and therefore the memory/CPU cost)
// of the 1080p pipeline, which itself was only brought under a safe memory
// ceiling this session by a dedicated fix (measured ~590MB peak on a 2GB
// instance, after the fix). Nothing about 4K has been measured directly
// yet, so this threshold is a deliberately conservative estimate, not a
// guarantee -- the point is to fail a 4K request cleanly with a clear
// message instead of risking an OOM crash, which previously took down the
// whole service (every in-flight job, not just the one that triggered it),
// not just this one export.
export const MIN_TOTAL_MEMORY_BYTES_FOR_4K = 6 * 1024 * 1024 * 1024; // 6GB

/**
 * Returns { ok: true } when the requested resolution is safe to attempt on
 * this instance, or { ok: false, error } with a user-facing message
 * otherwise. totalMemBytes is injectable so this can be unit tested without
 * depending on the real host's memory.
 */
export function checkResolutionMemoryRequirement(resolution, totalMemBytes = getAvailableMemoryBytes()) {
  if (resolution !== '4k') return { ok: true };
  if (totalMemBytes >= MIN_TOTAL_MEMORY_BYTES_FOR_4K) return { ok: true };

  const availableGb = (totalMemBytes / 1024 / 1024 / 1024).toFixed(1);
  const requiredGb = (MIN_TOTAL_MEMORY_BYTES_FOR_4K / 1024 / 1024 / 1024).toFixed(0);
  return {
    ok: false,
    error: `4K export needs a larger server plan than this instance has (${availableGb}GB RAM available, ~${requiredGb}GB recommended) -- attempting it risks crashing the whole service, not just this export. Upgrade the compute plan, or export at 1080p instead.`,
  };
}
