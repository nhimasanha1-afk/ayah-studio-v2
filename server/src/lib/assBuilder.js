import path from 'node:path';
import { hexToAssColor } from './colorUtils.js';
import { captionVerticalLayout, captionAnchorPosition, CAPTION_SIZE_FACTOR } from './layout.js';
import { libassEmScale } from './fontMetrics.js';
import { FONTS_DIR } from './paths.js';
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
function resolveTranslationFont(style, translationLanguage) {
  const script = scriptForLanguage(translationLanguage);
  if (script === 'latin' || script === 'cyrillic') {
    return { ...FONT_REGISTRY.latin[style.typography.latinFont], script, fontKey: style.typography.latinFont };
  }
  if (script === 'arabic') {
    return { ...FONT_REGISTRY.arabic['noto-naskh'], script, fontKey: 'noto-naskh' };
  }
  return { ...TRANSLATION_SCRIPT_FONTS[script], script, fontKey: script };
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

// Average glyph advance width as a fraction of the ASS font size, per script
// bucket -- calibrated by rendering real test frames and measuring the exact
// character count where wrapping kicked in (not guessed): Arabic's cursive
// joining and non-advancing diacritics pack far more characters per line
// than Latin at the same size (measured ~175 chars/line at 60px over 1160px
// usable width vs Latin's ~110 chars/line at 32px over 1120px). Each constant
// is nudged slightly above its measured value so the estimate errs toward
// wrapping a touch early rather than late. Measured on Noto Naskh Arabic and
// Noto Sans; other fonts are scaled from those by FONT_WIDTH_MULTIPLIER
// (measured: rendering the same Arabic string, Amiri came out 0.68x and
// Scheherazade New 1.72x the width of Noto Naskh; Inter 1.065x Noto Sans).
// Untested "other" scripts (CJK, Indic, etc.) use a wide, conservative
// placeholder since most of those glyphs are squarer/wider than Latin.
const AVG_CHAR_WIDTH_FACTOR = { arabic: 0.12, latin: 0.33, cyrillic: 0.33, other: 0.6 };
const FONT_WIDTH_MULTIPLIER = { amiri: 0.75, scheherazade: 1.8, inter: 1.1 };

// The two caption blocks together may take at most this fraction of the
// canvas height; a verse that would need more is scaled down (both blocks by
// the same factor, so their proportion holds), but never below MIN_FONT_SCALE.
// This replaces an earlier per-block "max 2 lines" rule that existed to keep
// separately anchored blocks from growing into each other -- with both lines
// in ONE event that can't happen, and the rule shrank text well below the
// chosen size on ordinary verses (the preview never shrinks), so it now only
// kicks in for verses too long to fit on screen at all.
const MAX_BLOCK_HEIGHT_FRACTION = 0.62;
const MIN_FONT_SCALE = 0.5;

/**
 * ASS font sizes and width factors for both caption lines. The chosen sizes
 * are treated as browser-style px on the 720p-reference canvas and scaled by
 * CAPTION_SIZE_FACTOR (see layout.js) so the export matches the live preview;
 * dividing by the font's libass em scale (see fontMetrics.js) compensates
 * for libass sizing the whole line box rather than the em.
 */
function captionFonts(style, scaleFactor, translationLanguage) {
  const arabicKey = style.typography.arabicFont;
  const arabicFont = FONT_REGISTRY.arabic[arabicKey];
  const translationFont = resolveTranslationFont(style, translationLanguage);
  const toAssSize = (setting, font) =>
    Math.max(1, Math.round((setting * CAPTION_SIZE_FACTOR * scaleFactor) / libassEmScale(path.join(FONTS_DIR, font.file))));
  const bucketFactor = AVG_CHAR_WIDTH_FACTOR[translationFont.script] ?? AVG_CHAR_WIDTH_FACTOR.other;
  return {
    arabicFamily: arabicFont.family,
    translationFamily: translationFont.family,
    arabicFs: toAssSize(style.typography.arabicFontSize, arabicFont),
    translationFs: toAssSize(style.typography.translationFontSize, translationFont),
    arabicWidthFactor: AVG_CHAR_WIDTH_FACTOR.arabic * (FONT_WIDTH_MULTIPLIER[arabicKey] ?? 1),
    translationWidthFactor: bucketFactor * (FONT_WIDTH_MULTIPLIER[translationFont.fontKey] ?? 1),
  };
}

/**
 * The largest scale (1 = the chosen size) at which this verse's whole
 * caption block -- Arabic lines, gap, Translation lines, each line one font
 * size tall in libass -- fits within MAX_BLOCK_HEIGHT_FRACTION of the canvas.
 * Line counts come from the same calibrated width model used to wrap, at
 * each candidate scale.
 */
function fitBlockScale({ words, arabicFs, arabicUsableWidth, arabicWidthFactor, translationLength, translationFs, translationUsableWidth, translationWidthFactor, gapPx, canvasHeight }) {
  const budget = canvasHeight * MAX_BLOCK_HEIGHT_FRACTION;
  for (let scale = 1; scale > MIN_FONT_SCALE; scale = Math.round((scale - 0.05) * 100) / 100) {
    const aFs = Math.max(1, Math.round(arabicFs * scale));
    const tFs = Math.max(1, Math.round(translationFs * scale));
    const arabicLines = wrapWordsIntoLines(words, arabicUsableWidth, aFs, arabicWidthFactor).length;
    const translationLines = Math.max(1, Math.ceil((translationLength * tFs * translationWidthFactor) / translationUsableWidth));
    if (arabicLines * aFs + gapPx + translationLines * tFs <= budget) return scale;
  }
  return MIN_FONT_SCALE;
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
 * fitBlockScale, and the breaks are conservative (lines come out a bit
 * narrower than the screen allows) so libass never needs to re-wrap them.
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
  const { arabicFamily, translationFamily, arabicFs: arabicFontSize, translationFs: translationFontSize } = captionFonts(
    style,
    scaleFactor,
    translationLanguage
  );

  const arabicColor = hexToAssColor(style.colors.arabicTextColor);
  const translationColor = hexToAssColor(style.colors.translationTextColor);
  const outlineColor = hexToAssColor(style.colors.outlineColor);

  const { alignment, arabicMarginV, translationMarginV } = captionVerticalLayout(style.colors.textPosition, canvasHeight);
  const scaled = (px) => scalePx(px, scaleFactor);
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

// Gap between the Arabic block and the Translation block, as the font size
// of an empty spacer line between them (px at 720p; scaled per resolution).
const CAPTION_BLOCK_GAP_PX = 10;

/**
 * Splits a verse's time window into contiguous, non-overlapping intervals,
 * one per timed word, each carrying which word is highlighted during it
 * (wordIndex -1 = none). Contiguity matters now that Arabic and Translation
 * share ONE event per interval: any gap between words' own timings would
 * blank the whole caption, and any overlap with the previous verse would
 * briefly stack two captions.
 */
function buildVerseIntervals(verse, highlightEnabled) {
  const whole = [{ wordIndex: -1, startMs: verse.startMs, endMs: verse.endMs }];
  if (!highlightEnabled) return whole;
  const timed = [];
  verse.words.forEach((w, i) => {
    if (w.startMs != null && w.endMs != null) timed.push({ i, startMs: w.startMs });
  });
  if (timed.length === 0) return whole;

  const starts = [];
  timed.forEach((t, k) => {
    const floor = k === 0 ? verse.startMs : starts[k - 1];
    starts.push(k === 0 ? verse.startMs : Math.min(Math.max(t.startMs, floor), verse.endMs));
  });
  const intervals = [];
  timed.forEach((t, k) => {
    const endMs = k === timed.length - 1 ? verse.endMs : starts[k + 1];
    if (endMs > starts[k]) intervals.push({ wordIndex: t.i, startMs: starts[k], endMs });
  });
  return intervals.length > 0 ? intervals : whole;
}

/**
 * Builds the ASS caption track: one Dialogue event per highlighted-word
 * interval, each containing BOTH the Arabic line(s) and the Translation
 * line(s) as a single block. The active word is highlighted (with its
 * shadow zeroed, since a drop shadow would blur the highlight) while
 * keeping the outline.
 *
 * Why one event instead of separate Arabic/Translation events: separately
 * anchored events each grow away from their own anchor by however many
 * lines they wrap to, so the pair's position and extent shifted verse to
 * verse (a real reported bug -- captions "moving around" through an
 * export). A single event is laid out by libass as one stacked block and
 * centered on one point, independent of line counts. See
 * captionAnchorPosition in layout.js.
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

  const { arabicFs, translationFs, arabicWidthFactor, translationWidthFactor } = captionFonts(style, scaleFactor, translationLanguage);
  const { sideMargin, translationSideMargin } = captionSideMargins(scaleFactor);
  const arabicUsableWidth = canvasWidth - 2 * sideMargin;
  const translationUsableWidth = canvasWidth - 2 * translationSideMargin;

  const anchor = captionAnchorPosition(
    style.colors.textPosition,
    canvasWidth,
    canvasHeight,
    style.colors.scrim.heightScale ?? 1
  );
  const posCmd = `\\an${anchor.an}\\pos(${anchor.x},${anchor.y})`;
  const spacerFs = Math.max(1, scalePx(CAPTION_BLOCK_GAP_PX, scaleFactor));

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

    // Scales this verse's two font sizes down together ONLY if the whole
    // block would not fit on screen at the chosen size (see
    // MAX_BLOCK_HEIGHT_FRACTION) -- computed once per verse so every event
    // for this verse gets the exact same sizes (no jitter as the highlighted
    // word changes).
    const translationText = translationNumberPrefix + verse.translationText;
    const blockScale = fitBlockScale({
      words,
      arabicFs,
      arabicUsableWidth,
      arabicWidthFactor,
      translationLength: translationText.length,
      translationFs,
      translationUsableWidth,
      translationWidthFactor,
      gapPx: spacerFs,
      canvasHeight,
    });
    const arabicFitSize = Math.max(1, Math.round(arabicFs * blockScale));
    const translationFitSize = Math.max(1, Math.round(translationFs * blockScale));
    const arabicFsCmd = arabicFitSize < arabicFs ? `\\fs${arabicFitSize}` : '';
    const arabicLineGroups = wrapWordsIntoLines(words, arabicUsableWidth, arabicFitSize, arabicWidthFactor);
    const wordLineIndex = new Array(words.length);
    arabicLineGroups.forEach((group, lineIdx) => group.forEach((wordIdx) => (wordLineIndex[wordIdx] = lineIdx)));

    const translationFsCmd = translationFitSize < translationFs ? `\\fs${translationFitSize}` : '';
    // {\rTranslation} switches the rest of the event to the Translation
    // style (font, size, colors, outline); the block position (\an/\pos)
    // is event-level and stays.
    const translationBlock = `{\\rTranslation${translationFsCmd}}${escapeAssText(translationText)}`;
    const gapBlock = `\\N{\\fs${spacerFs}}\\N`;

    const intervals = buildVerseIntervals(verse, style.colors.wordHighlightEnabled);
    intervals.forEach((interval, intervalIdx) => {
      // Line breaks are fixed per-verse (arabicLineGroups), independent of
      // which word is active -- see wrapWordsIntoLines's comment. Only the
      // ONE line containing the highlighted word gets the highlight-run
      // treatment; every other line renders as plain, untagged text, which
      // (per the note below) shapes and orders correctly on its own.
      const activeLine = interval.wordIndex >= 0 ? wordLineIndex[interval.wordIndex] : -1;
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
          const posInLine = lineWordIndices.indexOf(interval.wordIndex);
          const preWords = lineWordIndices.slice(0, posInLine).map((idx) => words[idx]);
          const postWords = lineWordIndices.slice(posInLine + 1).map((idx) => words[idx]);
          if (preWords.length) segments.push(preWords.join(' '));
          segments.push(`{\\c${highlightColor}&\\shad0}${words[interval.wordIndex]}{\\c${arabicColor}&\\shad${shadowDepth}}`);
          if (postWords.length) segments.push(postWords.join(' '));
        } else {
          segments.push(lineWordIndices.map((idx) => words[idx]).join(' '));
        }
        if (isLastLine && markerSegment) segments.push(markerSegment);

        return segments.length > 1 ? segments.slice().reverse().join(' ') : segments[0];
      });

      // The fade-in belongs to the verse's first event only -- later events
      // for the same verse show identical text, and re-fading each would
      // flicker on every word change.
      const prefix = `{${posCmd}${intervalIdx === 0 ? fadeCmd : ''}${arabicFsCmd}}`;
      lines.push(
        dialogueLine('Arabic', interval.startMs, interval.endMs, prefix + renderedLines.join('\\N') + gapBlock + translationBlock)
      );
    });
  }

  return buildHeader(style, canvasWidth, canvasHeight, scaleFactor, translationLanguage) + lines.join('\n') + '\n';
}
