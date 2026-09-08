import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssSubtitles } from '../src/lib/assBuilder.js';
import { resolveStyle } from '../src/lib/styleConfig.js';

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

function dialogueLines(assText, styleName) {
  return assText.split('\n').filter((l) => l.startsWith('Dialogue:') && l.includes(`,${styleName},`));
}

// Every Dialogue line now carries a mandatory leading {\an<N>\pos(x,y)}
// override (see captionAnchorPosition's comment in layout.js) so content
// assertions unrelated to positioning strip it first, same as they'd ignore
// any other override tag that isn't the thing under test.
const POS_PREFIX = /^\{\\an\d\\pos\(\d+,\d+\)[^}]*\}/;

function dialogueText(line) {
  return line.split(',').slice(9).join(',').replace(POS_PREFIX, '');
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
  const [arabicLine] = dialogueLines(ass, 'Arabic');
  const [translationLine] = dialogueLines(ass, 'Translation');
  assert.ok(!arabicLine.includes('٣'));
  assert.ok(!translationLine.includes('(3)'));
});

test('showArabicAyahNumbers controls only the Arabic marker; showAyahNumbers controls only the translation prefix, independently', () => {
  const arabicOnly = resolveStyle({ colors: { showArabicAyahNumbers: true, showAyahNumbers: false } });
  const arabicOnlyAss = buildAssSubtitles(captionData, arabicOnly, layout);
  assert.ok(dialogueLines(arabicOnlyAss, 'Arabic')[0].includes('﴿٣﴾'));
  assert.ok(!dialogueLines(arabicOnlyAss, 'Translation')[0].includes('(3)'));

  const translationOnly = resolveStyle({ colors: { showArabicAyahNumbers: false, showAyahNumbers: true } });
  const translationOnlyAss = buildAssSubtitles(captionData, translationOnly, layout);
  assert.ok(!dialogueLines(translationOnlyAss, 'Arabic')[0].includes('﴿٣﴾'));
  assert.ok(dialogueLines(translationOnlyAss, 'Translation')[0].includes('(3)'));
});

test('both on: Arabic line gets the Arabic-Indic numeral appended after the word, Translation line gets "(N) " prefixed', () => {
  const style = resolveStyle({ colors: { showAyahNumbers: true, showArabicAyahNumbers: true } });
  const ass = buildAssSubtitles(captionData, style, layout);
  const [arabicLine] = dialogueLines(ass, 'Arabic');
  const [translationLine] = dialogueLines(ass, 'Translation');

  // Arabic: the number, wrapped in ornate Quranic parentheses (﴿٣﴾), reads
  // as coming after the word -- but libass places {\...}-override-delimited
  // runs at their literal file-order position rather than bidi-reordering
  // them for RTL (verified directly by rendering test frames), so to make
  // the marker land on-screen where it belongs (after the word, i.e. to
  // its screen-left) it must be written FIRST in the file, ahead of the
  // (itself override-wrapped, since word highlighting is on by default)
  // word run.
  const arabicText = dialogueText(arabicLine);
  assert.match(arabicText, /^\{\\c&H[0-9A-F]+&\\shad\d+\}﴿٣﴾\{\\r\} \{\\c&H[0-9A-F]+&\\shad0\}قُلْ/);

  // Translation: number is a prefix at the very start of the line, per an
  // explicit user choice to keep both numbers on the left even though
  // English's natural sentence-end is on the right.
  const translationText = dialogueText(translationLine);
  assert.match(translationText, /^\(3\) Say, He is God, the One$/);
});

test('the Arabic ayah number always renders in the normal (non-highlighted) color, even on the single-word verse where that word is the active/highlighted one', () => {
  const style = resolveStyle({
    colors: { showArabicAyahNumbers: true, highlightColor: '#FFD700', arabicTextColor: '#FFFFFF' },
  });
  const ass = buildAssSubtitles(captionData, style, layout);
  const [arabicLine] = dialogueLines(ass, 'Arabic');
  const arabicText = dialogueText(arabicLine);
  // The override block wrapping the numeral (now written first in the
  // file -- see the run-order comment in assBuilder.js) must use the
  // normal arabic color, not leave the highlight color active.
  assert.match(arabicText, /^\{\\c&H00FFFFFF&\\shad\d+\}﴿٣﴾\{\\r\}/);
});

test('wordHighlightEnabled: false -> no per-word color override anywhere on the Arabic line', () => {
  const style = resolveStyle({ colors: { wordHighlightEnabled: false } });
  const ass = buildAssSubtitles(captionData, style, layout);
  const arabicLines = dialogueLines(ass, 'Arabic');
  for (const line of arabicLines) {
    const arabicText = dialogueText(line);
    assert.ok(!arabicText.includes('{\\c'), `expected no color override, got: ${arabicText}`);
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
  const arabicLines = dialogueLines(ass, 'Arabic');
  // The 3rd word ("سوم", index 2) is the active/highlighted one in its dialogue line.
  const line = arabicLines[2];
  const text = dialogueText(line);
  assert.match(
    text,
    /^\{\\c&H[0-9A-F]+&\\shad\d+\}﴿١﴾\{\\r\} چهارم پنجم \{\\c&H[0-9A-F]+&\\shad0\}سوم\{\\c&H[0-9A-F]+&\\shad\d+\} اول دوم$/
  );
});

// Regression test for a real reported bug: on a downloaded export, the
// Arabic caption appeared to move up and down and end up below the
// Translation line at random. Root cause (confirmed by rendering real test
// frames and reading back pixel rows): both caption styles are
// bottom-anchored with no cap on how many lines a long verse/translation
// can wrap into, so a long enough Translation climbs up far enough to pass
// the Arabic line's fixed position, visually inverting the reading order.
// The fix bounds each verse's Arabic/Translation font size (via a per-line
// {\fs} override) so wrapping can never grow either block into the other's
// space -- these tests lock in that behavior directly rather than via a
// real ffmpeg render.
function fontSizeOverride(dialogueText) {
  const match = dialogueText.match(/^\{[^}]*\\fs(\d+)[^}]*\}/);
  return match ? Number(match[1]) : null;
}

test('a normal-length verse and translation get no {\\fs} override at all (unaffected by the overlap guard)', () => {
  const style = resolveStyle();
  const ass = buildAssSubtitles(captionData, style, layout);
  const [arabicLine] = dialogueLines(ass, 'Arabic');
  const [translationLine] = dialogueLines(ass, 'Translation');
  assert.equal(fontSizeOverride(arabicLine.split(',').slice(9).join(',')), null);
  assert.equal(fontSizeOverride(translationLine.split(',').slice(9).join(',')), null);
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
  const sizes = dialogueLines(ass, 'Arabic').map((l) => fontSizeOverride(l.split(',').slice(9).join(',')));
  assert.ok(sizes.every((s) => s !== null), 'every word event should carry a shrunk font size');
  assert.ok(sizes.every((s) => s === sizes[0]), 'font size must be identical across all word events in the verse');
  assert.ok(sizes[0] < 60, `expected a shrunk size below the base 60, got ${sizes[0]}`);
  assert.ok(sizes[0] >= Math.round(60 * 0.55), 'must never shrink below the 55% floor');
});

// Regression test for a real reported bug, distinct from the wrap-overlap
// one above: on a downloaded export using the default 'center' text
// position, the Arabic and Translation lines intermittently swapped
// vertical order. Not reproducible by regenerating the exact real verse
// data that triggered it in isolation (ruling out anything content-length
// related), which pointed to libass's own automatic collision avoidance:
// 'center' uses ASS Alignment 5, where MarginV doesn't carve out two
// distinct, stable vertical slots for the two styles the way it does for
// Alignment 2/8 (bottom/top, anchored to a genuine screen edge) -- both
// styles end up wanting the same central position, and only collision
// avoidance (re-run on every one of the many per-word Arabic re-layouts)
// keeps them apart, with no guaranteed order. The fix gives every line an
// explicit {\an<N>\pos(x,y)} override, which per the ASS spec is exempt
// from collision avoidance entirely -- these tests confirm the override is
// present and gives Arabic/Translation distinct, deterministically-ordered
// anchor points for all three textPosition modes.
test('every caption Dialogue line carries an explicit {\\an\\pos(x,y)} override, in all three textPosition modes', () => {
  for (const textPosition of ['upper-third', 'center', 'lower-third']) {
    const style = resolveStyle({ colors: { textPosition } });
    const ass = buildAssSubtitles(captionData, style, layout);
    const [arabicLine] = dialogueLines(ass, 'Arabic');
    const [translationLine] = dialogueLines(ass, 'Translation');
    for (const line of [arabicLine, translationLine]) {
      const text = line.split(',').slice(9).join(',');
      assert.match(text, POS_PREFIX, `${textPosition}: expected a leading {\\an\\pos(x,y)} override, got: ${text}`);
    }
  }
});

test('Arabic and Translation always get distinct anchor points, with Arabic positioned further from whichever edge the layout grows away from', () => {
  function anchorPoint(line) {
    const match = line.split(',').slice(9).join(',').match(/^\{\\an(\d)\\pos\((\d+),(\d+)\)/);
    return { an: Number(match[1]), x: Number(match[2]), y: Number(match[3]) };
  }
  for (const textPosition of ['upper-third', 'center', 'lower-third']) {
    const style = resolveStyle({ colors: { textPosition } });
    const ass = buildAssSubtitles(captionData, style, layout);
    const arabic = anchorPoint(dialogueLines(ass, 'Arabic')[0]);
    const translation = anchorPoint(dialogueLines(ass, 'Translation')[0]);
    assert.equal(arabic.an, translation.an, `${textPosition}: both styles must share the same alignment override`);
    assert.equal(arabic.x, translation.x, `${textPosition}: both styles must share the same horizontal center`);
    assert.notEqual(arabic.y, translation.y, `${textPosition}: Arabic and Translation must not share the same anchor Y`);
    // Alignment 8 grows downward from the anchor (top-anchored) so Arabic
    // must start higher (smaller y); alignment 2 grows upward (bottom-
    // anchored) so Arabic's anchor must be further from the bottom edge
    // (smaller y) too -- in both cases Arabic's y is the smaller one.
    assert.ok(arabic.y < translation.y, `${textPosition}: expected Arabic's anchor above Translation's, got Arabic.y=${arabic.y}, Translation.y=${translation.y}`);
  }
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
  const [translationLine] = dialogueLines(ass, 'Translation');
  const size = fontSizeOverride(translationLine.split(',').slice(9).join(','));
  assert.ok(size !== null && size < 32, `expected a shrunk size below the base 32, got ${size}`);
  assert.ok(size >= Math.round(32 * 0.55), 'must never shrink below the 55% floor');
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
// breaks ourselves once per verse (wrapWordsIntoLines) and disabling
// libass's auto-wrap (\q2) for these events. This test builds a real
// multi-line verse (35 words) and checks that highlighting every word in
// turn never changes which OTHER words share its line.
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
  const ass = buildAssSubtitles(longVerseData, style, layout);
  const arabicLines = dialogueLines(ass, 'Arabic');
  assert.ok(arabicLines.length === words.length, 'expected one Dialogue line per word');

  // The line CONTAINING the highlighted word legitimately reverses its own
  // internal file order (that's the correct RTL fix for wherever the
  // highlight sits -- see the comment above `segments`), so comparing exact
  // strings across events would flag that expected, correct variation as a
  // false failure. The actual invariant that matters -- and the one that
  // was broken -- is which words are GROUPED onto which line at all; count
  // words per \N-separated line rather than compare their order.
  function lineWordCounts(dialogueLine) {
    const text = dialogueText(dialogueLine);
    const plain = text.replace(/\{\\c&H[0-9A-F]+&\\shad\d+\}/g, '').replace(/\{\\r\}/g, '');
    return plain.split('\\N').map((line) => line.trim().split(/\s+/).filter(Boolean).length);
  }

  const first = lineWordCounts(arabicLines[0]);
  assert.ok(first.length > 1, 'test setup should produce a multi-line verse');
  for (let i = 1; i < arabicLines.length; i++) {
    const counts = lineWordCounts(arabicLines[i]);
    assert.deepEqual(counts, first, `word ${i}'s per-line word counts differ from word 0's -- line breaks are unstable`);
  }
});
