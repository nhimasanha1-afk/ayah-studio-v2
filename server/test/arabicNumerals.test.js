import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toArabicIndicNumerals } from '../src/lib/arabicNumerals.js';

test('converts single digits', () => {
  assert.equal(toArabicIndicNumerals(0), '٠');
  assert.equal(toArabicIndicNumerals(3), '٣');
  assert.equal(toArabicIndicNumerals(9), '٩');
});

test('converts multi-digit numbers digit-by-digit, preserving order', () => {
  assert.equal(toArabicIndicNumerals(112), '١١٢');
  assert.equal(toArabicIndicNumerals(286), '٢٨٦');
});

test('accepts a string input the same way', () => {
  assert.equal(toArabicIndicNumerals('7'), '٧');
});
