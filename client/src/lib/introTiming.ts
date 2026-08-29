// Mirrors server/src/lib/introTiming.js's computeIntroTimingWindow exactly,
// so the preview's real intro-phase duration matches what the export will
// actually produce. See that file for the full rationale; the short version:
// text toggle controls visibility only, audio toggle controls playback only,
// and timing is concurrent (card + audio both start at t=0), never additive.
export function computeIntroTimingWindow({
  introCardEnabled,
  bismillahTextEnabled,
  bismillahAudioEnabled,
  bismillahAudioDurationMs,
  introCardDurationMs = 6000,
}: {
  introCardEnabled: boolean;
  bismillahTextEnabled: boolean;
  bismillahAudioEnabled: boolean;
  bismillahAudioDurationMs?: number | null;
  introCardDurationMs?: number;
}): { windowMs: number; startMs: 0; endMs: number } {
  const audioOn = Boolean(bismillahAudioEnabled);
  const textOn = Boolean(bismillahTextEnabled);
  const anythingOn = introCardEnabled || textOn || audioOn;

  if (!anythingOn) {
    return { windowMs: 0, startMs: 0, endMs: 0 };
  }

  if (audioOn && typeof bismillahAudioDurationMs === 'number' && bismillahAudioDurationMs > 0) {
    const windowMs = introCardEnabled ? Math.max(bismillahAudioDurationMs, introCardDurationMs) : bismillahAudioDurationMs;
    return { windowMs, startMs: 0, endMs: windowMs };
  }

  // No audio (or its real duration hasn't loaded yet) -- driven purely by
  // whichever visual is on.
  const windowMs = introCardEnabled || textOn ? introCardDurationMs : 0;
  return { windowMs, startMs: 0, endMs: windowMs };
}
