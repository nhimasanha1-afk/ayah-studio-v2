import { hexToAssColor } from './colorUtils.js';
import { captionVerticalLayout } from './layout.js';
import { FONT_REGISTRY, TRANSLATION_SCRIPT_FONTS } from './styleConfig.js';
import { scriptForLanguage } from './translationFonts.js';
import { toArabicIndicNumerals } from './arabicNumerals.js';

/**
 * Resolves the font family for the Translation caption line based on the
 * actual script the selected translation is written in -- not a fixed
 * user choice, since Noto Sans/Inter (FONT_REGISTRY.latin) can't render
 * most non-Latin scripts at all. Cyrillic reuses Noto Sans (it already
 * covers that script); Arabic-script translations reuse noto-naskh
 * regardless of the user's chosen Quranic Arabic font. Defaults to the
 * user's latin font choice when translationLanguage is unset, so existing
 * callers (tests, older API bodies) keep their current behavior.
 */
function resolveTranslationFontFamily(style, translationLanguage) {
  const script = scriptForLanguage(translationLanguage);
  if (script === 'latin' || script === 'cyrillic') {
    return FONT_REGISTRY.latin[style.typography.latinFont].family;
  }
  if (script === 'arabic') {
    return FONT_REGISTRY.arabic['noto-naskh'].family;
  }
  return TRANSLATION_SCRIPT_FONTS[script].family;
}

function formatAssTime(ms) {
  const totalCentiseconds = Math.max(0, Math.round(ms / 10));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function escapeAssText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, ' ');
}

function dialogueLine(style, startMs, endMs, text) {
  return `Dialogue: 0,${formatAssTime(startMs)},${formatAssTime(endMs)},${style},,0,0,0,,${text}`;
}

function buildHeader(style, canvasWidth, canvasHeight, scaleFactor, translationLanguage) {
  const arabicFamily = FONT_REGISTRY.arabic[style.typography.arabicFont].family;
  const translationFamily = resolveTranslationFontFamily(style, translationLanguage);

  const arabicColor = hexToAssColor(style.colors.arabicTextColor);
  const translationColor = hexToAssColor(style.colors.translationTextColor);
  const outlineColor = hexToAssColor(style.colors.outlineColor);

  const { alignment, arabicMarginV, translationMarginV } = captionVerticalLayout(style.colors.textPosition, canvasHeight);
  const scaled = (px) => Math.round(px * scaleFactor);
  const arabicFontSize = scaled(style.typography.arabicFontSize);
  const translationFontSize = scaled(style.typography.translationFontSize);
  const outlineWidth = Math.max(1, scaled(style.colors.outlineWidth));
  const shadowDepth = scaled(style.colors.shadowDepth);
  const sideMargin = scaled(60);
  const translationSideMargin = scaled(80);

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvasWidth}
PlayResY: ${canvasHeight}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Arabic,${arabicFamily},${arabicFontSize},${arabicColor},&H000000FF,${outlineColor},&H00000000,0,0,0,0,100,100,0,0,1,${outlineWidth},${shadowDepth},${alignment},${sideMargin},${sideMargin},${arabicMarginV},1
Style: Translation,${translationFamily},${translationFontSize},${translationColor},&H000000FF,${outlineColor},&H00000000,0,0,0,0,100,100,0,0,1,${Math.max(1, outlineWidth - 1)},${shadowDepth},${alignment},${translationSideMargin},${translationSideMargin},${translationMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

// Fade-in duration for the "fade" text reveal animation. Short enough that
// it doesn't eat a noticeable chunk of even a fast reciter's shortest
// per-word timing windows (~200-300ms).
const TEXT_REVEAL_FADE_MS = 120;

/**
 * Builds one Arabic Dialogue line per word so the active word is highlighted
 * exactly during its real (or honestly-estimated) timing window, and one
 * Translation Dialogue line per verse. The active word explicitly zeroes its
 * shadow (a drop shadow would blur the highlight) while keeping the outline.
 *
 * canvasWidth/canvasHeight/scaleFactor come from the chosen resolution and
 * aspect ratio (see layout.js). translationLanguage is the selected
 * translation's Quran.com `language_name` (e.g. "urdu", "bengali") --
 * it picks which bundled font renders the Translation line; omitted/unknown
 * values fall back to the user's chosen Latin font (see
 * resolveTranslationFontFamily).
 */
export function buildAssSubtitles(
  captionData,
  style,
  { canvasWidth, canvasHeight, scaleFactor = 1 },
  translationLanguage
) {
  const highlightColor = hexToAssColor(style.colors.highlightColor);
  const arabicColor = hexToAssColor(style.colors.arabicTextColor);
  const shadowDepth = Math.round(style.colors.shadowDepth * scaleFactor);
  const fadeTag = style.colors.textRevealAnimation === 'fade' ? `{\\fad(${TEXT_REVEAL_FADE_MS},0)}` : '';
  const lines = [];

  for (const verse of captionData.verses) {
    if (verse.startMs == null || verse.endMs == null) continue;

    const words = verse.words.map((w) => escapeAssText(w.text));

    // Ayah numbers mirror each line's own reading direction: Arabic is
    // RTL, so its sentence-end (where the number belongs) already lands on
    // screen-left, and the number is appended inline after the last word.
    // English is LTR, so its sentence-end is naturally on screen-right --
    // the user explicitly wants both numbers on the left regardless, so
    // here the English number is a prefix at the start of the line instead
    // of a suffix at its (right-side) end.
    //
    // U+FD3E/U+FD3F ORNATE LEFT/RIGHT PARENTHESIS are the classic Quranic
    // typesetting brackets used to enclose a verse number (e.g. ﴿٣﴾),
    // matching how the reference app decorates its ayah markers. Both
    // bundled Arabic fonts (Noto Naskh Arabic, Amiri) already include these
    // glyphs as ordinary characters -- no font override or ligature is
    // needed the way the old nested-circle marker required.
    const arabicNumberSuffix = style.colors.showAyahNumbers
      ? ` {\\c${arabicColor}&\\shad${shadowDepth}}﴿${toArabicIndicNumerals(verse.verseNumber)}﴾{\\r}`
      : '';
    const translationNumberPrefix = style.colors.showAyahNumbers ? `(${verse.verseNumber}) ` : '';

    for (let i = 0; i < verse.words.length; i++) {
      const word = verse.words[i];
      if (word.startMs == null || word.endMs == null) continue;

      const rendered = style.colors.wordHighlightEnabled
        ? words
            .map((text, j) =>
              j === i
                ? `{\\c${highlightColor}&\\shad0}${text}{\\c${arabicColor}&\\shad${shadowDepth}}`
                : text
            )
            .join(' ')
        : words.join(' ');

      lines.push(dialogueLine('Arabic', word.startMs, word.endMs, fadeTag + rendered + arabicNumberSuffix));
    }

    lines.push(
      dialogueLine(
        'Translation',
        verse.startMs,
        verse.endMs,
        fadeTag + escapeAssText(translationNumberPrefix + verse.translationText)
      )
    );
  }

  return buildHeader(style, canvasWidth, canvasHeight, scaleFactor, translationLanguage) + lines.join('\n') + '\n';
}
