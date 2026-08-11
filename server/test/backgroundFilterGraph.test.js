import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackgroundFilterGraph, TRANSITION_STYLES } from '../src/lib/backgroundFilterGraph.js';

const baseArgs = {
  instances: [{ clip: 'a' }, { clip: 'b' }],
  slotDurationSeconds: 8,
  transitionDurationSeconds: 1,
  canvasWidth: 1280,
  canvasHeight: 720,
};

test('defaults to a fade transition when none is specified', () => {
  const { filterParts } = buildBackgroundFilterGraph(baseArgs);
  assert.ok(filterParts.some((p) => p.includes('xfade=transition=fade:')));
});

test('uses the requested transitionStyle in the xfade filter', () => {
  const { filterParts } = buildBackgroundFilterGraph({ ...baseArgs, transitionStyle: 'wipeleft' });
  assert.ok(filterParts.some((p) => p.includes('xfade=transition=wipeleft:')));
});

test('every documented transition style produces a valid graph', () => {
  for (const transitionStyle of TRANSITION_STYLES) {
    const { filterParts } = buildBackgroundFilterGraph({ ...baseArgs, transitionStyle });
    assert.ok(filterParts.some((p) => p.includes(`xfade=transition=${transitionStyle}:`)));
  }
});

test('rejects an unknown transitionStyle rather than silently falling back', () => {
  assert.throws(() => buildBackgroundFilterGraph({ ...baseArgs, transitionStyle: 'implode' }));
});

test('single instance never needs a transition -- transitionStyle is irrelevant', () => {
  const { filterParts, outputLabel } = buildBackgroundFilterGraph({
    ...baseArgs,
    instances: [{ clip: 'a' }],
    transitionStyle: 'wipeleft',
  });
  assert.equal(outputLabel, 'bgraw');
  assert.ok(!filterParts.some((p) => p.includes('xfade')));
});
