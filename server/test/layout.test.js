import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCanvasDimensions,
  getScaleFactor,
  getPad,
  captionVerticalLayout,
  introTextY,
} from '../src/lib/layout.js';

test('getCanvasDimensions returns the 4 supported combos correctly', () => {
  assert.deepEqual(getCanvasDimensions('16:9', '720p'), { width: 1280, height: 720 });
  assert.deepEqual(getCanvasDimensions('16:9', '1080p'), { width: 1920, height: 1080 });
  assert.deepEqual(getCanvasDimensions('9:16', '720p'), { width: 720, height: 1280 });
  assert.deepEqual(getCanvasDimensions('9:16', '1080p'), { width: 1080, height: 1920 });
});

test('getCanvasDimensions rejects an unknown combo rather than silently guessing', () => {
  assert.throws(() => getCanvasDimensions('4:3', '720p'));
  assert.throws(() => getCanvasDimensions('16:9', '4k'));
});

test('every supported combo keeps the requested aspect ratio exactly', () => {
  const { width: w916, height: h916 } = getCanvasDimensions('9:16', '1080p');
  assert.equal(w916 / h916, 9 / 16);
  const { width: w169, height: h169 } = getCanvasDimensions('16:9', '1080p');
  assert.equal(w169 / h169, 16 / 9);
});

test('getScaleFactor: 1080p is exactly 1.5x 720p in linear scale (matches the real resolution ratio)', () => {
  assert.equal(getScaleFactor('720p'), 1);
  assert.equal(getScaleFactor('1080p'), 1.5);
  const dims720 = getCanvasDimensions('16:9', '720p');
  const dims1080 = getCanvasDimensions('16:9', '1080p');
  assert.equal(dims1080.width / dims720.width, getScaleFactor('1080p'));
  assert.equal(dims1080.height / dims720.height, getScaleFactor('1080p'));
});

test('getPad scales with the resolution scale factor', () => {
  assert.equal(getPad(1), 40);
  assert.equal(getPad(1.5), 60);
});

test('captionVerticalLayout: same textPosition mode looks proportionally identical across resolutions', () => {
  const at720 = captionVerticalLayout('center', 720);
  const at1080 = captionVerticalLayout('center', 1080);
  // 1080 height is exactly 1.5x 720 (both 16:9 heights), so pixel values should scale by 1.5 too.
  assert.equal(at1080.scrimTop, Math.round(at720.scrimTop * 1.5));
  assert.equal(at1080.scrimHeight, Math.round(at720.scrimHeight * 1.5));
  assert.equal(at1080.alignment, at720.alignment);
});

test('captionVerticalLayout: same fractions carry correctly to a tall 9:16 canvas', () => {
  const layout = captionVerticalLayout('center', 1280); // 9:16 @ 720p height
  // scrimTop fraction is 290/720; applied to height 1280 that's ~516.
  assert.equal(layout.scrimTop, Math.round((290 / 720) * 1280));
});

test('captionVerticalLayout falls back to center for an unrecognized value', () => {
  const fallback = captionVerticalLayout('nonsense', 720);
  const center = captionVerticalLayout('center', 720);
  assert.deepEqual(fallback, center);
});

test('introTextY scales with canvas height the same way as captionVerticalLayout', () => {
  assert.equal(introTextY('center', 720), 320);
  assert.equal(introTextY('center', 1080), Math.round((320 / 720) * 1080));
});
