import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptForLanguage, isRtlScript } from '../src/lib/translationFonts.js';

test('scriptForLanguage resolves scripts verified against real Quran.com sample text, including the non-obvious ones', () => {
  // These specifically overturn what a name-based guess would produce --
  // confirmed by fetching real translation text and inspecting codepoints.
  assert.equal(scriptForLanguage('kurdish'), 'arabic'); // not Latin
  assert.equal(scriptForLanguage('kazakh'), 'cyrillic'); // not Latin
  assert.equal(scriptForLanguage('uzbek'), 'latin'); // not Cyrillic
  assert.equal(scriptForLanguage('azeri'), 'latin'); // not Cyrillic
  assert.equal(scriptForLanguage('bambara'), 'nko'); // not Latin
});

test('scriptForLanguage resolves every Arabic-script translation language', () => {
  for (const lang of ['urdu', 'persian', 'dari', 'pashto', 'sindhi', 'uighur, uyghur']) {
    assert.equal(scriptForLanguage(lang), 'arabic', lang);
  }
});

test('scriptForLanguage resolves Indic and other non-Latin scripts', () => {
  assert.equal(scriptForLanguage('hindi'), 'devanagari');
  assert.equal(scriptForLanguage('bengali'), 'bengali');
  assert.equal(scriptForLanguage('assamese'), 'bengali');
  assert.equal(scriptForLanguage('tamil'), 'tamil');
  assert.equal(scriptForLanguage('telugu'), 'telugu');
  assert.equal(scriptForLanguage('kannada'), 'kannada');
  assert.equal(scriptForLanguage('malayalam'), 'malayalam');
  assert.equal(scriptForLanguage('gujarati'), 'gujarati');
  assert.equal(scriptForLanguage('sinhala, sinhalese'), 'sinhala');
  assert.equal(scriptForLanguage('thai'), 'thai');
  assert.equal(scriptForLanguage('central khmer'), 'khmer');
  assert.equal(scriptForLanguage('amharic'), 'ethiopic');
  assert.equal(scriptForLanguage('hebrew'), 'hebrew');
  assert.equal(scriptForLanguage('chinese'), 'han');
  assert.equal(scriptForLanguage('japanese'), 'kana');
  assert.equal(scriptForLanguage('korean'), 'hangul');
  assert.equal(scriptForLanguage('divehi'), 'thaana');
  assert.equal(scriptForLanguage('divehi, dhivehi, maldivian'), 'thaana');
});

test('scriptForLanguage defaults unknown/unlisted languages to latin', () => {
  assert.equal(scriptForLanguage('french'), 'latin');
  assert.equal(scriptForLanguage('spanish'), 'latin');
  assert.equal(scriptForLanguage('some-made-up-language'), 'latin');
  assert.equal(scriptForLanguage(undefined), 'latin');
  assert.equal(scriptForLanguage(null), 'latin');
});

test('scriptForLanguage is case-insensitive and trims whitespace (Quran.com data has inconsistent casing, e.g. "Dutch" vs "dutch")', () => {
  assert.equal(scriptForLanguage('URDU'), 'arabic');
  assert.equal(scriptForLanguage('  Hebrew  '), 'hebrew');
  assert.equal(scriptForLanguage('Kurdish'), 'arabic');
});

test('isRtlScript flags exactly the RTL scripts', () => {
  assert.equal(isRtlScript('arabic'), true);
  assert.equal(isRtlScript('hebrew'), true);
  assert.equal(isRtlScript('thaana'), true);
  assert.equal(isRtlScript('nko'), true);
  assert.equal(isRtlScript('latin'), false);
  assert.equal(isRtlScript('cyrillic'), false);
  assert.equal(isRtlScript('devanagari'), false);
  assert.equal(isRtlScript('han'), false);
});
