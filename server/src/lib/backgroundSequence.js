/**
 * Resolves the pool's playback order. 'sequential' keeps the configured
 * order (this is what manual reordering in a future UI would control);
 * 'shuffle' returns a random one-time permutation. `random` is injectable
 * so shuffling is deterministic in tests.
 */
export function resolvePlaybackOrder(clips, order, random = Math.random) {
  if (clips.length === 0) {
    throw new Error('resolvePlaybackOrder requires at least one clip');
  }
  if (order === 'sequential') {
    return [...clips];
  }
  if (order === 'shuffle') {
    const shuffled = [...clips];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  throw new Error(`Unknown playback order: ${order}`);
}

/**
 * Cycles through orderedClips (repeating from the start as needed) to cover
 * totalDurationSeconds, where each instance occupies slotDurationSeconds and
 * consecutive instances overlap by transitionDurationSeconds (that overlap
 * is where the crossfade happens -- it is not extra time on top). Returns
 * one entry per clip *instance* (a clip repeated in the cycle appears more
 * than once).
 */
export function planBackgroundSequence({
  orderedClips,
  totalDurationSeconds,
  slotDurationSeconds,
  transitionDurationSeconds,
}) {
  if (orderedClips.length === 0) {
    throw new Error('planBackgroundSequence requires at least one clip');
  }
  if (transitionDurationSeconds >= slotDurationSeconds) {
    throw new Error('transitionDurationSeconds must be shorter than slotDurationSeconds');
  }
  if (totalDurationSeconds <= 0) {
    return [];
  }

  const instances = [];
  let cumulative = 0;
  let cursor = 0;
  const SAFETY_LIMIT = 2000;

  while (cumulative < totalDurationSeconds) {
    const clip = orderedClips[cursor % orderedClips.length];
    instances.push({ clip, cycleIndex: cursor });
    cumulative += cursor === 0 ? slotDurationSeconds : slotDurationSeconds - transitionDurationSeconds;
    cursor++;
    if (cursor > SAFETY_LIMIT) {
      throw new Error('planBackgroundSequence: exceeded safety limit, check duration/slot/transition values');
    }
  }

  return instances;
}

/** Total timeline duration produced by a given instance count/slot/transition combo. */
export function sequenceDuration(instanceCount, slotDurationSeconds, transitionDurationSeconds) {
  if (instanceCount <= 0) return 0;
  return slotDurationSeconds + (instanceCount - 1) * (slotDurationSeconds - transitionDurationSeconds);
}
