import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilterComplex } from '../src/lib/videoComposition.js';
import { resolveStyle } from '../src/lib/styleConfig.js';

const baseArgs = {
  style: resolveStyle(),
  assPath: '/tmp/fake.ass',
  fontsDir: '/tmp/fonts',
  surahBadgeText: { line1: 'Al-Ikhlas', line2: 'The Sincerity • 112' },
  logoInputLabel: null,
  backgroundInputLabel: '0:v',
  canvasWidth: 1280,
  canvasHeight: 720,
  scaleFactor: 1,
  totalDurationSeconds: 17,
};

test('no introBackgroundInputLabel -> no cover-fit overlay stage for the intro window', () => {
  const graph = buildFilterComplex({
    ...baseArgs,
    introWindow: { windowMs: 3000, showBismillahText: true, bismillahText: 'text', showIntroCard: false },
  });
  assert.ok(!graph.includes('force_original_aspect_ratio=increase'));
});

test('introBackgroundInputLabel -> a time-gated, canvas-covering overlay is drawn before the intro text', () => {
  const graph = buildFilterComplex({
    ...baseArgs,
    introWindow: { windowMs: 3000, showBismillahText: true, bismillahText: 'text', showIntroCard: false },
    introBackgroundInputLabel: '4:v',
  });
  assert.match(
    graph,
    /\[4:v\]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720\[v\d+\];\[v\d+\]\[v\d+\]overlay=x=0:y=0:enable='lt\(t\\,3\.000\)'\[v\d+\]/
  );
  const overlayIndex = graph.indexOf('overlay=x=0:y=0');
  const textIndex = graph.indexOf('drawtext=');
  assert.ok(overlayIndex >= 0 && textIndex >= 0 && overlayIndex < textIndex);
});

test('no outroBackgroundInputLabel -> no cover-fit overlay stage for the outro window', () => {
  const graph = buildFilterComplex({
    ...baseArgs,
    introWindow: { windowMs: 0 },
    outroWindow: { enabled: true, startSec: 13, durationSec: 4, line1: 'Thanks', line2: '' },
  });
  assert.ok(!graph.includes('force_original_aspect_ratio=increase'));
});

test('outroBackgroundInputLabel -> a time-gated overlay is drawn before the outro scrim', () => {
  const graph = buildFilterComplex({
    ...baseArgs,
    introWindow: { windowMs: 0 },
    outroWindow: { enabled: true, startSec: 13, durationSec: 4, line1: 'Thanks', line2: '' },
    outroBackgroundInputLabel: '4:v',
  });
  assert.match(graph, /\[4:v\]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720/);
  const overlayIndex = graph.indexOf('overlay=x=0:y=0');
  const scrimIndex = graph.indexOf('drawbox=x=0:y=0');
  assert.ok(overlayIndex >= 0 && scrimIndex >= 0 && overlayIndex < scrimIndex);
});
