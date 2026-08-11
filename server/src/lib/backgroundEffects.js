const FPS = 25;

const VIDEO_FILTER_EXPRESSIONS = {
  grayscale: 'hue=s=0',
  sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0',
  warm: 'colorbalance=rs=0.15:gs=0.03:bs=-0.15',
  cool: 'colorbalance=rs=-0.15:gs=0:bs=0.15',
  vintage: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0,eq=contrast=0.92:saturation=0.85',
};

/** ffmpeg filter expression for a named color-look preset, or null for 'none'. */
export function videoFilterExpr(filterName) {
  if (!filterName || filterName === 'none') return null;
  const expr = VIDEO_FILTER_EXPRESSIONS[filterName];
  if (!expr) throw new Error(`Unknown videoFilter: ${filterName}`);
  return expr;
}

/** ffmpeg gaussian blur expression, or null when blurAmount is 0. */
export function blurFilterExpr(blurAmount) {
  if (!blurAmount || blurAmount <= 0) return null;
  return `gblur=sigma=${blurAmount}`;
}

/**
 * ffmpeg zoompan expression for a Ken Burns-style effect, or null for
 * 'none'. Uses the output frame counter `on` directly in the zoom/pan
 * expressions (e.g. `1+RATE*on`) rather than the self-referencing
 * `zoom+RATE` recurrence the docs often show -- verified by direct testing
 * that the self-referencing form does not actually animate in this ffmpeg
 * build (state doesn't persist across evaluations), while `on`-based
 * expressions do, for both a static (-loop 1) image and genuinely moving
 * video input.
 */
export function zoomPanFilterExpr(zoomPanStyle, canvasWidth, canvasHeight, totalDurationSeconds) {
  if (!zoomPanStyle || zoomPanStyle === 'none') return null;

  const totalFrames = Math.max(1, Math.round(totalDurationSeconds * FPS));
  const dims = `${canvasWidth}x${canvasHeight}`;
  const zoomRate = (0.3 / totalFrames).toFixed(8);
  const panZoom = 1.15;

  switch (zoomPanStyle) {
    case 'zoom-in':
      return `zoompan=z='min(1+${zoomRate}*on,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${dims}:fps=${FPS}`;
    case 'zoom-out':
      return `zoompan=z='max(1.3-${zoomRate}*on,1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${dims}:fps=${FPS}`;
    case 'pan-left':
      return `zoompan=z=${panZoom}:x='(iw-iw/${panZoom})*(1-on/${totalFrames})':y='ih/2-(ih/${panZoom}/2)':d=1:s=${dims}:fps=${FPS}`;
    case 'pan-right':
      return `zoompan=z=${panZoom}:x='(iw-iw/${panZoom})*(on/${totalFrames})':y='ih/2-(ih/${panZoom}/2)':d=1:s=${dims}:fps=${FPS}`;
    default:
      throw new Error(`Unknown backgroundZoomPan: ${zoomPanStyle}`);
  }
}
