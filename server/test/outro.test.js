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
