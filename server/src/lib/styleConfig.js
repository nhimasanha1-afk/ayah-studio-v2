export const FONT_REGISTRY = {
  arabic: {
    'noto-naskh': { family: 'Noto Naskh Arabic', file: 'NotoNaskhArabic-Regular.ttf' },
    amiri: { family: 'Amiri', file: 'Amiri-Regular.ttf' },
  },
  latin: {
    'noto-sans': { family: 'Noto Sans', file: 'NotoSans-Regular.ttf' },
    inter: { family: 'Inter', file: 'Inter-Regular.ttf' },
  },
};

export const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
export const TEXT_POSITIONS = ['upper-third', 'center', 'lower-third'];
export const LOGO_SHAPES = ['square', 'circle', 'rounded'];
export const SURAH_BADGE_VARIANTS = ['inline', 'stacked-title-card'];
export const TEXT_REVEAL_ANIMATIONS = ['none', 'fade'];
export const VIDEO_FILTERS = ['none', 'grayscale', 'sepia', 'warm', 'cool', 'vintage'];
export const ZOOM_PAN_STYLES = ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'];

export const DEFAULT_STYLE = {
  typography: {
    arabicFont: 'noto-naskh',
    latinFont: 'noto-sans',
    arabicFontSize: 60,
    translationFontSize: 32,
  },
  colors: {
    arabicTextColor: '#FFFFFF',
    translationTextColor: '#E6E6E6',
    highlightColor: '#FFD700',
    outlineColor: '#000000',
    outlineWidth: 2,
    shadowDepth: 1,
    textPosition: 'center',
    textRevealAnimation: 'none',
    scrim: { enabled: true, color: '#000000', opacity: 0.35 },
    videoFilter: 'none',
    backgroundBlur: 0,
    backgroundZoomPan: 'none',
  },
  badges: {
    watermark: { enabled: false, text: '', opacity: 0.6, color: '#FFFFFF', position: 'bottom-right', fontSize: 22 },
    surahBadge: { enabled: true, position: 'top-center', fontSize: 22, variant: 'inline' },
    channelLogo: { enabled: false, position: 'top-left', size: 90, shape: 'circle', logoId: null },
    channelNameBadge: { enabled: false, text: '', position: 'bottom-left', fontSize: 20 },
  },
};

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = deepMerge(base[key], override[key]);
  }
  return out;
}

function assertOneOf(value, options, label) {
  if (!options.includes(value)) {
    throw new Error(`Invalid ${label} "${value}". Options: ${options.join(', ')}`);
  }
}

/** Deep-merges partial style overrides onto DEFAULT_STYLE and validates enum fields. */
export function resolveStyle(overrides = {}) {
  const style = deepMerge(DEFAULT_STYLE, overrides);

  assertOneOf(style.typography.arabicFont, Object.keys(FONT_REGISTRY.arabic), 'typography.arabicFont');
  assertOneOf(style.typography.latinFont, Object.keys(FONT_REGISTRY.latin), 'typography.latinFont');
  assertOneOf(style.colors.textPosition, TEXT_POSITIONS, 'colors.textPosition');
  assertOneOf(style.colors.textRevealAnimation, TEXT_REVEAL_ANIMATIONS, 'colors.textRevealAnimation');
  assertOneOf(style.colors.videoFilter, VIDEO_FILTERS, 'colors.videoFilter');
  assertOneOf(style.colors.backgroundZoomPan, ZOOM_PAN_STYLES, 'colors.backgroundZoomPan');
  if (typeof style.colors.backgroundBlur !== 'number' || style.colors.backgroundBlur < 0 || style.colors.backgroundBlur > 20) {
    throw new Error(`Invalid colors.backgroundBlur "${style.colors.backgroundBlur}". Must be a number 0-20.`);
  }
  assertOneOf(style.badges.watermark.position, POSITIONS, 'badges.watermark.position');
  assertOneOf(style.badges.surahBadge.position, POSITIONS, 'badges.surahBadge.position');
  assertOneOf(style.badges.surahBadge.variant, SURAH_BADGE_VARIANTS, 'badges.surahBadge.variant');
  assertOneOf(style.badges.channelLogo.position, POSITIONS, 'badges.channelLogo.position');
  assertOneOf(style.badges.channelLogo.shape, LOGO_SHAPES, 'badges.channelLogo.shape');
  assertOneOf(style.badges.channelNameBadge.position, POSITIONS, 'badges.channelNameBadge.position');

  return style;
}
