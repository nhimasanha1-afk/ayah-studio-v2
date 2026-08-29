/**
 * Single source of truth for the intro/Bismillah timing window. Every place
 * that needs to know "is Bismillah audible", "is Bismillah text visible", or
 * "how long does the intro window last" must call these functions -- do not
 * recompute any of this inline. In the prior build this exact calculation
 * was duplicated across ~9 functions and drifted out of sync; that bug class
 * is why this module exists.
 *
 * The rule, verbatim from the project brief:
 *   "text toggle controls visibility only, audio toggle controls playback
 *   only, timing window opens if either is on."
 *
 * Concretely:
 *   - shouldShowBismillahText() reads ONLY bismillahTextEnabled.
 *   - shouldPlayBismillahAudio() reads ONLY bismillahAudioEnabled.
 *   - Neither may consult the other's toggle. A user must be able to have
 *     audio on with text off, or text on with audio off.
 *   - Timing is CONCURRENT, not sequential: if the intro card is on,
 *     Bismillah recites during that same window starting at t=0 -- it does
 *     not add its own duration on top of the card's.
 *   - If only Bismillah (no intro card) is on, its own duration (real
 *     decoded audio duration when audio is on) is the window.
 */

export function shouldShowBismillahText({ bismillahTextEnabled }) {
  return Boolean(bismillahTextEnabled);
}

export function shouldPlayBismillahAudio({ bismillahAudioEnabled }) {
  return Boolean(bismillahAudioEnabled);
}

/**
 * @param {object} config
 * @param {boolean} config.introCardEnabled
 * @param {boolean} config.bismillahTextEnabled
 * @param {boolean} config.bismillahAudioEnabled
 * @param {number} [config.bismillahAudioDurationMs] - REAL decoded duration
 *   (ffprobe on the actual audio file), required when bismillahAudioEnabled.
 *   Never pass a timing-data end-timestamp here; that can be short of the
 *   true audio due to trailing silence.
 * @param {number} [config.introCardDurationMs] - how long the intro card is
 *   displayed when shown with no audio (or when audio is shorter than it).
 * @returns {{ windowMs: number, startMs: 0, endMs: number }}
 */
export function computeIntroTimingWindow({
  introCardEnabled,
  bismillahTextEnabled,
  bismillahAudioEnabled,
  bismillahAudioDurationMs,
  introCardDurationMs = 6000,
}) {
  const audioOn = shouldPlayBismillahAudio({ bismillahAudioEnabled });
  const textOn = shouldShowBismillahText({ bismillahTextEnabled });
  const anythingOn = introCardEnabled || textOn || audioOn;

  if (!anythingOn) {
    return { windowMs: 0, startMs: 0, endMs: 0 };
  }

  if (audioOn) {
    if (typeof bismillahAudioDurationMs !== 'number' || bismillahAudioDurationMs <= 0) {
      throw new Error(
        'computeIntroTimingWindow: bismillahAudioDurationMs (real decoded duration) is required when bismillahAudioEnabled is true'
      );
    }
    // Concurrent: both the card and the audio start at t=0. The window must
    // be at least as long as the audio (never truncate real recitation),
    // and at least as long as the card's own duration if the card is shown.
    const windowMs = introCardEnabled
      ? Math.max(bismillahAudioDurationMs, introCardDurationMs)
      : bismillahAudioDurationMs;
    return { windowMs, startMs: 0, endMs: windowMs };
  }

  // No audio: the window is driven purely by whichever visual is on.
  const windowMs = introCardEnabled || textOn ? introCardDurationMs : 0;
  return { windowMs, startMs: 0, endMs: windowMs };
}
