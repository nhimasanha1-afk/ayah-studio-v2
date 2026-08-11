import type { BadgePosition, TextPosition } from './types';

// Mirrors server/src/lib/layout.js's pixel constants (1280x720 canvas),
// converted to percentages so the preview scales with its container.
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const PAD_PCT_X = (40 / VIDEO_WIDTH) * 100;
const PAD_PCT_Y = (40 / VIDEO_HEIGHT) * 100;

export function scrimStyle(textPosition: TextPosition): React.CSSProperties {
  const bands: Record<TextPosition, { top: number; height: number }> = {
    'upper-third': { top: 30, height: 145 },
    center: { top: 290, height: 190 },
    'lower-third': { top: 545, height: 145 },
  };
  const band = bands[textPosition];
  return {
    position: 'absolute',
    left: `${(40 / VIDEO_WIDTH) * 100}%`,
    width: `${((VIDEO_WIDTH - 80) / VIDEO_WIDTH) * 100}%`,
    top: `${(band.top / VIDEO_HEIGHT) * 100}%`,
    height: `${(band.height / VIDEO_HEIGHT) * 100}%`,
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

export function introTextTopPct(textPosition: TextPosition): number {
  const y: Record<TextPosition, number> = { 'upper-third': 70, center: 320, 'lower-third': 560 };
  return (y[textPosition] / VIDEO_HEIGHT) * 100;
}
