import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSrt } from '../src/lib/srtBuilder.js';

function verse(overrides) {
  return {
    verseKey: '1:1',
    verseNumber: 1,
    arabicText: 'قُلْ',
    translationText: 'Say,',
    startMs: 0,
    endMs: 1000,
    words: [],
    isEstimated: false,
    ...overrides,
  };
}

test('single verse produces a correctly numbered, correctly timestamped entry', () => {
  const srt = buildSrt({ verses: [verse({ startMs: 0, endMs: 2980 })] }, null);
  assert.equal(
    srt.trim(),
    '1\n00:00:00,000 --> 00:00:02,980\nقُلْ\nSay,'
  );
});

test('multiple verses are numbered sequentially in order', () => {
  const srt = buildSrt(
    {
      verses: [
        verse({ verseKey: '1:1', startMs: 0, endMs: 1000 }),
        verse({ verseKey: '1:2', startMs: 1000, endMs: 2500 }),
        verse({ verseKey: '1:3', startMs: 2500, endMs: 4000 }),
      ],
    },
    null
  );
  const indices = srt.split('\n\n').filter(Boolean).map((block) => block.split('\n')[0]);
  assert.deepEqual(indices, ['1', '2', '3']);
});

test('timestamp formatting rolls over minutes and hours correctly', () => {
  const srt = buildSrt({ verses: [verse({ startMs: 3_661_500, endMs: 3_662_005 })] }, null);
  assert.match(srt, /01:01:01,500 --> 01:01:02,005/);
});

test('verse with no translation text still emits a valid entry with just the Arabic line', () => {
  const srt = buildSrt({ verses: [verse({ translationText: '' })] }, null);
  assert.equal(srt.trim(), '1\n00:00:00,000 --> 00:00:01,000\nقُلْ');
});

test('a verse missing real timing (startMs/endMs null) is skipped rather than emitting a bogus 0-length entry', () => {
  const srt = buildSrt(
    {
      verses: [verse({ verseKey: '1:1', startMs: null, endMs: null }), verse({ verseKey: '1:2', startMs: 500, endMs: 1500 })],
    },
    null
  );
  assert.equal(srt.trim(), '1\n00:00:00,500 --> 00:00:01,500\nقُلْ\nSay,');
});

test('no intro window -> no Bismillah entry, verses start at index 1', () => {
  const srt = buildSrt({ verses: [verse()] }, { windowMs: 0 });
  assert.ok(!srt.includes('بِسْمِ'));
  assert.match(srt, /^1\n/);
});

test('Bismillah text shown -> a Bismillah entry is prepended covering [0, windowMs]', () => {
  const introWindow = { windowMs: 3000, showBismillahText: true, bismillahText: 'بِسْمِ ٱللَّهِ' };
  const srt = buildSrt({ verses: [verse({ startMs: 3000, endMs: 4000 })] }, introWindow);
  const blocks = srt.split('\n\n').filter(Boolean);
  assert.equal(blocks[0], '1\n00:00:00,000 --> 00:00:03,000\nبِسْمِ ٱللَّهِ');
  assert.match(blocks[1], /^2\n00:00:03,000/);
});

test('the critical independence rule: Bismillah AUDIO on but text off -> no Bismillah caption entry at all', () => {
  // Mirrors the backend's own rule: text toggle controls visibility only.
  // Audio playing without text must not produce a caption for it either.
  const introWindow = { windowMs: 3000, showBismillahText: false, bismillahText: 'بِسْمِ ٱللَّهِ' };
  const srt = buildSrt({ verses: [verse({ startMs: 3000, endMs: 4000 })] }, introWindow);
  assert.ok(!srt.includes('بِسْمِ'));
  assert.match(srt, /^1\n00:00:03,000/);
});

test('empty caption data produces an empty (but non-crashing) srt', () => {
  const srt = buildSrt({ verses: [] }, null);
  assert.equal(srt, '');
});
