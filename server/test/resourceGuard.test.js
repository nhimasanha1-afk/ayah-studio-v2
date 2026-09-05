import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkResolutionMemoryRequirement, MIN_TOTAL_MEMORY_BYTES_FOR_4K } from '../src/lib/resourceGuard.js';

const GB = 1024 * 1024 * 1024;

test('720p and 1080p are always ok, regardless of available memory', () => {
  assert.deepEqual(checkResolutionMemoryRequirement('720p', 1 * GB), { ok: true });
  assert.deepEqual(checkResolutionMemoryRequirement('1080p', 1 * GB), { ok: true });
});

test('4k is rejected with a clear error when memory is below the threshold (e.g. the real 1c-2g Render tier)', () => {
  const result = checkResolutionMemoryRequirement('4k', 2 * GB);
  assert.equal(result.ok, false);
  assert.match(result.error, /4K export needs a larger server plan/);
  assert.match(result.error, /2\.0GB RAM available/);
});

test('4k is allowed once memory is at or above the threshold', () => {
  assert.deepEqual(checkResolutionMemoryRequirement('4k', MIN_TOTAL_MEMORY_BYTES_FOR_4K), { ok: true });
  assert.deepEqual(checkResolutionMemoryRequirement('4k', 8 * GB), { ok: true });
});

test('4k is rejected right up to just under the threshold', () => {
  const result = checkResolutionMemoryRequirement('4k', MIN_TOTAL_MEMORY_BYTES_FOR_4K - 1);
  assert.equal(result.ok, false);
});
