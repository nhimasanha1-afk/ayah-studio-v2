import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowBismillahText,
  shouldPlayBismillahAudio,
  computeIntroTimingWindow,
} from '../src/lib/introTiming.js';

test('shouldShowBismillahText depends only on the text toggle', () => {
  for (const bismillahAudioEnabled of [true, false]) {
    assert.equal(shouldShowBismillahText({ bismillahTextEnabled: true, bismillahAudioEnabled }), true);
    assert.equal(shouldShowBismillahText({ bismillahTextEnabled: false, bismillahAudioEnabled }), false);
  }
});

test('shouldPlayBismillahAudio depends only on the audio toggle', () => {
  for (const bismillahTextEnabled of [true, false]) {
    assert.equal(shouldPlayBismillahAudio({ bismillahAudioEnabled: true, bismillahTextEnabled }), true);
    assert.equal(shouldPlayBismillahAudio({ bismillahAudioEnabled: false, bismillahTextEnabled }), false);
  }
});

test('the critical regression case: audio on, text off must still play audio', () => {
  // This was the single most repeated bug in the prior build.
  const config = { bismillahAudioEnabled: true, bismillahTextEnabled: false };
  assert.equal(shouldPlayBismillahAudio(config), true);
  assert.equal(shouldShowBismillahText(config), false);
});

test('the mirror case: text on, audio off must still show text and not play audio', () => {
  const config = { bismillahAudioEnabled: false, bismillahTextEnabled: true };
  assert.equal(shouldPlayBismillahAudio(config), false);
  assert.equal(shouldShowBismillahText(config), true);
});

test('nothing enabled -> zero-length window', () => {
  const result = computeIntroTimingWindow({
    introCardEnabled: false,
    bismillahTextEnabled: false,
    bismillahAudioEnabled: false,
  });
  assert.deepEqual(result, { windowMs: 0, startMs: 0, endMs: 0 });
});

test('bismillah audio only (no intro card) -> window is exactly the real audio duration', () => {
  const result = computeIntroTimingWindow({
    introCardEnabled: false,
    bismillahTextEnabled: false,
    bismillahAudioEnabled: true,
    bismillahAudioDurationMs: 4820,
  });
  assert.deepEqual(result, { windowMs: 4820, startMs: 0, endMs: 4820 });
});

test('intro card + bismillah audio -> concurrent window, NOT sequential sum', () => {
  // This is exactly the bug the brief calls out: the window must be
  // max(card, audio), never card + audio.
  const result = computeIntroTimingWindow({
    introCardEnabled: true,
    bismillahTextEnabled: true,
    bismillahAudioEnabled: true,
    bismillahAudioDurationMs: 4820,
    introCardDurationMs: 3000,
  });
  assert.equal(result.windowMs, 4820); // audio is longer than the card, wins
  assert.notEqual(result.windowMs, 4820 + 3000); // must not be the sequential sum
});

test('intro card longer than a short bismillah audio clip -> card duration wins, audio still fits inside it', () => {
  const result = computeIntroTimingWindow({
    introCardEnabled: true,
    bismillahTextEnabled: false,
    bismillahAudioEnabled: true,
    bismillahAudioDurationMs: 1500,
    introCardDurationMs: 3000,
  });
  assert.equal(result.windowMs, 3000);
});

test('intro card only, no audio, no text -> window is the card duration', () => {
  const result = computeIntroTimingWindow({
    introCardEnabled: true,
    bismillahTextEnabled: false,
    bismillahAudioEnabled: false,
    introCardDurationMs: 3000,
  });
  assert.deepEqual(result, { windowMs: 3000, startMs: 0, endMs: 3000 });
});

test('bismillah text only, no card, no audio -> window is the default display duration', () => {
  const result = computeIntroTimingWindow({
    introCardEnabled: false,
    bismillahTextEnabled: true,
    bismillahAudioEnabled: false,
    introCardDurationMs: 3000,
  });
  assert.deepEqual(result, { windowMs: 3000, startMs: 0, endMs: 3000 });
});

test('bismillah audio enabled without a real duration throws rather than silently guessing', () => {
  assert.throws(() =>
    computeIntroTimingWindow({
      introCardEnabled: false,
      bismillahTextEnabled: false,
      bismillahAudioEnabled: true,
    })
  );
});
