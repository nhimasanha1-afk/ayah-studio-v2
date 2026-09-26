export const RESOLUTIONS = ['720p', '1080p', '4k'];
export const ASPECT_RATIOS = ['16:9', '9:16'];

const DIMENSIONS = {
  '16:9': {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
  },
  '9:16': {
    '720p': { width: 720, height: 1280 },
    '1080p': { width: 1080, height: 1920 },
    '4k': { width: 2160, height: 3840 },
  },
};

export function getCanvasDimensions(aspectRatio, resolution) {
  const dims = DIMENSIONS[aspectRatio]?.[resolution];
  if (!dims) throw new Error(`Unknown aspectRatio/resolution combo: ${aspectRatio}/${resolution}`);
  return dims;
}

/**
 * 1080p is exactly 1.5x and 4k is exactly 3x the linear size of 720p in
 * both directions for every aspect ratio we support, so a single uniform
 * multiplier correctly scales font sizes/padding/badge sizes to look the
 * same proportion of the frame regardless of resolution. Positioning itself
 * doesn't use this -- see the fraction-based functions below, which are
 * resolution- and aspect-ratio-independent by construction.
 */
export function getScaleFactor(resolution) {
  if (resolution === '4k') return 3;
  if (resolution === '1080p') return 1.5;
  return 1;
}

const BASE_PAD = 40; // at scaleFactor 1

export function getPad(scaleFactor = 1) {
  return Math.round(BASE_PAD * scaleFactor);
}

/** x/y expressions for drawtext, keyed by one of the 6 badge positions. Uses ffmpeg's own dynamic w/h, so it's resolution-independent already; only the padding scales. */
export function drawtextPositionExpr(position, scaleFactor = 1) {
  const pad = Math.round(BASE_PAD * scaleFactor);
  const xLeft = `${pad}`;
  const xCenter = `(w-text_w)/2`;
  const xRight = `w-text_w-${pad}`;
  const yTop = `${pad}`;
  const yBottom = `h-text_h-${pad}`;

  switch (position) {
    case 'top-left': return { x: xLeft, y: yTop };
    case 'top-center': return { x: xCenter, y: yTop };
    case 'top-right': return { x: xRight, y: yTop };
    case 'bottom-left': return { x: xLeft, y: yBottom };
    case 'bottom-center': return { x: xCenter, y: yBottom };
    case 'bottom-right': return { x: xRight, y: yBottom };
    default: throw new Error(`Unknown position: ${position}`);
  }
}

/** x/y expressions for the overlay filter (logo), sized as a size x size square. `size` should already be scaled by the caller. */
export function overlayPositionExpr(position, size, scaleFactor = 1) {
  const pad = Math.round(BASE_PAD * scaleFactor);
  const xLeft = `${pad}`;
  const xCenter = `(main_w-${size})/2`;
  const xRight = `main_w-${size}-${pad}`;
  const yTop = `${pad}`;
  const yBottom = `main_h-${size}-${pad}`;

  switch (position) {
    case 'top-left': return { x: xLeft, y: yTop };
    case 'top-center': return { x: xCenter, y: yTop };
    case 'top-right': return { x: xRight, y: yTop };
    case 'bottom-left': return { x: xLeft, y: yBottom };
    case 'bottom-center': return { x: xCenter, y: yBottom };
    case 'bottom-right': return { x: xRight, y: yBottom };
    default: throw new Error(`Unknown position: ${position}`);
  }
}

/**
 * Where the Arabic/translation caption block sits vertically, and the scrim
 * band behind it, for each of the 3 textPosition modes. Expressed as
 * fractions of canvas height -- the exact fractions that were tuned by eye
 * on a 1280x720 (16:9) canvas -- so the same visual layout carries over
 * correctly to any resolution or aspect ratio without a separate constant
 * table per combination. ASS Alignment codes: 8 = top-center, 5 =
 * middle-center, 2 = bottom-center.
 */
const CAPTION_LAYOUT_FRACTIONS = {
  'upper-third': { alignment: 8, arabicMarginV: 50 / 720, translationMarginV: 120 / 720, scrimTop: 30 / 720, scrimHeight: 145 / 720 },
  'lower-third': { alignment: 2, arabicMarginV: 120 / 720, translationMarginV: 50 / 720, scrimTop: 545 / 720, scrimHeight: 145 / 720 },
  center: { alignment: 5, arabicMarginV: 260 / 720, translationMarginV: 140 / 720, scrimTop: 265 / 720, scrimHeight: 190 / 720 },
};

/**
 * Where the whole caption block (Arabic line(s) + Translation line(s), rendered
 * together as ONE ASS event -- see assBuilder.js) is anchored, as an ASS
 * alignment override plus a raw canvas-pixel point.
 *
 * Real reported bug: on real exports the captions kept changing position
 * from verse to verse. Root cause: Arabic and Translation used to be two
 * separate events, each anchored at its own fixed Y and each growing away
 * from that anchor by however many lines it happened to wrap to -- so the
 * pair's combined position and extent shifted with every verse's line
 * counts, and no choice of fixed anchors could keep it centered. Rendering
 * both lines as a single event lets libass stack them itself and center the
 * whole block on ONE point, independent of line counts.
 *
 * 'center' anchors the block's middle (Alignment 5) on the scrim band's own
 * vertical center, which is tuned to sit on the canvas's true middle. The
 * other two modes keep their original edge-anchored semantics: 'upper-third'
 * pins the block's top edge (Alignment 8) where the Arabic line used to
 * start; 'lower-third' pins its bottom edge (Alignment 2) where the
 * Translation line used to end.
 */
export function captionAnchorPosition(textPosition, canvasWidth, canvasHeight, scrimHeightScale = 1) {
  const { alignment, arabicMarginV, translationMarginV, scrimTop, scrimHeight } = captionVerticalLayout(
    textPosition,
    canvasHeight,
    scrimHeightScale
  );
  const x = Math.round(canvasWidth / 2);
  if (alignment === 8) return { an: 8, x, y: arabicMarginV };
  if (alignment === 2) return { an: 2, x, y: canvasHeight - translationMarginV };
  return { an: 5, x, y: Math.round(scrimTop + scrimHeight / 2) };
}

/**
 * scrimHeightScale grows/shrinks the scrim band around its original tuned
 * center point (rather than just extending it downward), so resizing it
 * doesn't drift away from the captions it's meant to sit behind. 1 = the
 * original tuned size; callers that don't care about the scrim (assBuilder.js
 * only wants alignment/marginV) can omit it entirely.
 */
export function captionVerticalLayout(textPosition, canvasHeight, scrimHeightScale = 1) {
  const f = CAPTION_LAYOUT_FRACTIONS[textPosition] ?? CAPTION_LAYOUT_FRACTIONS.center;
  // Rounding happens only at the very end, on the raw (unrounded) height
  // delta -- at the default scale of 1 that delta is exactly 0, so this
  // reduces to the original Math.round(f.scrimTop * canvasHeight) with no
  // drift at all, rather than accumulating a stray +/-1px from rounding
  // scrimHeight first.
  const baseScrimHeight = f.scrimHeight * canvasHeight;
  const rawScrimHeight = baseScrimHeight * scrimHeightScale;
  const scrimHeight = Math.round(rawScrimHeight);
  const scrimTop = Math.round(f.scrimTop * canvasHeight - (rawScrimHeight - baseScrimHeight) / 2);
  return {
    alignment: f.alignment,
    arabicMarginV: Math.round(f.arabicMarginV * canvasHeight),
    translationMarginV: Math.round(f.translationMarginV * canvasHeight),
    scrimTop,
    scrimHeight,
  };
}

/** y-position for intro-window overlays (Bismillah text / intro card), same fraction-of-height approach as captionVerticalLayout. */
const INTRO_TEXT_Y_FRACTIONS = { 'upper-third': 70 / 720, center: 320 / 720, 'lower-third': 560 / 720 };

export function introTextY(textPosition, canvasHeight) {
  const fraction = INTRO_TEXT_Y_FRACTIONS[textPosition] ?? INTRO_TEXT_Y_FRACTIONS.center;
  return Math.round(fraction * canvasHeight);
}
