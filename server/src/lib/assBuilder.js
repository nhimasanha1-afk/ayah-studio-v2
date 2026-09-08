import { hexToAssColor } from './colorUtils.js';
import { captionVerticalLayout, captionAnchorPosition } from './layout.js';
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

const scalePx = (px, scaleFactor) => Math.round(px * scaleFactor);

function captionSideMargins(scaleFactor) {
  return { sideMargin: scalePx(60, scaleFactor), translationSideMargin: scalePx(80, scaleFactor) };
}

// Average glyph advance width as a fraction of font size, per script bucket
// -- calibrated by rendering real test frames at known font sizes/canvas
// widths and measuring the exact character count where libass's automatic
// wrapping kicked in (not guessed): Arabic's cursive joining and
// non-advancing diacritics pack far more characters per line than Latin at
// the same font size (measured ~175 chars/line at 60px over 1160px usable
// width vs Latin's ~110 chars/line at 32px over 1120px). Each constant is
// nudged slightly above its measured value so the line-count estimate below
// errs toward shrinking a touch early rather than missing a wrap -- the
// failure mode of underestimating width is the exact overlap bug this
// exists to prevent. Untested "other" scripts (CJK, Indic, etc., rendered
// via TRANSLATION_SCRIPT_FONTS) use a wide, conservative placeholder since
// most of those glyphs are visually squarer/wider than Latin.
const AVG_CHAR_WIDTH_FACTOR = { arabic: 0.12, latin: 0.33, cyrillic: 0.33, other: 0.6 };

// Real reported bug: on a downloaded export, the Arabic and Translation
// caption lines appeared to "swap" -- the Arabic line ended up sitting
// below/overlapped by the Translation text. Root cause (confirmed by
// rendering real test frames and reading back pixel rows): both styles are
// bottom-anchored (see captionVerticalLayout) with libass's default
// WrapStyle, so a long verse's translation (which has no length cap -- a
// single verse's translated meaning can run to several sentences) wraps
// into as many lines as it takes and grows straight UP from its anchor with
// no bound, eventually climbing above the Arabic line's own fixed position
// and visually inverting the reading order. Bounding both styles to a
// small max line count via a per-verse {\fs} downscale keeps each block's
// footprint predictable regardless of verse/translation length, so neither
// can grow into the other's space. The Arabic line itself never collides
// the other direction (it's the one closer to the bottom edge, so extra
// lines grow away from Translation) but is capped too so an outlier's
// wordy verse doesn't swing between a single line and filling the screen.
const MAX_CAPTION_LINES = 2;
// Never shrink below this fraction of the user's chosen size -- a rare,
// extremely long verse (e.g. Al-Baqarah 2:282, the Qur'an's longest at
// ~130 words) hitting the floor may still take a 3rd line; that's an
// acceptable, rare tradeoff against the alternative of illegibly tiny text.
const MIN_FONT_SCALE = 0.55;

/**
 * The largest font size (in px, already resolution-scaled) that keeps
 * `text` within `maxLines` lines at `usableWidthPx`, estimated from average
 * glyph width rather than real shaping (real text layout isn't available
 * here without a heavy rendering dependency) -- see AVG_CHAR_WIDTH_FACTOR's
 * comment for how that estimate was calibrated and why it's biased safe.
 * Never returns more than baseFontSizePx, and never less than
 * MIN_FONT_SCALE of it.
 */
function fittingFontSize(textLength, baseFontSizePx, usableWidthPx, maxLines, avgCharWidthFactor) {
  const minFontSizePx = Math.max(1, Math.round(baseFontSizePx * MIN_FONT_SCALE));
  if (textLength <= 0 || usableWidthPx <= 0) return baseFontSizePx;
  const maxSizeForLineCount = (maxLines * usableWidthPx) / (textLength * avgCharWidthFactor);
  return Math.max(minFontSizePx, Math.min(baseFontSizePx, Math.floor(maxSizeForLineCount)));
}

/**
 * Real reported bug, confirmed by rendering real word-by-word frames of a
 * multi-line verse: as the highlighted word advanced, the Arabic line's two
 * halves visibly SWAPPED which one rendered on top -- not just re-wrapped,
 * but flipped. Root cause: the word-highlight override tag splits the verse
 * text into runs that must be listed in file-REVERSED order for libass to
 * place them correctly RTL (see the comment where `segments` is built), but
 * libass's automatic line-wrapping decides break points from that same
 * file-order string -- so which words land on which line shifted depending
 * on where in the file order the highlighted run's split landed, which
 * itself depends on WHICH word is highlighted. The two problems (correct
 * RTL run order vs. stable line breaks) can't both be solved by leaning on
 * libass's auto-wrap.
 *
 * The fix: decide line breaks ourselves, ONCE per verse from its full text
 * (so every word-highlight frame within the verse uses identical breaks),
 * then apply the existing reversal trick only WITHIN whichever single line
 * currently contains the highlighted word -- every other line has no
 * override tags at all and so shapes/orders correctly on its own (per the
 * existing comment: "an unbroken plain-text run... shapes and orders
 * correctly on its own"). Uses the same calibrated character-width model as
 * fittingFontSize; the caller disables libass's own auto-wrap for these
 * events (\q2) so only these explicit breaks ever apply.
 */
function wrapWordsIntoLines(words, usableWidthPx, fontSizePx, avgCharWidthFactor) {
  const capacityChars = Math.max(1, usableWidthPx / (fontSizePx * avgCharWidthFactor));
  const lines = [];
  let currentLine = [];
  let currentLength = 0;
  for (let i = 0; i < words.length; i++) {
    const wordLen = words[i].length;
    const lengthIfAdded = currentLine.length === 0 ? wordLen : currentLength + 1 + wordLen;
    if (currentLine.length > 0 && lengthIfAdded > capacityChars) {
      lines.push(currentLine);
      currentLine = [i];
      currentLength = wordLen;
    } else {
      currentLine.push(i);
      currentLength = lengthIfAdded;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}

function buildHeader(style, canvasWidth, canvasHeight, scaleFactor, translationLanguage) {
  const arabicFamily = FONT_REGISTRY.arabic[style.typography.arabicFont].family;
  const translationFamily = resolveTranslationFontFamily(style, translationLanguage);

  const arabicColor = hexToAssColor(style.colors.arabicTextColor);
  const translationColor = hexToAssColor(style.colors.translationTextColor);
  const outlineColor = hexToAssColor(style.colors.outlineColor);

  const { alignment, arabicMarginV, translationMarginV } = captionVerticalLayout(style.colors.textPosition, canvasHeight);
  const scaled = (px) => scalePx(px, scaleFactor);
  const arabicFontSize = scaled(style.typography.arabicFontSize);
  const translationFontSize = scaled(style.typography.translationFontSize);
  const outlineWidth = Math.max(1, scaled(style.colors.outlineWidth));
  const shadowDepth = scaled(style.colors.shadowDepth);
  const { sideMargin, translationSideMargin } = captionSideMargins(scaleFactor);

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
  const fadeCmd = style.colors.textRevealAnimation === 'fade' ? `\\fad(${TEXT_REVEAL_FADE_MS},0)` : '';
  const lines = [];

  const arabicFontSize = scalePx(style.typography.arabicFontSize, scaleFactor);
  const translationFontSize = scalePx(style.typography.translationFontSize, scaleFactor);
  const { sideMargin, translationSideMargin } = captionSideMargins(scaleFactor);
  const arabicUsableWidth = canvasWidth - 2 * sideMargin;
  const translationUsableWidth = canvasWidth - 2 * translationSideMargin;
  const translationCharWidthFactor = AVG_CHAR_WIDTH_FACTOR[scriptForLanguage(translationLanguage)] ?? AVG_CHAR_WIDTH_FACTOR.other;

  // Explicit \pos (see captionAnchorPosition's comment) instead of leaning
  // on the Style's own Alignment/MarginV -- an explicitly positioned event
  // is exempt from libass's automatic collision avoidance, which is what
  // was causing the Arabic/Translation swap.
  const anchor = captionAnchorPosition(style.colors.textPosition, canvasWidth, canvasHeight);
  const arabicPosCmd = `\\an${anchor.an}\\pos(${anchor.x},${anchor.arabicY})`;
  const translationPosCmd = `\\an${anchor.an}\\pos(${anchor.x},${anchor.translationY})`;

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
    const markerText = style.colors.showArabicAyahNumbers ? `﴿${toArabicIndicNumerals(verse.verseNumber)}﴾` : '';
    const markerSegment = style.colors.showArabicAyahNumbers
      ? `{\\c${arabicColor}&\\shad${shadowDepth}}${markerText}{\\r}`
      : null;
    const translationNumberPrefix = style.colors.showAyahNumbers ? `(${verse.verseNumber}) ` : '';

    // Bounds this verse's Arabic/Translation font size so neither can wrap
    // into enough lines to grow into the other's space (see
    // AVG_CHAR_WIDTH_FACTOR's comment) -- computed once per verse from its
    // full text length so every per-word Dialogue line for this verse gets
    // the exact same size (no jitter as the highlighted word changes).
    const arabicTextLength = words.reduce((sum, w) => sum + w.length, 0) + Math.max(0, words.length - 1) + (markerText ? markerText.length + 1 : 0);
    const arabicFitSize = fittingFontSize(arabicTextLength, arabicFontSize, arabicUsableWidth, MAX_CAPTION_LINES, AVG_CHAR_WIDTH_FACTOR.arabic);
    const arabicFsCmd = arabicFitSize < arabicFontSize ? `\\fs${arabicFitSize}` : '';
    // \q2 disables libass's own auto-wrap for these events -- only the
    // explicit \N breaks from wrapWordsIntoLines apply (see its comment).
    const arabicPrefix = `{${arabicPosCmd}\\q2${fadeCmd}${arabicFsCmd}}`;
    const arabicLineGroups = wrapWordsIntoLines(words, arabicUsableWidth, arabicFitSize, AVG_CHAR_WIDTH_FACTOR.arabic);
    const wordLineIndex = new Array(words.length);
    arabicLineGroups.forEach((group, lineIdx) => group.forEach((wordIdx) => (wordLineIndex[wordIdx] = lineIdx)));

    const translationText = translationNumberPrefix + verse.translationText;
    const translationFitSize = fittingFontSize(translationText.length, translationFontSize, translationUsableWidth, MAX_CAPTION_LINES, translationCharWidthFactor);
    const translationFsCmd = translationFitSize < translationFontSize ? `\\fs${translationFitSize}` : '';
    const translationPrefix = `{${translationPosCmd}${fadeCmd}${translationFsCmd}}`;

    for (let i = 0; i < verse.words.length; i++) {
      const word = verse.words[i];
      if (word.startMs == null || word.endMs == null) continue;

      // Line breaks are fixed per-verse (arabicLineGroups), independent of
      // which word is active -- see wrapWordsIntoLines's comment. Only the
      // ONE line containing the highlighted word gets the highlight-run
      // treatment; every other line renders as plain, untagged text, which
      // (per the note below) shapes and orders correctly on its own.
      const activeLine = style.colors.wordHighlightEnabled ? wordLineIndex[i] : -1;
      const renderedLines = arabicLineGroups.map((lineWordIndices, lineIdx) => {
        const isLastLine = lineIdx === arabicLineGroups.length - 1;

        // libass places each {\...}-override-delimited run at its literal
        // file-order position -- confirmed by direct pixel-order testing --
        // rather than bidi-reordering runs as a whole for RTL. An unbroken
        // plain-text run (no override tags anywhere in it) still shapes and
        // orders correctly on its own, so the bug only appears once we
        // introduce a run boundary (wrapping the active word, or appending
        // the marker, in its own {\c...} block): each such wrap splits the
        // line into multiple runs that libass then places left-to-right in
        // file order instead of RTL order. The fix is to build the runs in
        // their correct reading order (exactly as before) and then reverse
        // that array before joining, so file order becomes correct visual
        // (right-to-left) order. When there's only one run (no highlight
        // and no marker), reversing a 1-element array is a no-op.
        const segments = [];
        if (lineIdx === activeLine) {
          const posInLine = lineWordIndices.indexOf(i);
          const preWords = lineWordIndices.slice(0, posInLine).map((idx) => words[idx]);
          const postWords = lineWordIndices.slice(posInLine + 1).map((idx) => words[idx]);
          if (preWords.length) segments.push(preWords.join(' '));
          segments.push(`{\\c${highlightColor}&\\shad0}${words[i]}{\\c${arabicColor}&\\shad${shadowDepth}}`);
          if (postWords.length) segments.push(postWords.join(' '));
        } else {
          segments.push(lineWordIndices.map((idx) => words[idx]).join(' '));
        }
        if (isLastLine && markerSegment) segments.push(markerSegment);

        return segments.length > 1 ? segments.slice().reverse().join(' ') : segments[0];
      });

      lines.push(dialogueLine('Arabic', word.startMs, word.endMs, arabicPrefix + renderedLines.join('\\N')));
    }

    lines.push(dialogueLine('Translation', verse.startMs, verse.endMs, translationPrefix + escapeAssText(translationText)));
  }

  return buildHeader(style, canvasWidth, canvasHeight, scaleFactor, translationLanguage) + lines.join('\n') + '\n';
}
