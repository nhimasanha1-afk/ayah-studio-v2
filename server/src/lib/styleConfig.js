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

// One font per non-Latin/non-Cyrillic/non-Arabic script, auto-selected for
// the Translation caption line based on the chosen translation's actual
// language (see translationFonts.js) -- not user-choosable like
// FONT_REGISTRY.latin, since we only bundle one font per script. Cyrillic
// reuses FONT_REGISTRY.latin (Noto Sans covers Latin+Cyrillic+Greek);
// Arabic-script translations (Urdu, Persian, Pashto, Sindhi, Dari, Uyghur,
// Kurdish) reuse FONT_REGISTRY.arabic's noto-naskh regardless of which
// Quranic Arabic font the user picked, since Naskh has broader Arabic
// Extended-A coverage than Amiri.
export const TRANSLATION_SCRIPT_FONTS = {
  bengali: { family: 'Noto Sans Bengali', file: 'NotoSansBengali-Regular.ttf' },
  devanagari: { family: 'Noto Sans Devanagari', file: 'NotoSansDevanagari-Regular.ttf' },
  ethiopic: { family: 'Noto Sans Ethiopic', file: 'NotoSansEthiopic-Regular.ttf' },
  gujarati: { family: 'Noto Sans Gujarati', file: 'NotoSansGujarati-Regular.ttf' },
  han: { family: 'Noto Sans SC', file: 'NotoSansSC-Regular.ttf' },
  hangul: { family: 'Noto Sans KR', file: 'NotoSansKR-Regular.ttf' },
  hebrew: { family: 'Noto Sans Hebrew', file: 'NotoSansHebrew-Regular.ttf' },
  kana: { family: 'Noto Sans JP', file: 'NotoSansJP-Regular.ttf' },
  kannada: { family: 'Noto Sans Kannada', file: 'NotoSansKannada-Regular.ttf' },
  khmer: { family: 'Noto Sans Khmer', file: 'NotoSansKhmer-Regular.ttf' },
  malayalam: { family: 'Noto Sans Malayalam', file: 'NotoSansMalayalam-Regular.ttf' },
  nko: { family: 'Noto Sans NKo', file: 'NotoSansNKo-Regular.ttf' },
  sinhala: { family: 'Noto Sans Sinhala', file: 'NotoSansSinhala-Regular.ttf' },
  tamil: { family: 'Noto Sans Tamil', file: 'NotoSansTamil-Regular.ttf' },
  telugu: { family: 'Noto Sans Telugu', file: 'NotoSansTelugu-Regular.ttf' },
  thaana: { family: 'Noto Sans Thaana', file: 'NotoSansThaana-Regular.ttf' },
  thai: { family: 'Noto Sans Thai', file: 'NotoSansThai-Regular.ttf' },
};

// Used only for the inline ayah-number marker (Arabic-Indic digits + U+06DD
// ARABIC END OF AYAH), never for real Arabic sentence text -- confirmed via
// real rendered test frames that neither bundled general-purpose Arabic
// font (Noto Naskh Arabic, Amiri) nests the digit inside U+06DD's
// decorative circle; they render as two separate adjacent glyphs. Amiri
// Quran is a real companion font from the same upstream project
// (github.com/aliftype/amiri) built specifically for Quranic verse-number
// ligatures -- it does render the nested glyph correctly, but only
// contains Quranic-specific glyphs, not general Arabic letterforms, so it
// must only ever be applied via an inline {\fn} override around the
// marker itself, never as a whole line's font.
export const AYAH_MARKER_FONT = { family: 'Amiri Quran', file: 'AmiriQuran.ttf' };

export const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
export const TEXT_POSITIONS = ['upper-third', 'center', 'lower-third'];
export const LOGO_SHAPES = ['square', 'circle', 'rounded'];
export const SURAH_BADGE_VARIANTS = ['inline', 'stacked-title-card', 'arabic-transliteration'];
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
    showAyahNumbers: false,
  },
  badges: {
    watermark: { enabled: false, text: '', opacity: 0.6, color: '#FFFFFF', position: 'bottom-center', fontSize: 22 },
    surahBadge: { enabled: true, position: 'top-left', fontSize: 22, variant: 'inline' },
    channelLogo: { enabled: false, position: 'top-right', size: 90, shape: 'circle', logoId: null },
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
