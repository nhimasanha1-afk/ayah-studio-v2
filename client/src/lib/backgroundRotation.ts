// Mirrors server/src/lib/backgroundSequence.js's timing model exactly, so
// the preview shows the same clip the export would be showing at any given
// moment -- just without the crossfade blend itself (that's a real ffmpeg
// xfade filter, export-only), so a clip change here is a hard cut instead.

/** Mirrors resolvePlaybackOrder: 'sequential' keeps configured order, 'shuffle' is a one-time random permutation. */
export function resolvePlaybackOrder(clipIds: string[], order: 'sequential' | 'shuffle', random: () => number = Math.random): string[] {
  if (order === 'sequential') return [...clipIds];
  const shuffled = [...clipIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Mirrors planBackgroundSequence's instance spacing: instance k occupies
 * [k*step, k*step + slotDurationSeconds), where step = slotDurationSeconds -
 * transitionDurationSeconds (consecutive instances overlap by
 * transitionDurationSeconds -- that's where the crossfade happens on
 * export). For a moment that falls in an overlap region, this picks the
 * later-starting instance, matching how the crossfade finishes by fully
 * favoring the incoming clip.
 */
export function activeClipIndexAt(elapsedSeconds: number, slotDurationSeconds: number, transitionDurationSeconds: number): number {
  const step = slotDurationSeconds - transitionDurationSeconds;
  if (step <= 0 || elapsedSeconds <= 0) return 0;
  return Math.floor(elapsedSeconds / step);
}

/**
 * Mirrors planBackgroundSequence's own instance-counting loop (not a
 * closed-form formula) so this stays exactly in sync with what the export
 * will actually produce, including its cursor > SAFETY_LIMIT guard.
 */
export function instanceCountForDuration(
  totalDurationSeconds: number,
  slotDurationSeconds: number,
  transitionDurationSeconds: number
): number {
  if (totalDurationSeconds <= 0 || slotDurationSeconds <= 0) return 0;
  if (transitionDurationSeconds >= slotDurationSeconds) return 0;

  let cumulative = 0;
  let cursor = 0;
  const SAFETY_LIMIT = 2000;

  while (cumulative < totalDurationSeconds) {
    cumulative += cursor === 0 ? slotDurationSeconds : slotDurationSeconds - transitionDurationSeconds;
    cursor++;
    if (cursor > SAFETY_LIMIT) break;
  }

  return cursor;
}
