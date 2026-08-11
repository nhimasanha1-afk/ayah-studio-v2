import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePlaybackOrder,
  planBackgroundSequence,
  sequenceDuration,
} from '../src/lib/backgroundSequence.js';

test('resolvePlaybackOrder: sequential returns the same order, unmodified copy', () => {
  const clips = ['a', 'b', 'c'];
  const result = resolvePlaybackOrder(clips, 'sequential');
  assert.deepEqual(result, ['a', 'b', 'c']);
  assert.notEqual(result, clips); // must be a copy, not the same array reference
});

test('resolvePlaybackOrder: shuffle is a permutation of the same clips', () => {
  const clips = ['a', 'b', 'c', 'd', 'e'];
  const result = resolvePlaybackOrder(clips, 'shuffle', () => 0.999999);
  assert.equal(result.length, clips.length);
  assert.deepEqual([...result].sort(), [...clips].sort());
});

test('resolvePlaybackOrder: shuffle is deterministic given the same injected random source', () => {
  const clips = ['a', 'b', 'c', 'd'];
  let calls = 0;
  const fixedSequence = [0.1, 0.9, 0.3];
  const random = () => fixedSequence[calls++ % fixedSequence.length];
  const r1 = resolvePlaybackOrder(clips, 'shuffle', () => fixedSequence[0]);
  // Re-run with a fresh identical generator to confirm same output for same inputs.
  const r2 = resolvePlaybackOrder(clips, 'shuffle', () => fixedSequence[0]);
  assert.deepEqual(r1, r2);
});

test('resolvePlaybackOrder: rejects an empty pool rather than silently producing nothing', () => {
  assert.throws(() => resolvePlaybackOrder([], 'sequential'));
});

test('resolvePlaybackOrder: rejects an unknown order value', () => {
  assert.throws(() => resolvePlaybackOrder(['a'], 'random-ish'));
});

test('planBackgroundSequence: a single clip long enough needs only one instance', () => {
  const instances = planBackgroundSequence({
    orderedClips: ['a'],
    totalDurationSeconds: 5,
    slotDurationSeconds: 6,
    transitionDurationSeconds: 1,
  });
  assert.equal(instances.length, 1);
  assert.equal(instances[0].clip, 'a');
});

test('planBackgroundSequence: covers the target duration, accounting for crossfade overlap (not simple addition)', () => {
  // slot=6, transition=1 -> each additional instance adds only 5s of *new* coverage.
  const instances = planBackgroundSequence({
    orderedClips: ['a', 'b'],
    totalDurationSeconds: 16,
    slotDurationSeconds: 6,
    transitionDurationSeconds: 1,
  });
  const covered = sequenceDuration(instances.length, 6, 1);
  assert.ok(covered >= 16, `expected coverage >= 16, got ${covered}`);
  // One fewer instance must NOT be enough, proving the count is tight, not padded.
  const shortfall = sequenceDuration(instances.length - 1, 6, 1);
  assert.ok(shortfall < 16, `expected ${instances.length - 1} instances to fall short of 16, got ${shortfall}`);
});

test('planBackgroundSequence: cycles back through a short pool rather than running out of clips', () => {
  const instances = planBackgroundSequence({
    orderedClips: ['a', 'b'],
    totalDurationSeconds: 30,
    slotDurationSeconds: 6,
    transitionDurationSeconds: 1,
  });
  assert.ok(instances.length > 2, 'expected the 2-clip pool to be cycled more than once');
  assert.equal(instances[0].clip, 'a');
  assert.equal(instances[1].clip, 'b');
  assert.equal(instances[2].clip, 'a'); // cycled back to the start
});

test('planBackgroundSequence: zero duration produces no instances', () => {
  const instances = planBackgroundSequence({
    orderedClips: ['a'],
    totalDurationSeconds: 0,
    slotDurationSeconds: 6,
    transitionDurationSeconds: 1,
  });
  assert.deepEqual(instances, []);
});

test('planBackgroundSequence: rejects a transition duration that is not shorter than the slot', () => {
  assert.throws(() =>
    planBackgroundSequence({
      orderedClips: ['a'],
      totalDurationSeconds: 10,
      slotDurationSeconds: 3,
      transitionDurationSeconds: 3,
    })
  );
});

test('sequenceDuration matches the sum a human would expect for 3 instances', () => {
  // 3 clips of 6s each, overlapping by 1s between consecutive ones:
  // 6 + (6-1) + (6-1) = 16
  assert.equal(sequenceDuration(3, 6, 1), 16);
});
