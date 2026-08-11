function parseHex(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

/** "#RRGGBB" + opacity(0-1) -> ASS &HAABBGGRR (AA: 00=opaque, FF=transparent). */
export function hexToAssColor(hex, opacity = 1) {
  const { r, g, b } = parseHex(hex);
  const alpha = Math.round((1 - clamp01(opacity)) * 255);
  const toHex2 = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `&H${toHex2(alpha)}${toHex2(b)}${toHex2(g)}${toHex2(r)}`;
}

/** "#RRGGBB" + opacity(0-1) -> ffmpeg color spec "0xRRGGBB@opacity". */
export function hexToFfmpegColor(hex, opacity = 1) {
  const clean = hex.replace('#', '');
  return `0x${clean}@${clamp01(opacity)}`;
}
