const FPS = 25;

// A curated subset of ffmpeg's xfade transition names -- the full list is
// much longer, but these cover the visually distinct styles worth exposing.
export const TRANSITION_STYLES = [
  'fade',
  'dissolve',
  'wipeleft',
  'wiperight',
  'slideleft',
  'slideright',
  'circleopen',
  'pixelize',
];

/**
 * Builds the xfade chain that crossfades between background clip instances
 * with no black flash: every instance is scaled/cropped to fill the target
 * canvasWidth x canvasHeight (never letterboxed) and normalized to a common
 * fps/format/SAR before blending, since xfade requires matching inputs.
 * Each instance's ffmpeg input is expected to already be looped+trimmed to
 * exactly requiredSpanSeconds (slot + transition) by the caller -- see
 * surahExport.js's use of -stream_loop/-t per input.
 */
export function buildBackgroundFilterGraph({
  instances,
  slotDurationSeconds,
  transitionDurationSeconds,
  transitionStyle = 'fade',
  inputIndexOffset = 0,
  canvasWidth,
  canvasHeight,
}) {
  if (instances.length === 0) {
    throw new Error('buildBackgroundFilterGraph requires at least one instance');
  }
  if (!TRANSITION_STYLES.includes(transitionStyle)) {
    throw new Error(`Unknown transitionStyle "${transitionStyle}". Options: ${TRANSITION_STYLES.join(', ')}`);
  }

  const requiredSpanSeconds = slotDurationSeconds + transitionDurationSeconds;
  const parts = [];

  instances.forEach((_, i) => {
    const inputIndex = inputIndexOffset + i;
    parts.push(
      `[${inputIndex}:v]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight},fps=${FPS},format=yuv420p,setsar=1[c${i}]`
    );
  });

  if (instances.length === 1) {
    parts.push('[c0]null[bgraw]');
    return { filterParts: parts, outputLabel: 'bgraw', requiredSpanSeconds };
  }

  let cumulative = slotDurationSeconds;
  let prevLabel = 'c0';
  for (let k = 1; k < instances.length; k++) {
    const offset = cumulative - transitionDurationSeconds;
    const outLabel = k === instances.length - 1 ? 'bgraw' : `x${k}`;
    parts.push(
      `[${prevLabel}][c${k}]xfade=transition=${transitionStyle}:duration=${transitionDurationSeconds}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    cumulative += slotDurationSeconds - transitionDurationSeconds;
    prevLabel = outLabel;
  }

  return { filterParts: parts, outputLabel: 'bgraw', requiredSpanSeconds };
}
