import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ffmpegPath } from './ffmpegBinaries.js';
import { escapeForDrawtextPath } from './filterPath.js';

const PLACEHOLDER_SIZE = 200;

/**
 * Generates (and caches) a synthetic monogram logo. No real upload flow
 * exists yet -- this stands in for a user-uploaded channel logo so the
 * position/size/shape style options are genuinely testable.
 */
export function ensurePlaceholderLogo(assetsDir, fontsDir) {
  fs.mkdirSync(assetsDir, { recursive: true });
  const logoPath = path.join(assetsDir, `placeholder-logo-${PLACEHOLDER_SIZE}.png`);

  if (fs.existsSync(logoPath) && fs.statSync(logoPath).size > 0) {
    return logoPath;
  }

  const font = escapeForDrawtextPath(path.join(fontsDir, 'Inter-Regular.ttf'));
  execFileSync(ffmpegPath, [
    '-y',
    '-f', 'lavfi', '-i', `color=c=0xB8860B:s=${PLACEHOLDER_SIZE}x${PLACEHOLDER_SIZE}`,
    '-vf', `drawtext=fontfile='${font}':text='A':fontsize=100:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-6`,
    '-frames:v', '1',
    logoPath,
  ]);

  return logoPath;
}

/** geq alpha-channel expression that masks a size x size square into the given shape. Null for 'square' (no mask needed). */
export function logoMaskAlphaExpr(shape, size) {
  if (shape === 'square') return null;

  if (shape === 'circle') {
    const r = size / 2;
    return `if(lte(hypot(X-${r}\\,Y-${r})\\,${r})\\,255\\,0)`;
  }

  if (shape === 'rounded') {
    const r = Math.round(size * 0.18);
    const w = size;
    const h = size;
    return (
      `if(lt(X\\,${r})*lt(Y\\,${r})\\,if(lte(hypot(${r}-X\\,${r}-Y)\\,${r})\\,255\\,0)\\,` +
      `if(gt(X\\,${w - r})*lt(Y\\,${r})\\,if(lte(hypot(X-${w - r}\\,${r}-Y)\\,${r})\\,255\\,0)\\,` +
      `if(lt(X\\,${r})*gt(Y\\,${h - r})\\,if(lte(hypot(${r}-X\\,Y-${h - r})\\,${r})\\,255\\,0)\\,` +
      `if(gt(X\\,${w - r})*gt(Y\\,${h - r})\\,if(lte(hypot(X-${w - r}\\,Y-${h - r})\\,${r})\\,255\\,0)\\,255))))`
    );
  }

  throw new Error(`Unknown logo shape: ${shape}`);
}
