import { stripTranslationMarkup } from './quranApi.js';

/**
 * Merges verse text/translation with real qdc word-segment timing into a
 * normalized per-word-synced caption model. Segments are only trusted when
 * their count matches the verse's word count -- otherwise timing for that
 * verse is evenly estimated across the verse window and flagged
 * isEstimated: true rather than silently mismatching words to timestamps.
 */
export function buildCaptionData({ verses, audioFile }) {
  const timingByVerseKey = new Map(audioFile.verse_timings.map((vt) => [vt.verse_key, vt]));

  const captionVerses = verses.map((verse) => {
    const words = verse.text_uthmani.trim().split(/\s+/);
    const translationHtml = verse.translations?.[0]?.text ?? '';
    const translationText = stripTranslationMarkup(translationHtml);

    const verseTiming = timingByVerseKey.get(verse.verse_key);
    if (!verseTiming) {
      return {
        verseKey: verse.verse_key,
        verseNumber: verse.verse_number,
        arabicText: verse.text_uthmani.trim(),
        translationText,
        startMs: null,
        endMs: null,
        words: words.map((text) => ({ text, startMs: null, endMs: null })),
        isEstimated: true,
        estimateReason: 'no verse timing returned by qdc for this verse',
      };
    }

    const segments = verseTiming.segments ?? [];
    const wordCountMatches = segments.length === words.length;

    let wordTimings;
    let isEstimated = false;
    let estimateReason = null;

    if (wordCountMatches) {
      wordTimings = words.map((text, i) => ({
        text,
        startMs: segments[i][1],
        endMs: segments[i][2],
      }));
    } else {
      isEstimated = true;
      estimateReason = `segment count (${segments.length}) did not match word count (${words.length})`;
      const span = (verseTiming.timestamp_to - verseTiming.timestamp_from) / words.length;
      wordTimings = words.map((text, i) => ({
        text,
        startMs: Math.round(verseTiming.timestamp_from + i * span),
        endMs: Math.round(verseTiming.timestamp_from + (i + 1) * span),
      }));
    }

    return {
      verseKey: verse.verse_key,
      verseNumber: verse.verse_number,
      arabicText: verse.text_uthmani.trim(),
      translationText,
      startMs: verseTiming.timestamp_from,
      endMs: verseTiming.timestamp_to,
      words: wordTimings,
      isEstimated,
      estimateReason,
    };
  });

  return {
    verses: captionVerses,
    anyEstimated: captionVerses.some((v) => v.isEstimated),
  };
}

/** Shifts every verse/word timestamp forward by offsetMs, e.g. to make room for an intro/Bismillah window. */
export function shiftCaptionData(captionData, offsetMs) {
  if (offsetMs === 0) return captionData;

  const shift = (ms) => (ms == null ? null : ms + offsetMs);

  return {
    ...captionData,
    verses: captionData.verses.map((verse) => ({
      ...verse,
      startMs: shift(verse.startMs),
      endMs: shift(verse.endMs),
      words: verse.words.map((w) => ({ ...w, startMs: shift(w.startMs), endMs: shift(w.endMs) })),
    })),
  };
}
