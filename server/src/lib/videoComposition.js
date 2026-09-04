import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hexToFfmpegColor } from './colorUtils.js';
import { captionVerticalLayout, drawtextPositionExpr, overlayPositionExpr, introTextY, getPad } from './layout.js';
import { escapeForFilter, escapeForDrawtextPath } from './filterPath.js';
import { FONT_REGISTRY } from './styleConfig.js';
import { logoMaskAlphaExpr } from './channelLogo.js';
import { videoFilterExpr, blurFilterExpr, zoomPanFilterExpr } from './backgroundEffects.js';

function fontFilePath(fontsDir, bucket, key) {
  return path.join(fontsDir, FONT_REGISTRY[bucket][key].file);
}

/**
 * Writes text to a temp file and returns a ready-to-embed `textfile='...'`
 * drawtext argument, instead of a `text='...'` value needing its own
 * escaping. Confirmed via direct testing that FFmpeg's filtergraph escaping
 * for a literal apostrophe inside a quoted text= value is unreliable: a
 * leading or mid-string apostrophe (`\'`, doubled `''`, or the shell-style
 * `'\''` trick) either gets silently dropped or desyncs the parser's
 * quote-tracking badly enough to corrupt every filter that follows in the
 * same filter_complex string -- confirmed as the real cause of a production
 * crash on a surah whose transliterated name starts with one ("'Abasa").
 * Reading from a file sidesteps text-value escaping entirely; only the file
 * PATH needs escaping (colons), which escapeForDrawtextPath already
 * handles reliably. Callers should collect the returned path into their own
 * list and delete it once the export finishes (see surahExport.js).
 */
function textFileArg(text, tmpDir, tempFiles) {
  const filePath = path.join(tmpDir, `drawtext-${randomUUID()}.txt`);
  fs.writeFileSync(filePath, text, 'utf8');
  tempFiles.push(filePath);
  return `textfile='${escapeForDrawtextPath(filePath)}'`;
}

/**
 * Scales a secondary input (an intro/outro card's own background image or
 * video, resolved separately by surahExport.js) to fully cover the canvas
 * -- "cover" fit via increase+crop, same approach as the channel logo --
 * then overlays it on top of `current`, gated to the given time window so
 * it's only visible while that window is active. Drawn early in its
 * window's own block (before the window's text), so the text still ends up
 * on top of it.
 */
function overlayCardBackground(current, mediaInputLabel, canvasWidth, canvasHeight, enableExpr, nextLabel, parts) {
  const scaledLabel = nextLabel();
  parts.push(
    `[${mediaInputLabel}]scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=increase,crop=${canvasWidth}:${canvasHeight}[${scaledLabel}]`
  );
  const out = nextLabel();
  parts.push(`[${current}][${scaledLabel}]overlay=x=0:y=0:enable='${enableExpr}'[${out}]`);
  return out;
}

/**
 * Builds the full -filter_complex graph: scrim -> word-synced subtitles ->
 * intro-window overlay (Bismillah text / intro card, time-gated to
 * [0, windowMs)) -> watermark -> surah badge -> channel name badge ->
 * channel logo overlay. Each stage is skipped entirely when its style
 * toggle is off, so the graph shape reflects exactly what's enabled.
 *
 * canvasWidth/canvasHeight/scaleFactor come from the chosen resolution and
 * aspect ratio (see layout.js) -- every pixel value below is computed
 * against them rather than assuming a fixed 1280x720 frame.
 */
export function buildFilterComplex({
  style,
  assPath,
  fontsDir,
  surahBadgeText,
  logoInputLabel,
  introWindow,
  outroWindow,
  introBackgroundInputLabel,
  outroBackgroundInputLabel,
  backgroundInputLabel = '0:v',
  canvasWidth,
  canvasHeight,
  scaleFactor = 1,
  totalDurationSeconds,
  // Defaults keep this usable from tests/callers that don't care about
  // cleanup; a real export passes its own TMP_DIR and array so the temp
  // text files can be deleted once the render finishes (see surahExport.js).
  tmpDir = os.tmpdir(),
  tempFiles = [],
}) {
  const parts = [];
  let current = backgroundInputLabel;
  let counter = 0;
  const nextLabel = () => `v${counter++}`;
  const textFile = (text) => textFileArg(text, tmpDir, tempFiles);
  const latinFontPath = escapeForDrawtextPath(fontFilePath(fontsDir, 'latin', style.typography.latinFont));
  const arabicFontPath = escapeForDrawtextPath(fontFilePath(fontsDir, 'arabic', style.typography.arabicFont));
  const pad = getPad(scaleFactor);
  const scaled = (px) => Math.round(px * scaleFactor);

  // Background-only effects (color look, blur, Ken Burns zoom/pan) run
  // before anything else is composited on top, so text/badges are never
  // blurred or zoomed along with the footage.
  for (const filterExpr of [
    videoFilterExpr(style.colors.videoFilter),
    blurFilterExpr(style.colors.backgroundBlur),
    zoomPanFilterExpr(style.colors.backgroundZoomPan, canvasWidth, canvasHeight, totalDurationSeconds),
  ]) {
    if (!filterExpr) continue;
    const out = nextLabel();
    parts.push(`[${current}]${filterExpr}[${out}]`);
    current = out;
  }

  if (style.colors.scrim.enabled) {
    const { scrimTop, scrimHeight } = captionVerticalLayout(
      style.colors.textPosition,
      canvasHeight,
      style.colors.scrim.heightScale ?? 1
    );
    const color = hexToFfmpegColor(style.colors.scrim.color, style.colors.scrim.opacity);
    const out = nextLabel();
    parts.push(
      `[${current}]drawbox=x=${pad}:y=${scrimTop}:w=${canvasWidth - 2 * pad}:h=${scrimHeight}:color=${color}:t=fill[${out}]`
    );
    current = out;
  }

  {
    const out = nextLabel();
    parts.push(`[${current}]subtitles=${escapeForFilter(assPath)}:fontsdir=${escapeForFilter(fontsDir)}[${out}]`);
    current = out;
  }

  if (introWindow && introWindow.windowMs > 0) {
    const windowSec = (introWindow.windowMs / 1000).toFixed(3);
    const enable = `lt(t\\,${windowSec})`;
    const y = introTextY(style.colors.textPosition, canvasHeight);

    if (introBackgroundInputLabel) {
      current = overlayCardBackground(current, introBackgroundInputLabel, canvasWidth, canvasHeight, enable, nextLabel, parts);
    }

    // Same adjustable darkening scrim as the outro's, drawn full-frame over
    // whatever's showing during the window (the custom card background
    // above, or the main rotation if none is set) so the intro text stays
    // readable regardless of how bright that background is.
    {
      const introScrimColor = hexToFfmpegColor('#000000', introWindow.overlayOpacity ?? 0.55);
      const scrimOut = nextLabel();
      parts.push(
        `[${current}]drawbox=x=0:y=0:w=${canvasWidth}:h=${canvasHeight}:color=${introScrimColor}:t=fill:enable='${enable}'[${scrimOut}]`
      );
      current = scrimOut;
    }

    if (introWindow.showBismillahText) {
      const arabicColor = hexToFfmpegColor(style.colors.arabicTextColor);
      const out = nextLabel();
      parts.push(
        `[${current}]drawtext=fontfile='${arabicFontPath}':${textFile(introWindow.bismillahText)}:fontsize=${scaled(style.typography.arabicFontSize)}:fontcolor=${arabicColor}:borderw=${scaled(2)}:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='${enable}'[${out}]`
      );
      current = out;
    }

    if (introWindow.showIntroCard) {
      const cardY = Math.max(pad, y - scaled(170));
      const out = nextLabel();
      parts.push(
        `[${current}]drawtext=fontfile='${latinFontPath}':${textFile(`${introWindow.cardText.line1}\n${introWindow.cardText.line2}`)}:fontsize=${scaled(30)}:fontcolor=white:x=(w-text_w)/2:y=${cardY}:line_spacing=${scaled(10)}:box=1:boxcolor=0x00000099:boxborderw=${scaled(20)}:enable='${enable}'[${out}]`
      );
      current = out;
    }
  }

  if (style.badges.watermark.enabled && style.badges.watermark.text) {
    const { x, y } = drawtextPositionExpr(style.badges.watermark.position, scaleFactor);
    const color = hexToFfmpegColor(style.badges.watermark.color, style.badges.watermark.opacity);
    const out = nextLabel();
    parts.push(
      `[${current}]drawtext=fontfile='${latinFontPath}':${textFile(style.badges.watermark.text)}:fontsize=${scaled(style.badges.watermark.fontSize)}:fontcolor=${color}:x=${x}:y=${y}[${out}]`
    );
    current = out;
  }

  // The surah badge and channel logo are meant to identify the recitation
  // while it's actually playing -- during the intro or outro card they'd
  // just be sitting there dimly visible under that window's own scrim, so
  // both are gated to only show in between: after the intro window ends and
  // before the outro window starts, and also gates the channel name badge
  // below (confirmed report: the channel name was still showing over both
  // the intro and outro cards).
  const hasIntro = Boolean(introWindow && introWindow.windowMs > 0);
  const hasOutro = Boolean(outroWindow && outroWindow.enabled && outroWindow.durationSec > 0);
  const introEndSec = hasIntro ? (introWindow.windowMs / 1000).toFixed(3) : null;
  const outroStartSec = hasOutro ? outroWindow.startSec.toFixed(3) : null;
  const badgeVisibilityGate =
    hasIntro && hasOutro
      ? `:enable='gte(t\\,${introEndSec})*lt(t\\,${outroStartSec})'`
      : hasIntro
        ? `:enable='gte(t\\,${introEndSec})'`
        : hasOutro
          ? `:enable='lt(t\\,${outroStartSec})'`
          : '';

  if (style.badges.surahBadge.enabled && style.badges.surahBadge.variant === 'arabic-transliteration') {
    // Two separate drawtext calls, not one two-line block: the Arabic name
    // needs the Arabic font and the transliteration needs the Latin font,
    // and a single drawtext call only has one fontfile. Both stacked lines
    // reuse the same x expression as drawtextPositionExpr's single-line
    // case, so each line independently centers/left/right-aligns on its
    // own text_w exactly like normal -- only y differs between them.
    // Vertical placement is computed from known font sizes rather than
    // referencing the other line's runtime text_h (ffmpeg can't do that
    // across separate filter instances), the same pragmatic approach the
    // intro card above already uses for its own fixed vertical offset.
    const { x, y: topY } = drawtextPositionExpr(style.badges.surahBadge.position, scaleFactor);
    const arabicFontSize = scaled(style.badges.surahBadge.fontSize + 6);
    const translitFontSize = scaled(style.badges.surahBadge.fontSize);
    const lineGap = scaled(4);
    const arabicLineHeight = Math.round(arabicFontSize * 1.3);
    const translitLineHeight = Math.round(translitFontSize * 1.3);
    const isBottom = style.badges.surahBadge.position.startsWith('bottom');

    const arabicY = isBottom ? `h-${arabicLineHeight + lineGap + translitLineHeight}-${pad}` : `${topY}`;
    const translitY = isBottom ? `h-${translitLineHeight}-${pad}` : `${topY}+${arabicLineHeight + lineGap}`;

    const arabicOut = nextLabel();
    parts.push(
      `[${current}]drawtext=fontfile='${arabicFontPath}':${textFile(surahBadgeText.arabicName)}:fontsize=${arabicFontSize}:fontcolor=white:x=${x}:y=${arabicY}${badgeVisibilityGate}[${arabicOut}]`
    );
    current = arabicOut;

    const translitOut = nextLabel();
    parts.push(
      `[${current}]drawtext=fontfile='${latinFontPath}':${textFile(surahBadgeText.line1)}:fontsize=${translitFontSize}:fontcolor=white:x=${x}:y=${translitY}${badgeVisibilityGate}[${translitOut}]`
    );
    current = translitOut;
  } else if (style.badges.surahBadge.enabled) {
    const { x, y } = drawtextPositionExpr(style.badges.surahBadge.position, scaleFactor);
    const isStacked = style.badges.surahBadge.variant === 'stacked-title-card';
    const text = isStacked
      ? `${surahBadgeText.line1}\n${surahBadgeText.line2}`
      : `${surahBadgeText.line1} • ${surahBadgeText.line2}`;
    const boxOpt = isStacked ? `:box=1:boxcolor=0x00000099:boxborderw=${scaled(18)}` : '';
    const out = nextLabel();
    parts.push(
      `[${current}]drawtext=fontfile='${latinFontPath}':${textFile(text)}:fontsize=${scaled(style.badges.surahBadge.fontSize)}:fontcolor=white:x=${x}:y=${y}:line_spacing=${scaled(8)}${boxOpt}${badgeVisibilityGate}[${out}]`
    );
    current = out;
  }

  if (style.badges.channelNameBadge.enabled && style.badges.channelNameBadge.text) {
    const { x, y } = drawtextPositionExpr(style.badges.channelNameBadge.position, scaleFactor);
    const out = nextLabel();
    parts.push(
      `[${current}]drawtext=fontfile='${latinFontPath}':${textFile(style.badges.channelNameBadge.text)}:fontsize=${scaled(style.badges.channelNameBadge.fontSize)}:fontcolor=white:x=${x}:y=${y}${badgeVisibilityGate}[${out}]`
    );
    current = out;
  }

  if (logoInputLabel) {
    const size = scaled(style.badges.channelLogo.size);
    const { x, y } = overlayPositionExpr(style.badges.channelLogo.position, size, scaleFactor);
    const maskExpr = logoMaskAlphaExpr(style.badges.channelLogo.shape, size);
    // force_original_aspect_ratio=increase + crop: a "cover" fit so a
    // non-square uploaded logo fills the size x size square without being
    // squashed. The placeholder logo happens to already be square, but a
    // real uploaded image (task: channel logo upload) usually isn't.
    const scaledLabel = nextLabel();
    parts.push(
      `[${logoInputLabel}]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}[${scaledLabel}]`
    );

    let logoLabel = scaledLabel;
    if (maskExpr) {
      const maskedLabel = nextLabel();
      parts.push(`[${scaledLabel}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${maskExpr}'[${maskedLabel}]`);
      logoLabel = maskedLabel;
    }

    const logoOut = nextLabel();
    parts.push(`[${current}][${logoLabel}]overlay=x=${x}:y=${y}${badgeVisibilityGate}[${logoOut}]`);
    current = logoOut;
  }

  // Outro card: drawn last so it sits on top of everything else (badges,
  // logo included), time-gated to the fixed block of extra time appended
  // after the main content by runSurahExport's totalDurationSeconds calc.
  if (outroWindow && outroWindow.enabled && outroWindow.durationSec > 0) {
    const enable = `gte(t\\,${outroWindow.startSec.toFixed(3)})`;

    if (outroBackgroundInputLabel) {
      current = overlayCardBackground(current, outroBackgroundInputLabel, canvasWidth, canvasHeight, enable, nextLabel, parts);
    }

    const scrimColor = hexToFfmpegColor('#000000', outroWindow.overlayOpacity ?? 0.55);
    const scrimOut = nextLabel();
    parts.push(
      `[${current}]drawbox=x=0:y=0:w=${canvasWidth}:h=${canvasHeight}:color=${scrimColor}:t=fill:enable='${enable}'[${scrimOut}]`
    );
    current = scrimOut;

    const text = [outroWindow.line1, outroWindow.line2].filter(Boolean).join('\n');
    const textOut = nextLabel();
    parts.push(
      `[${current}]drawtext=fontfile='${latinFontPath}':${textFile(text)}:fontsize=${scaled(34)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=${scaled(12)}:enable='${enable}'[${textOut}]`
    );
    current = textOut;
  }

  parts.push(`[${current}]null[vout]`);

  return parts.join(';');
}

/**
 * Builds the audio side of the graph. With no intro window and no sync
 * offset, the main recitation audio is used as-is. With a window, the main
 * audio is delayed to start at windowMs (silence before it), and --
 * concurrently, not sequentially -- the Bismillah clip (if enabled) plays
 * from t=0 mixed against that same delayed track rather than being
 * appended before it.
 *
 * audioSyncOffsetMs shifts ONLY the main recitation audio relative to the
 * caption/video timeline -- captions are computed independently and never
 * move because of this. Positive delays it further (adelay); negative
 * pulls it earlier by trimming that much off the start of the audio
 * (atrim), since adelay can't express a negative delay. This is the fix
 * for the "offset wired to state but never touched real playback" bug the
 * project brief calls out -- the physical audio samples move, not just a
 * caption timestamp.
 *
 * volumeMultiplier (1 = unchanged) applies only to the main recitation,
 * same scope as the sync offset -- Bismillah audio is left at its own
 * natural level.
 */
export function buildAudioFilterComplex({
  mainAudioInputLabel,
  bismillahAudioInputLabel,
  introWindow,
  audioSyncOffsetMs = 0,
  volumeMultiplier = 1,
}) {
  const windowMs = introWindow?.windowMs ?? 0;
  const mainDelayMs = Math.round(windowMs + audioSyncOffsetMs);
  const hasVolumeChange = volumeMultiplier !== 1;

  if (mainDelayMs === 0 && !hasVolumeChange && !bismillahAudioInputLabel) {
    return { audioFilterParts: [], audioOutLabel: mainAudioInputLabel };
  }

  const parts = [];
  let mainAudioLabel = mainAudioInputLabel;

  if (mainDelayMs > 0) {
    parts.push(`[${mainAudioInputLabel}]adelay=${mainDelayMs}:all=1[mainDelayed]`);
    mainAudioLabel = 'mainDelayed';
  } else if (mainDelayMs < 0) {
    const trimSeconds = (-mainDelayMs / 1000).toFixed(3);
    parts.push(`[${mainAudioInputLabel}]atrim=start=${trimSeconds},asetpts=PTS-STARTPTS[mainDelayed]`);
    mainAudioLabel = 'mainDelayed';
  }

  if (hasVolumeChange) {
    parts.push(`[${mainAudioLabel}]volume=${volumeMultiplier}[mainSynced]`);
    mainAudioLabel = 'mainSynced';
  }

  if (bismillahAudioInputLabel) {
    parts.push(`[${bismillahAudioInputLabel}]adelay=0:all=1[introDelayed]`);
    parts.push(`[introDelayed][${mainAudioLabel}]amix=inputs=2:duration=longest:normalize=0[aout]`);
    return { audioFilterParts: parts, audioOutLabel: 'aout' };
  }

  return { audioFilterParts: parts, audioOutLabel: mainAudioLabel };
}
