import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildFilterComplex } from '../src/lib/videoComposition.js';
import { resolveStyle } from '../src/lib/styleConfig.js';
import { ffmpegPath } from '../src/lib/ffmpegBinaries.js';
import { FONTS_DIR } from '../src/lib/paths.js';

// Real production crash: a surah whose transliterated name starts with an
// apostrophe ("'Abasa", chapter 80) corrupted the whole filter_complex
// string and took down the export ("Option 'force_original_aspect_ratio'
// not found" / "Error initializing complex filters"). Root cause: no matter
// how a literal single quote was escaped inside a quoted drawtext text=
// value (backslash-quote, doubled quote, the shell-style '\'' trick), real
// FFmpeg either silently dropped the character or desynced its own
// quote-tracking badly enough to swallow every filter that followed in the
// same filter_complex string -- confirmed by direct, repeated testing
// against the real ffmpeg binary, not just log inspection. The fix routes
// all dynamic drawtext text through a temp file (textfile=) instead of an
// inline, escaped text= value, which sidesteps the whole class of bug.
//
// These tests run the ACTUAL generated filter graph through the real
// ffmpeg binary (not just asserting on the graph string), because the bug
// only manifested against ffmpeg's real filtergraph parser -- a
// string-shape check alone would have missed it, same as it missed the
// original bug.

const MINIMAL_ASS = `[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 240

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawtext-escaping-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Runs a real ffmpeg pass over the given filter graph and returns the completed process. */
function runGraph(graph, { withLogo = false } = {}) {
  const inputArgs = ['-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1'];
  if (withLogo) inputArgs.push('-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1');
  const args = [
    '-y',
    ...inputArgs,
    '-filter_complex', graph,
    '-map', '[vout]',
    '-frames:v', '1', '-update', '1',
    'out.png',
  ];
  return withTempDir((dir) => spawnSync(ffmpegPath, args, { cwd: dir, encoding: 'utf8' }));
}

function baseArgs(assPath) {
  return {
    style: resolveStyle(),
    assPath,
    fontsDir: FONTS_DIR,
    logoInputLabel: null,
    introWindow: { windowMs: 0 },
    outroWindow: undefined,
    backgroundInputLabel: '0:v',
    canvasWidth: 320,
    canvasHeight: 240,
    scaleFactor: 1,
    totalDurationSeconds: 5,
  };
}

test('a surah badge name with a leading apostrophe does not corrupt the filter graph (real ffmpeg)', () => {
  withTempDir((dir) => {
    const assPath = path.join(dir, 'captions.ass');
    fs.writeFileSync(assPath, MINIMAL_ASS, 'utf8');

    const style = resolveStyle({ badges: { surahBadge: { enabled: true } } });
    const graph = buildFilterComplex({
      ...baseArgs(assPath),
      style,
      surahBadgeText: { line1: "'Abasa", line2: 'He Frowned • 80' },
    });

    const res = runGraph(graph);
    assert.equal(res.status, 0, `ffmpeg failed to parse the filter graph:\n${res.stderr}`);
  });
});

test('a surah badge name with a leading apostrophe, immediately followed by a logo overlay, does not corrupt the graph (the exact production crash shape)', () => {
  withTempDir((dir) => {
    const assPath = path.join(dir, 'captions.ass');
    fs.writeFileSync(assPath, MINIMAL_ASS, 'utf8');

    const style = resolveStyle({ badges: { surahBadge: { enabled: true, variant: 'arabic-transliteration' } } });
    const graph = buildFilterComplex({
      ...baseArgs(assPath),
      style,
      surahBadgeText: { line1: "'Abasa", line2: 'He Frowned • 80', arabicName: 'عبس' },
      logoInputLabel: '1:v',
    });

    const res = runGraph(graph, { withLogo: true });
    assert.equal(res.status, 0, `ffmpeg failed to parse the filter graph:\n${res.stderr}`);
  });
});

test('drawtext text is embedded via textfile=, not an inline text= value', () => {
  withTempDir((dir) => {
    const assPath = path.join(dir, 'captions.ass');
    fs.writeFileSync(assPath, MINIMAL_ASS, 'utf8');

    const style = resolveStyle({ badges: { surahBadge: { enabled: true } } });
    const graph = buildFilterComplex({
      ...baseArgs(assPath),
      style,
      surahBadgeText: { line1: "'Abasa", line2: 'He Frowned • 80' },
    });

    const surahBadgeSegment = graph.split(';').find((part) => part.includes('textfile='));
    assert.ok(surahBadgeSegment, 'expected the surah badge drawtext to use textfile=');
    assert.ok(!graph.includes("text='"), 'no drawtext call should embed text inline anymore');

    const match = surahBadgeSegment.match(/textfile='([^']*)'/);
    const filePath = match[1].replace(/\\:/g, ':');
    assert.equal(fs.readFileSync(filePath, 'utf8'), "'Abasa • He Frowned • 80");
  });
});
