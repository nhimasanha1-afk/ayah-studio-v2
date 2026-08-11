import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoFilterExpr, blurFilterExpr, zoomPanFilterExpr } from '../src/lib/backgroundEffects.js';

test('videoFilterExpr returns null for "none" and undefined', () => {
  assert.equal(videoFilterExpr('none'), null);
  assert.equal(videoFilterExpr(undefined), null);
});

test('videoFilterExpr returns a real filter string for each known preset', () => {
  for (const name of ['grayscale', 'sepia', 'warm', 'cool', 'vintage']) {
    const expr = videoFilterExpr(name);
    assert.ok(typeof expr === 'string' && expr.length > 0, `expected a filter string for ${name}`);
  }
});

test('videoFilterExpr rejects an unknown preset rather than silently ignoring it', () => {
  assert.throws(() => videoFilterExpr('instagram-clarendon'));
});

test('blurFilterExpr returns null for 0 or falsy amounts', () => {
  assert.equal(blurFilterExpr(0), null);
  assert.equal(blurFilterExpr(undefined), null);
  assert.equal(blurFilterExpr(null), null);
});

test('blurFilterExpr scales sigma with the requested amount', () => {
  assert.equal(blurFilterExpr(5), 'gblur=sigma=5');
  assert.equal(blurFilterExpr(12), 'gblur=sigma=12');
});

test('zoomPanFilterExpr returns null for "none"', () => {
  assert.equal(zoomPanFilterExpr('none', 1280, 720, 13), null);
  assert.equal(zoomPanFilterExpr(undefined, 1280, 720, 13), null);
});

test('zoomPanFilterExpr rejects an unknown style', () => {
  assert.throws(() => zoomPanFilterExpr('spin', 1280, 720, 13));
});

test('zoomPanFilterExpr uses the output frame counter (on), not a self-referencing accumulator', () => {
  // The self-referencing `zoom+RATE` form was verified NOT to animate in
  // this ffmpeg build; the expression must be on-based to actually work.
  const expr = zoomPanFilterExpr('zoom-in', 1280, 720, 13);
  assert.match(expr, /1\+[\d.]+\*on/);
  assert.doesNotMatch(expr, /zoom\+/);
});

test('zoomPanFilterExpr embeds the real target canvas dimensions', () => {
  const expr = zoomPanFilterExpr('zoom-in', 1920, 1080, 13);
  assert.match(expr, /s=1920x1080/);
});

test('zoomPanFilterExpr: zoom-in and zoom-out are mirror images of each other', () => {
  const zoomIn = zoomPanFilterExpr('zoom-in', 1280, 720, 10);
  const zoomOut = zoomPanFilterExpr('zoom-out', 1280, 720, 10);
  assert.match(zoomIn, /min\(1\+/);
  assert.match(zoomOut, /max\(1\.3-/);
});

test('zoomPanFilterExpr: pan-left starts at the right edge and ends at the left (inverse of pan-right)', () => {
  const panLeft = zoomPanFilterExpr('pan-left', 1280, 720, 10);
  const panRight = zoomPanFilterExpr('pan-right', 1280, 720, 10);
  assert.match(panLeft, /\(1-on\//);
  assert.match(panRight, /\(on\//);
});

test('zoomPanFilterExpr scales total frame count with duration (25fps)', () => {
  const short = zoomPanFilterExpr('pan-right', 1280, 720, 2);
  const long = zoomPanFilterExpr('pan-right', 1280, 720, 20);
  // 2s -> 50 frames, 20s -> 500 frames
  assert.match(short, /on\/50\)/);
  assert.match(long, /on\/500\)/);
});
