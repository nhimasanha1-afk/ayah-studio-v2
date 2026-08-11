import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ffmpegPath } from './ffmpegBinaries.js';

/**
 * Generates (and caches, per resolution) a single static placeholder
 * background image. This is a synthetic stand-in only -- the real curated
 * background clip library is used instead whenever a clip pool is
 * configured.
 */
export function ensureStaticBackground(backgroundsDir, width, height) {
  fs.mkdirSync(backgroundsDir, { recursive: true });
  const imagePath = path.join(backgroundsDir, `static-placeholder-${width}x${height}.png`);

  if (fs.existsSync(imagePath) && fs.statSync(imagePath).size > 0) {
    return imagePath;
  }

  execFileSync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', `gradients=s=${width}x${height}:c0=0x0b1f1a:c1=0x1c3d33:x0=0:y0=0:x1=${width}:y1=${height}`,
    '-frames:v', '1',
    imagePath,
  ]);

  return imagePath;
}
