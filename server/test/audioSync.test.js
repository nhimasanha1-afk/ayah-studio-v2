import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioFilterComplex } from '../src/lib/videoComposition.js';

test('no intro window, no offset, no bismillah -> audio passes through untouched', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 0 },
  });
  assert.deepEqual(audioFilterParts, []);
  assert.equal(audioOutLabel, '1:a');
});

test('positive offset with no intro window -> adelay applied to the real audio, not just a label', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 0 },
    audioSyncOffsetMs: 400,
  });
  assert.equal(audioFilterParts.length, 1);
  assert.match(audioFilterParts[0], /^\[1:a\]adelay=400:all=1\[mainDelayed\]$/);
  assert.equal(audioOutLabel, 'mainDelayed');
});

test('negative offset with no intro window -> atrim pulls the audio earlier by that amount', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 0 },
    audioSyncOffsetMs: -250,
  });
  assert.equal(audioFilterParts.length, 1);
  assert.match(audioFilterParts[0], /^\[1:a\]atrim=start=0\.250,asetpts=PTS-STARTPTS\[mainDelayed\]$/);
  assert.equal(audioOutLabel, 'mainDelayed');
});

test('offset combines additively with the intro window delay (not replacing it)', () => {
  const { audioFilterParts } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 3000 },
    audioSyncOffsetMs: 200,
  });
  assert.match(audioFilterParts[0], /adelay=3200:all=1/);
});

test('negative offset can partially cancel an intro window delay', () => {
  const { audioFilterParts } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 3000 },
    audioSyncOffsetMs: -1000,
  });
  assert.match(audioFilterParts[0], /adelay=2000:all=1/);
});

test('offset that exactly cancels the intro window delay -> zero-delay passthrough (still correct, not a crash)', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 1000 },
    audioSyncOffsetMs: -1000,
  });
  assert.deepEqual(audioFilterParts, []);
  assert.equal(audioOutLabel, '1:a');
});

test('offset applies to the main recitation only -- bismillah audio is never shifted by it', () => {
  const { audioFilterParts } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: '2:a',
    introWindow: { windowMs: 5000 },
    audioSyncOffsetMs: 300,
  });
  // Bismillah still starts at t=0 regardless of the main-audio offset.
  assert.ok(audioFilterParts.some((p) => p.startsWith('[2:a]adelay=0:all=1')));
  assert.ok(audioFilterParts.some((p) => p.startsWith('[1:a]adelay=5300:all=1')));
});

test('offset with bismillah present still routes through the amix, main audio genuinely shifted', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: '2:a',
    introWindow: { windowMs: 0 },
    audioSyncOffsetMs: -150,
  });
  assert.ok(audioFilterParts.some((p) => p.includes('atrim=start=0.150')));
  assert.ok(audioFilterParts.some((p) => p.includes('amix=inputs=2')));
  assert.equal(audioOutLabel, 'aout');
});

test('volumeMultiplier of 1 (default) produces no filter at all when nothing else is happening', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 0 },
    volumeMultiplier: 1,
  });
  assert.deepEqual(audioFilterParts, []);
  assert.equal(audioOutLabel, '1:a');
});

test('volumeMultiplier applies a real volume filter to the main recitation only', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 0 },
    volumeMultiplier: 1.5,
  });
  assert.equal(audioFilterParts.length, 1);
  assert.match(audioFilterParts[0], /^\[1:a\]volume=1\.5\[mainSynced\]$/);
  assert.equal(audioOutLabel, 'mainSynced');
});

test('volumeMultiplier combines with a sync offset in the correct order (delay/trim, then volume)', () => {
  const { audioFilterParts, audioOutLabel } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: null,
    introWindow: { windowMs: 0 },
    audioSyncOffsetMs: 400,
    volumeMultiplier: 0.5,
  });
  assert.equal(audioFilterParts.length, 2);
  assert.match(audioFilterParts[0], /^\[1:a\]adelay=400:all=1\[mainDelayed\]$/);
  assert.match(audioFilterParts[1], /^\[mainDelayed\]volume=0\.5\[mainSynced\]$/);
  assert.equal(audioOutLabel, 'mainSynced');
});

test('volumeMultiplier never touches the Bismillah track, even when both are active', () => {
  const { audioFilterParts } = buildAudioFilterComplex({
    mainAudioInputLabel: '1:a',
    bismillahAudioInputLabel: '2:a',
    introWindow: { windowMs: 5000 },
    volumeMultiplier: 2,
  });
  assert.ok(audioFilterParts.some((p) => p === '[2:a]adelay=0:all=1[introDelayed]'));
  assert.ok(!audioFilterParts.some((p) => p.includes('2:a]volume')));
});
