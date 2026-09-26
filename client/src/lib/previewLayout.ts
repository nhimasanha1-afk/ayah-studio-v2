import type { BadgePosition, TextPosition } from './types';

// Mirrors server/src/lib/layout.js's pixel constants (1280x720 canvas),
// converted to percentages so the preview scales with its container.
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const PAD_PCT_X = (40 / VIDEO_WIDTH) * 100;
const PAD_PCT_Y = (40 / VIDEO_HEIGHT) * 100;

// heightScale mirrors server/src/lib/layout.js's captionVerticalLayout:
// grows/shrinks the band around its original tuned center point, rather
// than just extending it downward, so resizing it doesn't drift away from
// the captions it sits behind.
export function scrimStyle(textPosition: TextPosition, heightScale = 1): React.CSSProperties {
  const bands: Record<TextPosition, { top: number; height: number }> = {
    'upper-third': { top: 30, height: 145 },
    center: { top: 235, height: 250 },
    'lower-third': { top: 545, height: 145 },
  };
  const band = bands[textPosition];
  const height = band.height * heightScale;
  const top = band.top - (height - band.height) / 2;
  return {
    position: 'absolute',
    left: `${(40 / VIDEO_WIDTH) * 100}%`,
    width: `${((VIDEO_WIDTH - 80) / VIDEO_WIDTH) * 100}%`,
    top: `${(top / VIDEO_HEIGHT) * 100}%`,
    height: `${(height / VIDEO_HEIGHT) * 100}%`,
  };
}

export function badgePositionStyle(position: BadgePosition): React.CSSProperties {
  const style: React.CSSProperties = { position: 'absolute' };
  if (position.startsWith('top')) style.top = `${PAD_PCT_Y}%`;
  if (position.startsWith('bottom')) style.bottom = `${PAD_PCT_Y}%`;
  if (position.endsWith('left')) style.left = `${PAD_PCT_X}%`;
  if (position.endsWith('right')) style.right = `${PAD_PCT_X}%`;
  if (position.endsWith('center')) {
    style.left = '50%';
    style.transform = 'translateX(-50%)';
  }
  return style;
}

/**
 * Mirrors server/src/lib/layout.js's CAPTION_SIZE_FACTOR: the chosen
 * Arabic/Translation size maps to an em of size * 0.7 px on a 1280-wide
 * (720-wide for 9:16) canvas, scaled with the frame's actual width, so the
 * preview shows the same proportion of the frame the export does at any
 * window size. (The preview used to use a fixed 0.6 CSS px per unit, which
 * only matched a ~1100px-wide preview.)
 */
export const CAPTION_SIZE_FACTOR = 0.7;
