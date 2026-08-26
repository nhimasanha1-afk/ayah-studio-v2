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

test('showAyahNumbers off (default): no verse number appears on either line', () => {
  const style = resolveStyle();
  const ass = buildAssSubtitles(captionData, style, layout);
  const [arabicLine] = dialogueLines(ass, 'Arabic');
  const [translationLine] = dialogueLines(ass, 'Translation');
  assert.ok(!arabicLine.includes('٣'));
  assert.ok(!translationLine.includes('(3)'));
});

test('showAyahNumbers on: Arabic line gets the Arabic-Indic numeral appended after the word, Translation line gets "(N) " prefixed', () => {
  const style = resolveStyle({ colors: { showAyahNumbers: true } });
  const ass = buildAssSubtitles(captionData, style, layout);
  const [arabicLine] = dialogueLines(ass, 'Arabic');
  const [translationLine] = dialogueLines(ass, 'Translation');

  // Arabic: number comes after the word text, mirroring how the sentence
  // naturally ends on screen-left for RTL text.
  const arabicText = arabicLine.split(',').slice(9).join(',');
  assert.match(arabicText, /قُلْ.*٣$/);

  // Translation: number is a prefix at the very start of the line, per an
  // explicit user choice to keep both numbers on the left even though
  // English's natural sentence-end is on the right.
  const translationText = translationLine.split(',').slice(9).join(',');
  assert.match(translationText, /^\(3\) Say, He is God, the One$/);
});

test('the Arabic ayah number always renders in the normal (non-highlighted) color, even on the single-word verse where that word is the active/highlighted one', () => {
  const style = resolveStyle({ colors: { showAyahNumbers: true, highlightColor: '#FFD700', arabicTextColor: '#FFFFFF' } });
  const ass = buildAssSubtitles(captionData, style, layout);
  const [arabicLine] = dialogueLines(ass, 'Arabic');
  const arabicText = arabicLine.split(',').slice(9).join(',');
  // The last override tag before the numeral must reset to the normal
  // arabic color, not leave the highlight color active.
  assert.match(arabicText, /\{\\c&H00FFFFFF&\\shad\d+\} ٣$/);
});
