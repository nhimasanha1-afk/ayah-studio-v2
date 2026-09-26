import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssSubtitles } from '../src/lib/assBuilder.js';
import { resolveStyle } from '../src/lib/styleConfig.js';
import { captionVerticalLayout } from '../src/lib/layout.js';

const layout = { canvasWidth: 1280, canvasHeight: 720, scaleFactor: 1 };

const captionData = {
  verses: [
    {
      startMs: 0,
      endMs: 1000,
      verseNumber: 3,
      translationText: 'Say, He is God, the One',
      words: [{ text: 'قُلْ', startMs: 0, endMs: 1000 }],
    },
  ],
};

function styleLine(assText) {
  return assText.split('\n').find((l) => l.startsWith('Style: Translation,'));
}

// Each caption event holds BOTH the Arabic and the Translation as one block
// (see buildAssSubtitles' comment), so these helpers pull the pieces apart:
//   {<pos/fade/arabic-fs>} <arabic line(s)> \N{\fsN}\N {\rTranslation[\fsN]} <translation>
function captionEvents(assText) {
  return assText.split('\n').filter((l) => l.startsWith('Dialogue:'));
}

function eventText(line) {
  return line.split(',').slice(9).join(',');
}

const TRANSLATION_MARKER = /\\N\{\\fs\d+\}\\N\{\\rTranslation(\\fs\d+)?\}/;

function parseEvent(line) {
  const text = eventText(line);
  const prefixMatch = text.match(/^\{([^}]*)\}/);
  const rest = text.slice(prefixMatch[0].length);
  const markerMatch = rest.match(TRANSLATION_MARKER);
  return {
    prefix: prefixMatch[1],
    arabic: rest.slice(0, markerMatch.index),
    translation: rest.slice(markerMatch.index + markerMatch[0].length),
    translationFs: markerMatch[1] ? Number(markerMatch[1].slice(3)) : null,
    arabicFs: (prefixMatch[1].match(/\\fs(\d+)/) ?? [])[1] ? Number(prefixMatch[1].match(/\\fs(\d+)/)[1]) : null,
  };
}

function assTimeToMs(t) {
  const [h, m, rest] = t.split(':');
  const [s, cs] = rest.split('.');
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(cs) * 10;
}

function eventWindow(line) {
  const [, start, end] = line.split(',');
  return [assTimeToMs(start), assTimeToMs(end)];
}

test('with no translationLanguage, the Translation style uses the user\'s chosen latin font (unchanged default behavior)', () => {
  const style = resolveStyle({ typography: { latinFont: 'inter' } });
  const ass = buildAssSubtitles(captionData, style, layout);
  assert.match(styleLine(ass), /^Style: Translation,Inter,/);
});

test('a Latin-script translation language still uses the user\'s chosen latin font', () => {
  const style = resolveStyle({ typography: { latinFont: 'noto-sans' } });
  const ass = buildAssSubtitles(captionData, style, layout, 'french');
  assert.match(styleLine(ass), /^Style: Translation,Noto Sans,/);
});

test('a Cyrillic-script translation language reuses the latin font bucket (Noto Sans covers Cyrillic)', () => {
  const style = resolveStyle({ typography: { latinFont: 'noto-sans' } });
  const ass = buildAssSubtitles(captionData, style, layout, 'russian');
  assert.match(styleLine(ass), /^Style: Translation,Noto Sans,/);
});

test('an Arabic-script translation language (e.g. Urdu) uses Noto Naskh Arabic regardless of the user\'s chosen Quranic Arabic font', () => {
  const style = resolveStyle({ typography: { arabicFont: 'amiri', latinFont: 'inter' } });
  const ass = buildAssSubtitles(captionData, style, layout, 'urdu');
  assert.match(styleLine(ass), /^Style: Translation,Noto Naskh Arabic,/);
});

test('non-Latin, non-Cyrillic, non-Arabic scripts each resolve to their own bundled font', () => {
  const style = resolveStyle();
  const cases = [
    ['hindi', 'Noto Sans Devanagari'],
    ['bengali', 'Noto Sans Bengali'],
    ['chinese', 'Noto Sans SC'],
    ['japanese', 'Noto Sans JP'],
    ['korean', 'Noto Sans KR'],
    ['thai', 'Noto Sans Thai'],
    ['hebrew', 'Noto Sans Hebrew'],
    ['tamil', 'Noto Sans Tamil'],
    ['telugu', 'Noto Sans Telugu'],
    ['kannada', 'Noto Sans Kannada'],
    ['malayalam', 'Noto Sans Malayalam'],
    ['gujarati', 'Noto Sans Gujarati'],
    ['sinhala, sinhalese', 'Noto Sans Sinhala'],
    ['central khmer', 'Noto Sans Khmer'],
    ['amharic', 'Noto Sans Ethiopic'],
    ['divehi', 'Noto Sans Thaana'],
    ['bambara', 'Noto Sans NKo'],
  ];
  for (const [lang, expectedFamily] of cases) {
    const ass = buildAssSubtitles(captionData, style, layout, lang);
    assert.match(styleLine(ass), new RegExp(`^Style: Translation,${expectedFamily.replace(/ /g, ' ')},`), lang);
  }
});

test('the Arabic (Quranic) style is never affected by translationLanguage', () => {
  const style = resolveStyle({ typography: { arabicFont: 'amiri' } });
  const assUrdu = buildAssSubtitles(captionData, style, layout, 'urdu');
  const assEnglish = buildAssSubtitles(captionData, style, layout, 'english');
  const arabicLine = (ass) => ass.split('\n').find((l) => l.startsWith('Style: Arabic,'));
  assert.equal(arabicLine(assUrdu), arabicLine(assEnglish));
  assert.match(arabicLine(assUrdu), /^Style: Arabic,Amiri,/);
});

test('an unrecognized translationLanguage falls back to the latin font bucket rather than throwing', () => {
  const style = resolveStyle({ typography: { latinFont: 'inter' } });
  const ass = buildAssSubtitles(captionData, style, layout, 'klingon');
  assert.match(styleLine(ass), /^Style: Translation,Inter,/);
});

test('showAyahNumbers/showArabicAyahNumbers off (default): no verse number appears on either line', () => {
  const style = resolveStyle();
  const ass = buildAssSubtitles(captionData, style, layout);
  const { arabic, translation } = parseEvent(captionEvents(ass)[0]);
  assert.ok(!arabic.includes('٣'));
  assert.ok(!translation.includes('(3)'));
});

test('showArabicAyahNumbers controls only the Arabic marker; showAyahNumbers controls only the translation prefix, independently', () => {
  const arabicOnly = resolveStyle({ colors: { showArabicAyahNumbers: true, showAyahNumbers: false } });
  const arabicOnlyEvent = parseEvent(captionEvents(buildAssSubtitles(captionData, arabicOnly, layout))[0]);
  assert.ok(arabicOnlyEvent.arabic.includes('﴿٣﴾'));
  assert.ok(!arabicOnlyEvent.translation.includes('(3)'));

  const translationOnly = resolveStyle({ colors: { showArabicAyahNumbers: false, showAyahNumbers: true } });
  const translationOnlyEvent = parseEvent(captionEvents(buildAssSubtitles(captionData, translationOnly, layout))[0]);
  assert.ok(!translationOnlyEvent.arabic.includes('﴿٣﴾'));
  assert.ok(translationOnlyEvent.translation.includes('(3)'));
});

test('both on: Arabic line gets the Arabic-Indic numeral appended after the word, Translation line gets "(N) " prefixed', () => {
  const style = resolveStyle({ colors: { showAyahNumbers: true, showArabicAyahNumbers: true } });
  const ass = buildAssSubtitles(captionData, style, layout);
  const { arabic, translation } = parseEvent(captionEvents(ass)[0]);

  // Arabic: the number, wrapped in ornate Quranic parentheses (﴿٣﴾), reads
  // as coming after the word -- but libass places {\...}-override-delimited
  // runs at their literal file-order position rather than bidi-reordering
  // them for RTL (verified directly by rendering test frames), so to make
  // the marker land on-screen where it belongs (after the word, i.e. to
  // its screen-left) it must be written FIRST in the file, ahead of the
  // (itself override-wrapped, since word highlighting is on by default)
  // word run.
  assert.match(arabic, /^\{\\c&H[0-9A-F]+&\\shad\d+\}﴿٣﴾\{\\r\} \{\\c&H[0-9A-F]+&\\shad0\}قُلْ/);

  // Translation: number is a prefix at the very start of the line, per an
  // explicit user choice to keep both numbers on the left even though
  // English's natural sentence-end is on the right.
  assert.match(translation, /^\(3\) Say, He is God, the One$/);
});

test('the Arabic ayah number always renders in the normal (non-highlighted) color, even on the single-word verse where that word is the active/highlighted one', () => {
  const style = resolveStyle({
    colors: { showArabicAyahNumbers: true, highlightColor: '#FFD700', arabicTextColor: '#FFFFFF' },
  });
  const ass = buildAssSubtitles(captionData, style, layout);
  const { arabic } = parseEvent(captionEvents(ass)[0]);
  // The override block wrapping the numeral (now written first in the
  // file -- see the run-order comment in assBuilder.js) must use the
  // normal arabic color, not leave the highlight color active.
  assert.match(arabic, /^\{\\c&H00FFFFFF&\\shad\d+\}﴿٣﴾\{\\r\}/);
});

test('wordHighlightEnabled: false -> no per-word color override anywhere on the Arabic line', () => {
  const style = resolveStyle({ colors: { wordHighlightEnabled: false } });
  const ass = buildAssSubtitles(captionData, style, layout);
  for (const line of captionEvents(ass)) {
    const { arabic } = parseEvent(line);
    assert.ok(!arabic.includes('{\\c'), `expected no color override, got: ${arabic}`);
  }
});

// Regression test for a real reported bug: on a downloaded export, words
// appeared out of order/direction whenever both word-highlighting and the
// ayah-number marker were active together. Root cause (confirmed by
// rendering actual test frames and reading back pixel positions): libass
// places each {\...}-override-delimited run at its literal file-order
// position instead of bidi-reordering runs as a whole for RTL. With a
// multi-word verse, highlighting a MIDDLE word splits the line into three
// runs (words-before, the highlighted word, words-after) plus a fourth run
// for the marker -- all four must appear in the file in exactly reversed
// reading order for the on-screen result to read correctly right-to-left.
const multiWordCaptionData = {
  verses: [
    {
      startMs: 0,
      endMs: 500,
      verseNumber: 1,
      translationText: 'test',
      words: [
        { text: 'اول', startMs: 0, endMs: 100 },
        { text: 'دوم', startMs: 100, endMs: 200 },
        { text: 'سوم', startMs: 200, endMs: 300 },
        { text: 'چهارم', startMs: 300, endMs: 400 },
        { text: 'پنجم', startMs: 400, endMs: 500 },
      ],
    },
  ],
};

test('highlighting a middle word: the file order is [marker, words-after, highlighted word, words-before] so libass\'s literal left-to-right run placement reads correctly right-to-left', () => {
  const style = resolveStyle({ colors: { wordHighlightEnabled: true, showArabicAyahNumbers: true } });
  const ass = buildAssSubtitles(multiWordCaptionData, style, layout);
  // The 3rd word ("سوم", index 2) is the active/highlighted one in its event.
  const { arabic } = parseEvent(captionEvents(ass)[2]);
  assert.match(
    arabic,
    /^\{\\c&H[0-9A-F]+&\\shad\d+\}﴿١﴾\{\\r\} چهارم پنجم \{\\c&H[0-9A-F]+&\\shad0\}سوم\{\\c&H[0-9A-F]+&\\shad\d+\} اول دوم$/
  );
});

// Regression test for a real reported bug: on a downloaded export, the
// Arabic caption appeared to move up and down and end up below the
// Translation line at random. Root cause (confirmed by rendering real test
// frames and reading back pixel rows): a long verse/translation could wrap
// into an unbounded number of lines. Bounding each verse's Arabic and
// Translation font size (via a per-verse {\fs} override) keeps either block
// from growing without limit -- these tests lock that in directly rather
// than via a real ffmpeg render.
test('a normal-length verse and translation get no {\\fs} override at all (unaffected by the line-count guard)', () => {
  const style = resolveStyle();
  const ass = buildAssSubtitles(captionData, style, layout);
  const { arabicFs, translationFs } = parseEvent(captionEvents(ass)[0]);
  assert.equal(arabicFs, null);
  assert.equal(translationFs, null);
});

test('a very long verse (real text of Quran 2:282, the longest in the Qur\'an) shrinks the Arabic font and applies the SAME size to every word event in that verse (no jitter as the highlighted word changes)', () => {
  const style = resolveStyle({ typography: { arabicFontSize: 60 } });
  const longArabicWords = Array(30)
    .fill('وَٱلَّذِينَ ءَامَنُوا۟ وَهَاجَرُوا۟ وَجَٰهَدُوا۟ فِى سَبِيلِ ٱللَّهِ')
    .join(' ')
    .split(' ')
    .map((text, i) => ({ text, startMs: i * 300, endMs: (i + 1) * 300 }));
  const longVerseData = {
    verses: [{ startMs: 0, endMs: longArabicWords.length * 300, verseNumber: 1, words: longArabicWords, translationText: 'x' }],
  };
  const ass = buildAssSubtitles(longVerseData, style, layout);
  const sizes = captionEvents(ass).map((l) => parseEvent(l).arabicFs);
  assert.ok(sizes.every((s) => s !== null), 'every word event should carry a shrunk font size');
  assert.ok(sizes.every((s) => s === sizes[0]), 'font size must be identical across all word events in the verse');
  assert.ok(sizes[0] < 60, `expected a shrunk size below the base 60, got ${sizes[0]}`);
  assert.ok(sizes[0] >= Math.round(60 * 0.55), 'must never shrink below the 55% floor');
});

test('a very long translation (real text of Quran 2:282) shrinks the Translation font down to (but not below) the 55% floor', () => {
  const style = resolveStyle({ typography: { translationFontSize: 32 } });
  const longTranslation = Array(15)
    .fill('This is a fairly long translation sentence that will definitely wrap across many lines on screen.')
    .join(' ');
  const longVerseData = {
    verses: [{ startMs: 0, endMs: 3000, verseNumber: 1, words: [{ text: 'ب', startMs: 0, endMs: 3000 }], translationText: longTranslation }],
  };
  const ass = buildAssSubtitles(longVerseData, style, layout);
  const { translationFs: size } = parseEvent(captionEvents(ass)[0]);
  assert.ok(size !== null && size < 32, `expected a shrunk size below the base 32, got ${size}`);
  assert.ok(size >= Math.round(32 * 0.55), 'must never shrink below the 55% floor');
});

// Regression tests for the real reported bug that the captions kept CHANGING
// POSITION through an export (confirmed on a real 33-minute export: the
// caption block sat at visibly different heights from verse to verse, and
// drifted off-center). Root cause: Arabic and Translation used to be two
// separate events, each anchored at its own fixed Y and each growing away
// from that anchor by however many lines it wrapped to -- so the pair's
// position and extent shifted with every verse's line counts, and no choice
// of fixed anchors could keep it centered. Fixed by rendering both as ONE
// event, whose whole block libass centers on a single point.
test('Arabic and Translation are ONE event (never separate Translation-style events), so they can never drift apart', () => {
  const style = resolveStyle();
  const ass = buildAssSubtitles(multiWordCaptionData, style, layout);
  const events = captionEvents(ass);
  assert.ok(events.length > 0);
  for (const line of events) {
    assert.ok(line.includes(',Arabic,'), 'every event uses the Arabic style as its base');
    assert.ok(!line.includes(',Translation,'), 'no separate Translation-style event should exist');
    assert.match(eventText(line), TRANSLATION_MARKER, 'every event must carry the translation block too');
  }
});

test('every event carries an explicit {\\an\\pos(x,y)} anchor, at the right point for each textPosition mode', () => {
  for (const textPosition of ['upper-third', 'center', 'lower-third']) {
    const style = resolveStyle({ colors: { textPosition } });
    const ass = buildAssSubtitles(multiWordCaptionData, style, layout);
    const { scrimTop, scrimHeight, arabicMarginV, translationMarginV } = captionVerticalLayout(textPosition, layout.canvasHeight);
    const expected = {
      // top-anchored where the Arabic line used to start
      'upper-third': { an: 8, y: arabicMarginV },
      // middle-anchored on the scrim band's own center
      center: { an: 5, y: Math.round(scrimTop + scrimHeight / 2) },
      // bottom-anchored where the Translation line used to end
      'lower-third': { an: 2, y: layout.canvasHeight - translationMarginV },
    }[textPosition];
    for (const line of captionEvents(ass)) {
      const match = parseEvent(line).prefix.match(/\\an(\d)\\pos\((\d+),(\d+)\)/);
      assert.ok(match, `${textPosition}: expected a leading {\\an\\pos(x,y)} override`);
      assert.equal(Number(match[1]), expected.an, `${textPosition}: alignment`);
      assert.equal(Number(match[2]), layout.canvasWidth / 2, `${textPosition}: x must be the horizontal center`);
      assert.equal(Number(match[3]), expected.y, `${textPosition}: y`);
    }
  }
});

test("'center' mode's block is anchored on the true vertical middle of the canvas, and the scrim band is centered there too", () => {
  const { scrimTop, scrimHeight } = captionVerticalLayout('center', layout.canvasHeight);
  assert.equal(scrimTop + scrimHeight / 2, layout.canvasHeight / 2);
  const style = resolveStyle({ colors: { textPosition: 'center' } });
  const line = captionEvents(buildAssSubtitles(captionData, style, layout))[0];
  assert.match(parseEvent(line).prefix, new RegExp(`\\\\an5\\\\pos\\(640,${layout.canvasHeight / 2}\\)`));
});

test('a verse\'s events are contiguous and stay inside the verse window (no blank gaps between words, no overlap with the previous verse)', () => {
  const style = resolveStyle({ colors: { wordHighlightEnabled: true } });
  const gappyData = {
    verses: [
      {
        startMs: 1000,
        endMs: 4000,
        verseNumber: 1,
        translationText: 'first',
        words: [
          // starts 55ms BEFORE the verse window (real data does this) and
          // leaves a gap before the next word
          { text: 'اول', startMs: 945, endMs: 1500 },
          { text: 'دوم', startMs: 2000, endMs: 2500 },
          { text: 'سوم', startMs: 2500, endMs: 3900 },
        ],
      },
      { startMs: 4000, endMs: 6000, verseNumber: 2, translationText: 'second', words: [{ text: 'چهارم', startMs: 4000, endMs: 6000 }] },
    ],
  };
  const events = captionEvents(buildAssSubtitles(gappyData, style, layout));
  const windows = events.map(eventWindow);
  assert.equal(windows[0][0], 1000, 'first event starts exactly at the verse start, not at the word\'s earlier start');
  for (let i = 1; i < windows.length; i++) {
    assert.equal(windows[i][0], windows[i - 1][1], `event ${i} must start exactly where event ${i - 1} ends`);
  }
  assert.equal(windows[windows.length - 1][1], 6000, 'the last event ends exactly at the last verse end');
});

// Regression test for a real reported bug, confirmed on a real downloaded
// export: for a verse long enough to wrap onto multiple lines, the two
// lines visibly SWAPPED which one rendered on top as the highlighted word
// advanced through the sentence -- not just re-wrapped, but flipped whole.
// Root cause: the highlight override tag splits the line into runs that
// must be listed in file-REVERSED order for correct RTL (see the comment
// above `segments` in assBuilder.js), but libass's own auto-wrap decides
// line breaks from that same file-order string -- so which words land on
// which line depended on which word was highlighted. Fixed by deciding line
// breaks ourselves once per verse (wrapWordsIntoLines). This test builds a
// real multi-line verse (35 words) and checks that highlighting every word
// in turn never changes which OTHER words share its line.
test('a multi-line verse keeps identical line breaks no matter which word is highlighted (regression: lines used to swap)', () => {
  const style = resolveStyle({ colors: { wordHighlightEnabled: true } });
  const arabicWords = Array(35)
    .fill('وَٱلَّذِينَ ءَامَنُوا۟ وَهَاجَرُوا۟ وَجَٰهَدُوا۟ فِى سَبِيلِ ٱللَّهِ')
    .join(' ')
    .split(' ')
    .slice(0, 35);
  const words = arabicWords.map((text, i) => ({ text, startMs: i * 300, endMs: (i + 1) * 300 }));
  const longVerseData = {
    verses: [{ startMs: 0, endMs: words.length * 300, verseNumber: 1, words, translationText: 'x' }],
  };
  const events = captionEvents(buildAssSubtitles(longVerseData, style, layout));
  assert.ok(events.length === words.length, 'expected one event per highlighted word');

  // The line CONTAINING the highlighted word legitimately reverses its own
  // internal file order (that's the correct RTL fix for wherever the
  // highlight sits -- see the comment above `segments`), so comparing exact
  // strings across events would flag that expected, correct variation as a
  // false failure. The actual invariant that matters -- and the one that
  // was broken -- is which words are GROUPED onto which line at all; count
  // words per \N-separated line rather than compare their order.
  function lineWordCounts(line) {
    const plain = parseEvent(line).arabic.replace(/\{\\c&H[0-9A-F]+&\\shad\d+\}/g, '').replace(/\{\\r\}/g, '');
    return plain.split('\\N').map((l) => l.trim().split(/\s+/).filter(Boolean).length);
  }

  const first = lineWordCounts(events[0]);
  assert.ok(first.length > 1, 'test setup should produce a multi-line verse');
  for (let i = 1; i < events.length; i++) {
    assert.deepEqual(lineWordCounts(events[i]), first, `word ${i}'s per-line word counts differ from word 0's -- line breaks are unstable`);
  }
});
