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
  introWindow: { windowMs: 0 },
  backgroundInputLabel: '0:v',
  canvasWidth: 1280,
  canvasHeight: 720,
  scaleFactor: 1,
  totalDurationSeconds: 17,
};

test('no outroWindow -> no outro filter stages at all', () => {
  const graph = buildFilterComplex({ ...baseArgs, outroWindow: undefined });
  assert.ok(!graph.includes('drawbox=x=0:y=0'));
  assert.ok(graph.endsWith('[vout]'));
});

test('outroWindow.enabled: false -> no outro stages, still ends in [vout]', () => {
  const graph = buildFilterComplex({ ...baseArgs, outroWindow: { enabled: false } });
  assert.ok(!graph.includes('drawbox=x=0:y=0'));
  assert.ok(graph.endsWith('[vout]'));
});

test('enabled outro adds a time-gated full-frame scrim and centered text, and still ends in [vout]', () => {
  const outroWindow = { enabled: true, startSec: 13, durationSec: 4, line1: 'JazakAllah Khair', line2: '' };
  const graph = buildFilterComplex({ ...baseArgs, outroWindow });
  assert.match(graph, /drawbox=x=0:y=0:w=1280:h=720:color=[^:]+:t=fill:enable='gte\(t\\,13\.000\)'/);
  assert.match(graph, /drawtext=fontfile='[^']*':text='JazakAllah Khair':.*enable='gte\(t\\,13\.000\)'/);
  assert.ok(graph.endsWith('[vout]'));
});

test('outro overlay opacity defaults to 0.55 when unset', () => {
  const outroWindow = { enabled: true, startSec: 13, durationSec: 4, line1: 'JazakAllah Khair', line2: '' };
  const graph = buildFilterComplex({ ...baseArgs, outroWindow });
  assert.match(graph, /color=0x000000@0\.55:t=fill/);
});

test('outro overlay opacity is user-adjustable, not hardcoded', () => {
  const outroWindow = { enabled: true, startSec: 13, durationSec: 4, line1: 'JazakAllah Khair', line2: '', overlayOpacity: 0.15 };
  const graph = buildFilterComplex({ ...baseArgs, outroWindow });
  assert.match(graph, /color=0x000000@0\.15:t=fill/);
});

test('outro with both lines joins them with a newline in the drawtext', () => {
  const outroWindow = { enabled: true, startSec: 10, durationSec: 3, line1: 'Thank you', line2: 'Subscribe for more' };
  const graph = buildFilterComplex({ ...baseArgs, outroWindow });
  assert.match(graph, /text='Thank you\nSubscribe for more'/);
});

test('outro is drawn after the logo overlay, on top of it', () => {
  const outroWindow = { enabled: true, startSec: 10, durationSec: 3, line1: 'Thanks', line2: '' };
  const graph = buildFilterComplex({ ...baseArgs, outroWindow, logoInputLabel: '3:v' });
  const overlayIndex = graph.indexOf('overlay=x=');
  const outroIndex = graph.indexOf('drawbox=x=0:y=0');
  assert.ok(overlayIndex >= 0 && outroIndex >= 0 && outroIndex > overlayIndex);
});

test('enabled outro hides the surah badge and channel logo once its window starts, so neither shows over the outro card', () => {
  const style = resolveStyle({ badges: { surahBadge: { enabled: true } } });
  const outroWindow = { enabled: true, startSec: 13, durationSec: 4, line1: 'JazakAllah Khair', line2: '' };
  const graph = buildFilterComplex({ ...baseArgs, style, outroWindow, logoInputLabel: '3:v' });

  const surahBadgeLine = graph.split(';').find((part) => part.includes('Al-Ikhlas'));
  assert.match(surahBadgeLine, /enable='lt\(t\\,13\.000\)'/);

  const logoLine = graph.split(';').find((part) => part.startsWith('[3:v]') === false && part.includes('overlay=x='));
  assert.match(logoLine, /enable='lt\(t\\,13\.000\)'/);
});

test('the arabic-transliteration surah badge variant hides both of its drawtext lines once the outro starts', () => {
  const style = resolveStyle({ badges: { surahBadge: { enabled: true, variant: 'arabic-transliteration' } } });
  const outroWindow = { enabled: true, startSec: 9, durationSec: 3, line1: 'Thanks', line2: '' };
  const surahBadgeText = { ...baseArgs.surahBadgeText, arabicName: 'الإخلاص' };
  const graph = buildFilterComplex({ ...baseArgs, style, outroWindow, surahBadgeText });

  const badgeLines = graph.split(';').filter((part) => part.includes('الإخلاص') || part.includes('Al-Ikhlas'));
  assert.equal(badgeLines.length, 2);
  for (const line of badgeLines) {
    assert.match(line, /enable='lt\(t\\,9\.000\)'/);
  }
});

test('no outro -> the surah badge and logo render with no enable gating at all', () => {
  const style = resolveStyle({ badges: { surahBadge: { enabled: true } } });
  const graph = buildFilterComplex({ ...baseArgs, style, outroWindow: undefined, logoInputLabel: '3:v' });

  const surahBadgeLine = graph.split(';').find((part) => part.includes('Al-Ikhlas'));
  assert.ok(!surahBadgeLine.includes('enable='));

  const logoLine = graph.split(';').find((part) => part.includes('overlay=x=') && !part.startsWith('[3:v]'));
  assert.ok(!logoLine.includes('enable='));
});

test('enabled intro adds a time-gated full-frame scrim, same as the outro, defaulting to 0.55', () => {
  const introWindow = { windowMs: 5000, showBismillahText: true, bismillahText: 'text', showIntroCard: false };
  const graph = buildFilterComplex({ ...baseArgs, introWindow, outroWindow: undefined });
  assert.match(graph, /drawbox=x=0:y=0:w=1280:h=720:color=0x000000@0\.55:t=fill:enable='lt\(t\\,5\.000\)'/);
});

test('intro overlay opacity is user-adjustable, not hardcoded', () => {
  const introWindow = { windowMs: 5000, showBismillahText: true, bismillahText: 'text', showIntroCard: false, overlayOpacity: 0.2 };
  const graph = buildFilterComplex({ ...baseArgs, introWindow, outroWindow: undefined });
  assert.match(graph, /drawbox=x=0:y=0:w=1280:h=720:color=0x000000@0\.2:t=fill:enable='lt\(t\\,5\.000\)'/);
});

test('with both an intro and an outro, the surah badge and logo only show in between the two windows', () => {
  const style = resolveStyle({ badges: { surahBadge: { enabled: true } } });
  const introWindow = { windowMs: 5000, showBismillahText: true, bismillahText: 'text', showIntroCard: false };
  const outroWindow = { enabled: true, startSec: 20, durationSec: 4, line1: 'Thanks', line2: '' };
  const graph = buildFilterComplex({ ...baseArgs, style, introWindow, outroWindow, logoInputLabel: '3:v' });

  const surahBadgeLine = graph.split(';').find((part) => part.includes('Al-Ikhlas'));
  assert.match(surahBadgeLine, /enable='gte\(t\\,5\.000\)\*lt\(t\\,20\.000\)'/);

  const logoLine = graph.split(';').find((part) => part.includes('overlay=x=') && !part.startsWith('[3:v]'));
  assert.match(logoLine, /enable='gte\(t\\,5\.000\)\*lt\(t\\,20\.000\)'/);
});

test('with an intro but no outro, the surah badge only shows after the intro window ends', () => {
  const style = resolveStyle({ badges: { surahBadge: { enabled: true } } });
  const introWindow = { windowMs: 5000, showBismillahText: true, bismillahText: 'text', showIntroCard: false };
  const graph = buildFilterComplex({ ...baseArgs, style, introWindow, outroWindow: undefined });

  const surahBadgeLine = graph.split(';').find((part) => part.includes('Al-Ikhlas'));
  assert.match(surahBadgeLine, /enable='gte\(t\\,5\.000\)'\[v\d+\]$/);
});
